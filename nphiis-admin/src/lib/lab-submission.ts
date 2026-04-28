// Builds the FHIR resources that get POSTed when a lab result is submitted.
// Mirrors the mobile app's `ScreenerViewModel.completeLabAssessment` logic
// (nphiis/src/main/java/com/icl/surveillance/viewmodels/ScreenerViewModel.kt):
// for each submission we emit a transaction Bundle containing
//   - one Encounter
//   - one QuestionnaireResponse
//   - one Observation per answered item
// All three are stamped with a managingLocation meta tag + source extension so
// downstream analytics can filter by facility, and authored/performed by the
// submitting Practitioner when we know who that is.

import {
  type AnswerMap,
  type LabFormDefinition,
  type QuestionnaireItem,
  type QuestionnaireAnswerOption,
  flattenItems,
  indexItems,
  isHidden,
  isItemEnabled,
  dateMaxIsToday,
  dateMinFromLinkId,
  constraintHuman,
  minLength,
  maxLength,
  csvHeaderFor,
  labelFor,
} from "./questionnaires";

/* ── EPID → form inference ───────────────────────────────────────────────── */

/**
 * Pull the disease token out of an EPID. Format from the mobile app is
 * `KEN-<county>-<subcounty>-<year>-<disease>-<seq>` (sometimes the disease
 * has a trailing space, e.g. "VL "). Returns the uppercased disease or
 * null when the string isn't shaped like an EPID.
 */
export function inferDiseaseFromEpid(epid: string): string | null {
  const parts = epid.trim().split("-");
  if (parts.length < 5) return null;
  const disease = parts[4].trim();
  return disease ? disease.toUpperCase() : null;
}

/**
 * Lab-form IDs that match a given disease, in preferred order. The first
 * accessible form (after intersecting with the user's role) is what the UI
 * auto-selects on EPID verification.
 */
export function formsForDisease(disease: string | null): string[] {
  if (!disease) return [];
  switch (disease) {
    case "MEA":
      return ["measles-lab-results", "measles-lab-reg-results"];
    case "AFP":
      return [
        "afp-stool-lab-results",
        "afp-itd-lab",
        "afp-final-lab-results",
      ];
    case "VL":
      return ["vl-case-lab-information"];
    default:
      // MPOVAC / MPO / Mpox / MOH505 / SOC / RCC / RTT have no dedicated
      // lab-results form yet.
      return [];
  }
}

/* ── Errors ──────────────────────────────────────────────────────────────── */

export class RowMappingError extends Error {
  constructor(message: string, public column?: string) {
    super(message);
    this.name = "RowMappingError";
  }
}

/* ── Answer coercion (CSV / form value → FHIR answer value) ─────────────── */

interface CoercedAnswer {
  /** The FHIR answer.value{X} field as a JSON blob. */
  fhir: Record<string, unknown>;
  /** The raw value used by enableWhen evaluation (coding code, "true"/"false", iso date, etc.). */
  normalised: string;
  /** Display string for Observation.valueString fallback and logs. */
  display: string;
}

function parseDate(raw: string, headerForErrors: string): string {
  // Accept ISO yyyy-mm-dd or dd/mm/yyyy (mobile's entryFormat is d/M/y).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  throw new RowMappingError(`Invalid date "${raw}"`, headerForErrors);
}

function findChoice(
  item: QuestionnaireItem,
  raw: string,
): QuestionnaireAnswerOption | undefined {
  const needle = raw.trim().toLowerCase();
  return item.answerOption?.find(
    (o) =>
      o.valueCoding?.code?.toLowerCase() === needle ||
      o.valueCoding?.display?.toLowerCase() === needle ||
      o.valueString?.toLowerCase() === needle,
  );
}

function coerce(
  item: QuestionnaireItem,
  raw: string,
  headerForErrors: string,
): CoercedAnswer {
  const trimmed = raw.trim();
  switch (item.type) {
    case "date":
    case "dateTime": {
      const iso = parseDate(trimmed, headerForErrors);
      if (dateMaxIsToday(item)) {
        const today = new Date().toISOString().slice(0, 10);
        if (iso > today) {
          throw new RowMappingError(
            `Date cannot be in the future`,
            headerForErrors,
          );
        }
      }
      return {
        fhir: { valueDate: iso },
        normalised: iso,
        display: iso,
      };
    }
    case "integer": {
      const n = Number.parseInt(trimmed, 10);
      if (Number.isNaN(n))
        throw new RowMappingError(`Invalid integer "${trimmed}"`, headerForErrors);
      return { fhir: { valueInteger: n }, normalised: String(n), display: String(n) };
    }
    case "decimal":
    case "quantity": {
      const n = Number.parseFloat(trimmed);
      if (Number.isNaN(n))
        throw new RowMappingError(`Invalid number "${trimmed}"`, headerForErrors);
      return { fhir: { valueDecimal: n }, normalised: String(n), display: String(n) };
    }
    case "boolean": {
      const t = trimmed.toLowerCase();
      if (["true", "yes", "y", "1"].includes(t))
        return { fhir: { valueBoolean: true }, normalised: "true", display: "Yes" };
      if (["false", "no", "n", "0"].includes(t))
        return { fhir: { valueBoolean: false }, normalised: "false", display: "No" };
      throw new RowMappingError(`Invalid boolean "${trimmed}"`, headerForErrors);
    }
    case "choice":
    case "open-choice": {
      const match = findChoice(item, trimmed);
      if (match?.valueCoding) {
        const c = match.valueCoding;
        return {
          fhir: {
            valueCoding: {
              code: c.code,
              display: c.display,
              ...(c.system ? { system: c.system } : {}),
            },
          },
          normalised: c.code,
          display: c.display,
        };
      }
      if (item.type === "open-choice") {
        return {
          fhir: { valueString: trimmed },
          normalised: trimmed,
          display: trimmed,
        };
      }
      throw new RowMappingError(
        `Value "${trimmed}" is not a valid option`,
        headerForErrors,
      );
    }
    case "string":
    case "text":
    default: {
      const minL = minLength(item);
      const maxL = maxLength(item);
      if (minL !== undefined && trimmed.length < minL)
        throw new RowMappingError(
          `Must be at least ${minL} characters`,
          headerForErrors,
        );
      if (maxL !== undefined && trimmed.length > maxL)
        throw new RowMappingError(
          `Must be at most ${maxL} characters`,
          headerForErrors,
        );
      return {
        fhir: { valueString: trimmed },
        normalised: trimmed,
        display: trimmed,
      };
    }
  }
}

/* ── Reading values from a row (CSV or form) ─────────────────────────────── */

/** Returns the raw value for an item, trying linkId first, then CSV header. */
export function rawValueFor(
  item: QuestionnaireItem,
  row: Record<string, string>,
): string {
  const byLink = row[item.linkId];
  if (byLink !== undefined && byLink !== null && String(byLink).trim() !== "")
    return String(byLink);
  const byHeader = row[csvHeaderFor(item)];
  if (byHeader !== undefined && byHeader !== null && String(byHeader).trim() !== "")
    return String(byHeader);
  return "";
}

function initialAnswerFor(
  item: QuestionnaireItem,
): CoercedAnswer | undefined {
  const init = item.initial?.[0];
  if (!init) return undefined;
  if (init.valueCoding) {
    return {
      fhir: { valueCoding: init.valueCoding },
      normalised: init.valueCoding.code,
      display: init.valueCoding.display ?? init.valueCoding.code,
    };
  }
  if (init.valueString !== undefined) {
    return {
      fhir: { valueString: init.valueString },
      normalised: init.valueString,
      display: init.valueString,
    };
  }
  if (init.valueInteger !== undefined) {
    return {
      fhir: { valueInteger: init.valueInteger },
      normalised: String(init.valueInteger),
      display: String(init.valueInteger),
    };
  }
  return undefined;
}

/**
 * Walks the form's items (in order) and returns the coerced answers for each
 * visible+answered item, skipping fields whose `enableWhen` is not satisfied.
 * Throws `RowMappingError` on missing requireds, bad types, or constraint
 * violations.
 */
export interface ExtractedAnswer {
  item: QuestionnaireItem;
  answer: CoercedAnswer;
}

export function extractAnswers(
  form: LabFormDefinition,
  row: Record<string, string>,
): ExtractedAnswer[] {
  const items = flattenItems(form.questionnaire, { includeHidden: true });
  const all = indexItems(form.questionnaire);
  const answers: AnswerMap = {};
  const out: ExtractedAnswer[] = [];

  for (const item of items) {
    if (!isItemEnabled(item, answers)) continue;

    // Hidden item with an initial value: emit that (mirrors mobile behaviour).
    if (isHidden(item)) {
      const init = initialAnswerFor(item);
      if (init) {
        answers[item.linkId] = init.normalised;
        out.push({ item, answer: init });
      }
      continue;
    }
    if (item.readOnly) continue;

    const raw = rawValueFor(item, row);
    const header = csvHeaderFor(item);

    if (!raw) {
      if (item.required) {
        throw new RowMappingError(
          `Missing required value for "${labelFor(item)}"`,
          header,
        );
      }
      continue;
    }

    const coerced = coerce(item, raw, header);

    // Cross-field: must be on/after another date field.
    const minLink = dateMinFromLinkId(item);
    if (minLink && (item.type === "date" || item.type === "dateTime")) {
      const parent = answers[minLink];
      const parentItem = all.get(minLink);
      if (parent && parent !== "" && coerced.normalised < parent) {
        throw new RowMappingError(
          constraintHuman(item) ??
            `Date must be on or after "${parentItem ? labelFor(parentItem) : minLink}"`,
          header,
        );
      }
    }

    answers[item.linkId] = coerced.normalised;
    out.push({ item, answer: coerced });
  }

  return out;
}

/* ── FHIR resource building ──────────────────────────────────────────────── */

export interface SubmissionContext {
  form: LabFormDefinition;
  row: Record<string, string>;
  patientId: string;
  practitionerId?: string;
  /** FHIR Location.id of the submitter's facility. */
  facilityId?: string;
  facilityName?: string;
  /**
   * The original case-information encounter id read from the patient's
   * `<disease>-case-information` identifier. When present, the new lab
   * Encounter is linked via `partOf` per the QR relation rules.
   */
  originalEncounterId?: string;
  /**
   * Server-side computed answers that override (or, with `force: true`,
   * unconditionally inject) values for specific linkIds. Used for rules
   * like Measles Final Classification that depend on data outside the
   * lab form itself.
   */
  derivedAnswers?: Record<
    string,
    { code: string; display: string; force?: boolean }
  >;
}

interface Reference {
  reference: string;
  display?: string;
}

/** Mirrors mobile `ScreenerViewModel.sourceMetaTag`. */
function managingLocationTag(
  resource: string,
  facilityId: string,
  facilityName?: string,
) {
  return {
    system: `http://example.org/fhir/StructureDefinition/${resource}-managingLocation`,
    code: `Location/${facilityId}`,
    ...(facilityName ? { display: facilityName } : {}),
  };
}

function managingLocationExtension(
  resource: string,
  facilityId: string,
  facilityName?: string,
) {
  return {
    url: `http://example.org/fhir/StructureDefinition/${resource}-managingLocation`,
    valueReference: {
      reference: `Location/${facilityId}`,
      ...(facilityName ? { display: facilityName } : {}),
    },
  };
}

function uuid(): string {
  // crypto.randomUUID is available in Node 18+ and all modern browsers.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback — shouldn't happen in our runtimes.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface BundleEntry {
  fullUrl: string;
  resource: Record<string, unknown>;
  request: { method: "POST"; url: string };
}

export interface TransactionBundle {
  resourceType: "Bundle";
  type: "transaction";
  entry: BundleEntry[];
}

/**
 * Builds a FHIR transaction Bundle with Encounter + QuestionnaireResponse +
 * one Observation per answered item.
 */
export function buildLabSubmissionBundle(
  ctx: SubmissionContext,
): TransactionBundle {
  const {
    form,
    row,
    patientId,
    practitionerId,
    facilityId,
    facilityName,
    originalEncounterId,
    derivedAnswers,
  } = ctx;

  const answered = extractAnswers(form, row);

  // Merge in server-computed answers (e.g. Measles final classification).
  // Forced entries inject even when enableWhen would otherwise hide the item.
  if (derivedAnswers) {
    const all = indexItems(form.questionnaire);
    const indexByLinkId = new Map(answered.map((a, i) => [a.item.linkId, i]));
    for (const [linkId, val] of Object.entries(derivedAnswers)) {
      const item = all.get(linkId);
      if (!item) continue;
      const coerced: CoercedAnswer = {
        fhir: { valueString: val.display },
        normalised: val.code,
        display: val.display,
      };
      const idx = indexByLinkId.get(linkId);
      if (idx !== undefined) {
        answered[idx] = { item, answer: coerced };
      } else if (val.force) {
        answered.push({ item, answer: coerced });
      }
    }
  }

  const now = new Date().toISOString();
  const patientRef: Reference = { reference: `Patient/${patientId}` };
  const practitionerRef: Reference | undefined = practitionerId
    ? { reference: `Practitioner/${practitionerId}` }
    : undefined;

  const encounterId = uuid();
  const qrId = uuid();
  const encounterRef: Reference = { reference: `Encounter/${encounterId}` };

  /* Encounter — references the original case-information encounter as
   * partOf so reports can chain the lab encounter back to its case. */
  const encounter: Record<string, unknown> = {
    resourceType: "Encounter",
    id: encounterId,
    status: "finished",
    subject: patientRef,
    reasonCode: [
      { coding: [{ code: form.id, display: form.title }], text: form.title },
    ],
    identifier: [
      {
        system: "system-creation",
        value: now,
        type: {
          coding: [
            {
              system: "system-creation",
              code: "system_creation",
              display: "System Creation",
            },
          ],
          text: now,
        },
      },
    ],
    period: { start: now, end: now },
  };
  if (originalEncounterId) {
    encounter.partOf = { reference: `Encounter/${originalEncounterId}` };
  }
  if (practitionerRef) {
    encounter.participant = [{ individual: practitionerRef }];
  }
  if (facilityId) {
    encounter.meta = {
      tag: [managingLocationTag("encounter", facilityId, facilityName)],
    };
    encounter.extension = [
      managingLocationExtension("encounter", facilityId, facilityName),
    ];
  }

  /* QuestionnaireResponse */
  const qrItems = answered.map(({ item, answer }) => ({
    linkId: item.linkId,
    ...(item.text ? { text: item.text } : {}),
    answer: [answer.fhir],
  }));

  const qr: Record<string, unknown> = {
    resourceType: "QuestionnaireResponse",
    id: qrId,
    status: "completed",
    questionnaire: form.questionnaireUrl,
    authored: now,
    subject: patientRef,
    encounter: encounterRef,
    item: qrItems,
  };
  if (practitionerRef) qr.author = practitionerRef;
  if (facilityId) {
    qr.meta = {
      tag: [managingLocationTag("questionnaire", facilityId, facilityName)],
    };
    qr.extension = [
      managingLocationExtension("questionnaire", facilityId, facilityName),
    ];
  }

  /* Observations */
  const observations: BundleEntry[] = answered.map(({ item, answer }) => {
    const id = uuid();
    // Use the report-facing code when one is declared so the Superset SQL
    // reports can find this data; fall back to the mobile linkId otherwise.
    const mapped = form.reportCodeMap?.[item.linkId];
    const obsCode = mapped?.code ?? item.linkId;
    const obsDisplay = mapped?.display ?? labelFor(item);
    const obs: Record<string, unknown> = {
      resourceType: "Observation",
      id,
      status: "final",
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: obsCode,
            display: obsDisplay,
          },
        ],
        text: obsDisplay,
      },
      subject: patientRef,
      encounter: encounterRef,
      issued: now,
      // Merge the coerced answer value as the Observation.value[X].
      ...mapAnswerToObservationValue(item, answer),
    };
    if (practitionerRef) obs.performer = [practitionerRef];
    if (facilityId) {
      obs.meta = {
        tag: [managingLocationTag("observation", facilityId, facilityName)],
      };
      obs.extension = [
        managingLocationExtension("observation", facilityId, facilityName),
      ];
    }
    return {
      fullUrl: `urn:uuid:${id}`,
      resource: obs,
      request: { method: "POST", url: "Observation" },
    };
  });

  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        fullUrl: `urn:uuid:${encounterId}`,
        resource: encounter,
        request: { method: "POST", url: "Encounter" },
      },
      {
        fullUrl: `urn:uuid:${qrId}`,
        resource: qr,
        request: { method: "POST", url: "QuestionnaireResponse" },
      },
      ...observations,
    ],
  };
}

/**
 * Map a coerced questionnaire answer to the equivalent Observation.value[X].
 * Mobile's QuestionnaireHelper.codingQuestionnaire writes valueDateTime for
 * dates and valueString for everything else — and that's what the Superset
 * SQL reports (`final_class_obs.value.string`, `measles_igm_obs.value.string`,
 * etc.) join against. We follow the same rule so admin submissions show up
 * in the data warehouse alongside mobile entries.
 */
function mapAnswerToObservationValue(
  item: QuestionnaireItem,
  answer: CoercedAnswer,
): Record<string, unknown> {
  if (item.type === "date" || item.type === "dateTime") {
    const iso = answer.normalised;
    // Append midnight UTC so HAPI accepts it as dateTime.
    const dt = iso.length === 10 ? `${iso}T00:00:00+00:00` : iso;
    return { valueDateTime: dt };
  }
  return { valueString: answer.display };
}


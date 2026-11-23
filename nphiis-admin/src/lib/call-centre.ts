// Client-safe types and form logic for the Alert Log module ("alert-rumor-log.json").
// The FHIR access lives in `fhir-call-centre.ts` (server-only).

import alertTriage from "@/questionnaires/alert-rumor-log.json";
import alertLogBackup from "@/questionnaires/alert-rumor-log-backup.json";
import {
  type AnswerMap,
  type FhirQuestionnaire,
  type QuestionnaireItem,
  dateMaxIsToday,
  isHidden,
  isItemEnabled,
  labelFor,
  splitMultiValue,
} from "./questionnaires";

// The Alert Triage form, copied verbatim from the mobile app
// (nphiis/src/main/assets/alert-rumor-log.json); keep them in sync so both save
// and read the same answers. New alerts are logged with it.
export const CALL_LOG_FORM = alertTriage as unknown as FhirQuestionnaire;

/**
 * The Alert Log form used before (mobile: alert-rumor-log-backup.json): alerts saved
 * with it are still viewed and edited in it.
 */
export const LEGACY_CALL_LOG_FORM = alertLogBackup as unknown as FhirQuestionnaire;

/** Encounter.reasonCode and the slug used as the Patient's case identifier system (mobile CaseTypes.ALERT_LOG). */
export const CALL_LOG_REASON = "Alert Rumor Log";
export const CALL_LOG_SYSTEM = "alert-rumor-log";

/** "Reporting site" on the earlier form: filled from the user's profile on mobile; not shown on the web. */
const REPORTING_SITE_GROUP = "151479012557";

export const CALL_LOG_FIELDS = {
  identifier: "alert-identifier",
  date: "alert-date",
  time: "alert-time",
  receivedBy: "alert-received-by",
  sourceType: "alert-source-type",
  mode: "alert-mode",
  reporterName: "alert-reporter-name",
  reporterMobile: "alert-reporter-mobile",
  county: "a4-county",
  subCounty: "a3-sub-county",
  /** Free text on the form; the web picker fills it from the DHA Facility Registry. */
  facility: "alert-facility",
  description: "alert-description",
  symptoms: "alert-symptoms",
  riskLevel: "alert-risk-level",
  actions: "alert-actions",
  remarks: "alert-remarks",
  officerName: "alert-officer-name",
  officerDate: "alert-officer-date",
} as const;

/** Questions of the earlier Alert Log form that the summary, list and search still read. */
export const LEGACY_FIELDS = {
  ward: "a2-ward",
  village: "alert-village",
  personName: "873240407472",
  personSurname: "486402457213",
  personSex: "929966324957",
  personMobile: "alert-mobile",
  vitalStatus: "alert-vital-status",
  meetsDefinition: "alert-meets-case-definition",
} as const;

/** Filled by the system, not typed: who received the alert. */
export const AUTO_FIELDS: ReadonlySet<string> = new Set([CALL_LOG_FIELDS.receivedBy]);

/** The agent ID saved on a log: "Jane Wanjiku (12345678)", from the logged-in account. */
export function agentLabel(name?: string, username?: string): string | undefined {
  const n = name?.trim();
  const u = username?.trim();
  if (n && u && n !== u) return `${n} (${u})`;
  return n || u || undefined;
}

/** Location questions, each filtered by the one before it. */
export const LOCATION_ITEMS: Record<string, { level: "county" | "subcounty" | "ward"; parent?: string }> = {
  [CALL_LOG_FIELDS.county]: { level: "county" },
  [CALL_LOG_FIELDS.subCounty]: { level: "subcounty", parent: CALL_LOG_FIELDS.county },
  // Earlier call logs only.
  [LEGACY_FIELDS.ward]: { level: "ward", parent: CALL_LOG_FIELDS.subCounty },
};

export interface LocationAnswer {
  id: string;
  name: string;
}

/** An existing case a call log is linked to. Call logs get no EPID of their own; the case's EPID is shown. */
export interface LinkedCase {
  patientId: string;
  epid: string;
  name?: string;
}

/** A case found by the Call Centre case search. */
export interface CaseCandidate extends LinkedCase {
  phone?: string;
  county?: string;
  subCounty?: string;
}

/**
 * What the form sends: answers keyed by linkId (choice = option code, repeats joined by ";"),
 * picked locations, and the case the call is linked to (null or absent: none).
 */
export interface CallLogPayload {
  answers: AnswerMap;
  locations: Record<string, LocationAnswer>;
  linkedCase?: LinkedCase | null;
}

/** One row of the alert log list. */
export interface CallLogSummary {
  patientId: string;
  /** The log's own ID (KEN-NAI-EME-2026-ALR-001), given by the server shortly after saving. */
  logId?: string;
  /** EPID of the linked case, if any. */
  epid?: string;
  /** When the alert was received: a dateTime, or a date alone when no time was given. */
  receivedAt?: string;
  receivedBy?: string;
  reporterName?: string;
  reporterMobile?: string;
  source?: string;
  county?: string;
  subCounty?: string;
  symptoms?: string;
  riskLevel?: string;
  action?: string;
  /** Earlier alert logs only. */
  patientName?: string;
  vitalStatus?: string;
  meetsDefinition?: string;
}

export interface CallLog extends CallLogPayload {
  summary: CallLogSummary;
}

export const RISK_LEVEL_OPTIONS = optionsOf(CALL_LOG_FIELDS.riskLevel);
export const SOURCE_OPTIONS = optionsOf(CALL_LOG_FIELDS.sourceType);

function optionsOf(linkId: string): Array<{ code: string; display: string }> {
  const item = findItem(CALL_LOG_FORM.item ?? [], linkId);
  return (item?.answerOption ?? [])
    .map((o) => o.valueCoding)
    .filter((c): c is { code: string; display: string } => Boolean(c));
}

function findItem(items: QuestionnaireItem[], linkId: string): QuestionnaireItem | undefined {
  for (const it of items) {
    if (it.linkId === linkId) return it;
    const found = findItem(it.item ?? [], linkId);
    if (found) return found;
  }
  return undefined;
}

/**
 * A section's heading without the form's "1."-style number. Sections that do not apply
 * are hidden, so the numbers would skip (1, then 6).
 */
export function sectionTitle(text: string): string {
  return text.replace(/^\s*\d+\.\s*/, "");
}

/** The form's sections (top-level groups), without the reporting-site group. */
export function callLogSections(form: FhirQuestionnaire = CALL_LOG_FORM): QuestionnaireItem[] {
  return (form.item ?? []).filter((it) => it.linkId !== REPORTING_SITE_GROUP);
}

/** Answerable linkIds of the earlier Alert Log form that the triage form does not have. */
const LEGACY_ONLY: ReadonlySet<string> = (() => {
  const triage = new Set(callLogItems(CALL_LOG_FORM).keys());
  return new Set(Array.from(callLogItems(LEGACY_CALL_LOG_FORM).keys()).filter((k) => !triage.has(k)));
})();

/** The form a log was saved with, from the questions it answers: new logs use the triage form. */
export function formForLinkIds(linkIds: Iterable<string>): FhirQuestionnaire {
  for (const k of Array.from(linkIds)) if (LEGACY_ONLY.has(k)) return LEGACY_CALL_LOG_FORM;
  return CALL_LOG_FORM;
}

/** The form a payload belongs to. */
export function formOf(payload: Pick<CallLogPayload, "answers" | "locations">): FhirQuestionnaire {
  return formForLinkIds([...Object.keys(payload.answers), ...Object.keys(payload.locations)]);
}

export function isLegacyForm(form: FhirQuestionnaire): boolean {
  return form === LEGACY_CALL_LOG_FORM;
}

/** Answer of a location question as the form keeps it in `answers`: the Location id. */
function withLocations(payload: CallLogPayload): AnswerMap {
  const out: AnswerMap = { ...payload.answers };
  for (const linkId of Object.keys(LOCATION_ITEMS)) {
    const loc = payload.locations[linkId];
    if (loc?.id) out[linkId] = loc.id;
    else delete out[linkId];
  }
  return out;
}

/**
 * Questions currently shown, in form order: enabled, not hidden, inside an
 * enabled group. Display items are included (they carry guidance text).
 */
export function visibleItems(answers: AnswerMap, form: FhirQuestionnaire = formForLinkIds(Object.keys(answers))): QuestionnaireItem[] {
  const out: QuestionnaireItem[] = [];
  const walk = (items: QuestionnaireItem[]) => {
    for (const it of items) {
      if (isHidden(it) || !isItemEnabled(it, answers)) continue;
      if (it.type === "group") walk(it.item ?? []);
      else out.push(it);
    }
  };
  walk(callLogSections(form));
  return out;
}

/** True when a question is shown for these answers. */
export function isVisible(linkId: string, answers: AnswerMap, form?: FhirQuestionnaire): boolean {
  return visibleItems(answers, form).some((it) => it.linkId === linkId);
}

/**
 * The payload with answers to questions that are no longer shown removed. `form`
 * defaults to the one the payload belongs to; pass CALL_LOG_FORM to keep only
 * triage answers (a new log).
 */
export function cleanPayload(payload: CallLogPayload, form: FhirQuestionnaire = formOf(payload)): CallLogPayload {
  let answers = withLocations(payload);
  // Clearing one answer can hide further questions, so repeat until stable.
  for (let i = 0; i < 5; i++) {
    const shown = new Set(visibleItems(answers, form).map((it) => it.linkId));
    const next: AnswerMap = {};
    for (const [k, v] of Object.entries(answers)) {
      if (shown.has(k) && v !== "") next[k] = v;
    }
    if (Object.keys(next).length === Object.keys(answers).length) break;
    answers = next;
  }
  const locations: Record<string, LocationAnswer> = {};
  for (const linkId of Object.keys(LOCATION_ITEMS)) {
    if (answers[linkId] && payload.locations[linkId]) locations[linkId] = payload.locations[linkId];
    delete answers[linkId];
  }
  return { answers, locations, linkedCase: payload.linkedCase ?? null };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Kenya has no daylight saving: East Africa Time is always UTC+3. */
export const EAT_OFFSET_MS = 3 * 3_600_000;

/** Milliseconds of a dateTime; "2026-10-21T10:15" (no offset, as the form keeps it) is Kenya time on any server. */
export function parseKenyaDateTime(v: string): number {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(v)) return Date.parse(v);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return Number.NaN;
  return Date.parse(`${v.length === 16 ? `${v}:00` : v}+03:00`);
}

/** Now as the form's "yyyy-mm-ddThh:mm" in Kenya time. */
export function nowInKenya(): string {
  return new Date(Date.now() + EAT_OFFSET_MS).toISOString().slice(0, 16);
}

/** The current time as "hh:mm" in Kenya. */
export function nowTimeInKenya(): string {
  return nowInKenya().slice(11, 16);
}

/** Today as "yyyy-mm-dd" in Kenya. */
export function todayInKenya(): string {
  return nowInKenya().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_EXT = "http://hl7.org/fhir/StructureDefinition/regex";
const VALIDATION_TEXT_EXT = "http://ehelse.no/fhir/StructureDefinition/validationtext";
const MIN_VALUE_EXT = "http://hl7.org/fhir/StructureDefinition/minValue";
const MAX_VALUE_EXT = "http://hl7.org/fhir/StructureDefinition/maxValue";

function extensionOf(it: QuestionnaireItem, url: string) {
  return it.extension?.find((e) => e.url === url) as Record<string, unknown> | undefined;
}

/** The form's own message for an answer it rejects, else `fallback`. */
function validationText(it: QuestionnaireItem, fallback: string): string {
  const v = extensionOf(it, VALIDATION_TEXT_EXT)?.valueString;
  return typeof v === "string" && v.trim() ? v : fallback;
}

/** Problems with a payload, keyed by linkId. Empty when it can be saved. */
export function validateCallLog(payload: CallLogPayload, form: FhirQuestionnaire = formOf(payload)): Record<string, string> {
  const answers = withLocations(payload);
  const errors: Record<string, string> = {};
  for (const it of visibleItems(answers, form)) {
    if (it.type === "display") continue;
    const v = (answers[it.linkId] ?? "").trim();
    if (!v) {
      if (it.required) errors[it.linkId] = `${labelFor(it)} is required`;
      continue;
    }
    if (it.type === "integer") {
      if (!/^\d+$/.test(v)) errors[it.linkId] = "Must be a whole number";
      else {
        const n = Number.parseInt(v, 10);
        const min = extensionOf(it, MIN_VALUE_EXT)?.valueInteger;
        const max = extensionOf(it, MAX_VALUE_EXT)?.valueInteger;
        if ((typeof min === "number" && n < min) || (typeof max === "number" && n > max)) {
          errors[it.linkId] = validationText(it, "Number out of range");
        }
      }
    }
    if (it.type === "date") {
      if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) errors[it.linkId] = "Enter a valid date";
      else if (dateMaxIsToday(it) && v > todayInKenya()) errors[it.linkId] = "Cannot be a date in the future";
    }
    const pattern = extensionOf(it, REGEX_EXT)?.valueString;
    if (typeof pattern === "string" && (it.type === "string" || it.type === "text")) {
      try {
        if (!new RegExp(pattern).test(v)) errors[it.linkId] = validationText(it, "Check the format");
      } catch {
        // A pattern the browser cannot read is not the user's mistake.
      }
    }
    if (it.type === "dateTime") {
      const ms = parseKenyaDateTime(v);
      if (Number.isNaN(ms)) errors[it.linkId] = "Enter a valid date and time";
      else if (ms > Date.now() + 5 * 60_000) errors[it.linkId] = "Cannot be in the future";
    }
    if (it.type === "time" && !TIME_RE.test(v)) errors[it.linkId] = "Enter a valid time";
    if (it.type === "choice") {
      const codes = new Set((it.answerOption ?? []).map((o) => o.valueCoding?.code));
      const picked = it.repeats ? splitMultiValue(v) : [v];
      if (picked.some((c) => !codes.has(c))) errors[it.linkId] = "Select one of the options";
    }
  }
  return errors;
}

/** Display text of a choice answer (repeats joined by ", ", as the mobile app stores them). */
export function choiceDisplay(item: QuestionnaireItem, value: string): string {
  const codes = item.repeats ? splitMultiValue(value) : [value];
  return codes
    .map((code) => item.answerOption?.find((o) => o.valueCoding?.code === code)?.valueCoding?.display ?? code)
    .join(", ");
}

/** Every answerable item of the form (including hidden ones), by linkId. */
export function callLogItems(form: FhirQuestionnaire = CALL_LOG_FORM): Map<string, QuestionnaireItem> {
  const map = new Map<string, QuestionnaireItem>();
  const walk = (items: QuestionnaireItem[]) => {
    for (const it of items) {
      if (it.type !== "group" && it.type !== "display") map.set(it.linkId, it);
      walk(it.item ?? []);
    }
  };
  walk(callLogSections(form));
  return map;
}

/** The value shown to people for an answer: option display, location name, or the text itself. */
export function answerText(payload: CallLogPayload, linkId: string): string | undefined {
  const loc = payload.locations[linkId];
  if (loc) return loc.name;
  const v = payload.answers[linkId];
  if (!v) return undefined;
  const item = callLogItems(formOf(payload)).get(linkId);
  return item?.type === "choice" ? choiceDisplay(item, v) : v;
}

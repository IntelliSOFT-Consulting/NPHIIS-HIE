// Shared FHIR helpers for the lab-results flow. EPID is not stored as a
// Patient.identifier on the HIE — the mobile app writes it as an Observation
// (code=EPID, valueString=<epid>) attached to the Patient (see
// ScreenerViewModel.kt:245 and AddClientViewModel.kt:747). Patient lookups
// therefore have to go through that Observation.

const FHIR_BASE_URL =
  process.env.FHIR_BASE_URL || process.env.NEXT_PUBLIC_FHIR_BASE_URL;
if (!FHIR_BASE_URL) {
  throw new Error("FHIR_BASE_URL is not set");
}

interface PatientName {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
}

interface PatientIdentifierType {
  coding?: Array<{ system?: string; code?: string; display?: string }>;
  text?: string;
}

interface PatientIdentifier {
  type?: PatientIdentifierType;
  system?: string;
  value?: string;
}

interface PatientResource {
  resourceType?: "Patient";
  id?: string;
  identifier?: PatientIdentifier[];
  name?: PatientName[];
  gender?: string;
  birthDate?: string;
  meta?: { lastUpdated?: string };
}

interface ObservationResource {
  resourceType?: "Observation";
  id?: string;
  valueString?: string;
  issued?: string;
  effectiveDateTime?: string;
  meta?: { lastUpdated?: string };
  subject?: { reference?: string };
}

interface BundleEntry<T> {
  resource?: T;
  search?: { mode?: "match" | "include" };
}

export interface PatientMatch {
  id: string;
  displayName: string;
  gender?: string;
  birthDate?: string;
  /**
   * Encounter id from the patient's `<disease>-case-information` identifier
   * (e.g. `measles-case-information`, `afp-case-information`). The mobile app
   * stamps this on the Patient at registration so subsequent encounters
   * (lab, contact-investigation, etc.) can `partOf` link back to the
   * originating case encounter — see meeting notes for QR relation rules.
   */
  caseEncounterId?: string;
  caseEncounterSystem?: string;
}

export type EpidLookupResult =
  | { kind: "found"; patient: PatientMatch }
  | { kind: "not-found" };

/**
 * The "Is this a Case or a Line List?" question in the mobile add-case form
 * (see `add-case.json` item 865158268604) is saved as an Observation on the
 * Patient. The mobile app reads it back via this same linkId to decide
 * whether to show the lab-collection screens (SummarizedActivity.kt:167-176).
 * Lab results must only be attached to patients whose answer is "Case".
 */
export const CASE_OR_LINELIST_LINKID = "865158268604";

function displayName(p: PatientResource): string {
  const n = p.name?.[0];
  if (!n) return "Unknown";
  if (n.text) return n.text;
  const given = (n.given ?? []).join(" ").trim();
  return [given, n.family].filter(Boolean).join(" ").trim() || "Unknown";
}

/**
 * Scan a patient's identifiers for a `<disease>-case-information` entry; its
 * `value` is the originating encounter UUID.
 */
function findCaseEncounter(p: PatientResource): {
  id: string;
  system: string;
} | undefined {
  for (const ident of p.identifier ?? []) {
    const sys = ident.system ?? ident.type?.coding?.[0]?.system ?? "";
    if (sys.endsWith("-case-information") && ident.value) {
      return { id: ident.value, system: sys };
    }
  }
  return undefined;
}

function patientRefId(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const m = ref.match(/^Patient\/([^/?#]+)$/);
  return m ? m[1] : undefined;
}

async function fetchPatientById(
  id: string,
  token: string,
): Promise<PatientResource | null> {
  const res = await fetch(`${FHIR_BASE_URL}/Patient/${encodeURIComponent(id)}`, {
    headers: {
      Accept: "application/fhir+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as PatientResource;
}

/**
 * Search the EPID-tagged Observation. Mobile writes the Observation with
 * code.coding = { system: http://snomed.info/sct, code: EPID } and the value
 * as `valueString` (QuestionnaireHelper.kt:37-44).
 *
 * We issue a lenient query (plain `code=EPID`, no `:exact` modifier) because
 * different HAPI deployments disagree on whether `system|code` tokens and
 * `:exact` string modifiers are indexed. We then filter client-side on the
 * trimmed valueString so an exact match is still required — the wider index
 * pass just guarantees the Observation is actually returned.
 */
async function searchEpidObservations(
  epid: string,
  token: string,
): Promise<ObservationResource[]> {
  const trimmed = epid.trim();
  const url =
    `${FHIR_BASE_URL}/Observation` +
    `?code=EPID` +
    `&value-string=${encodeURIComponent(trimmed)}` +
    `&_count=50`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/fhir+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `EPID observation search failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const bundle = (await res.json()) as {
    entry?: BundleEntry<ObservationResource>[];
  };
  const all =
    (bundle.entry?.map((e) => e.resource).filter(Boolean) as ObservationResource[]) ??
    [];
  const exact = all.filter(
    (o) => (o.valueString ?? "").trim() === trimmed,
  );
  console.info(
    `[lab] EPID search "${trimmed}": ${all.length} candidates, ${exact.length} exact`,
  );
  return exact;
}

/**
 * Returns up to `limit` sample EPID strings from the server — used to help
 * users debug "not found" cases when they may have typed the wrong format.
 */
export async function sampleEpidValues(
  token: string,
  limit = 3,
): Promise<string[]> {
  const url =
    `${FHIR_BASE_URL}/Observation` +
    `?code=EPID` +
    `&_elements=valueString` +
    `&_count=${limit}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/fhir+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return [];
  const bundle = (await res.json()) as {
    entry?: BundleEntry<ObservationResource>[];
  };
  return (
    bundle.entry
      ?.map((e) => e.resource?.valueString?.trim())
      .filter((v): v is string => Boolean(v)) ?? []
  );
}

/**
 * Search Patient resources whose identifier value matches the EPID. EPID is
 * the most reliable storage location on this HIE: it's tagged with type code
 * `EPID` (system `http://hie.org/identifiers/EPID`) and shows up directly on
 * the Patient when the registration was synced through that path. Some
 * older entries only carry the EPID as an Observation, so callers fall back
 * to `searchEpidObservations` when this returns nothing.
 */
async function searchPatientsByEpidIdentifier(
  epid: string,
  token: string,
): Promise<PatientResource[]> {
  const url =
    `${FHIR_BASE_URL}/Patient` +
    `?identifier=${encodeURIComponent(epid.trim())}` +
    `&_count=20`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/fhir+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Patient identifier search failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const bundle = (await res.json()) as {
    entry?: BundleEntry<PatientResource>[];
  };
  const trimmed = epid.trim();
  const all =
    (bundle.entry?.map((e) => e.resource).filter(Boolean) as PatientResource[]) ??
    [];
  // HAPI's identifier param matches across all identifiers on the Patient,
  // not just the EPID one. Filter to those whose EPID-typed identifier
  // actually equals the requested value.
  return all.filter((p) =>
    (p.identifier ?? []).some(
      (id) =>
        id.value?.trim() === trimmed &&
        id.type?.coding?.some((c) => c.code === "EPID"),
    ),
  );
}

function chooseLatestPatient(
  patients: PatientResource[],
  epid: string,
): PatientResource | undefined {
  if (patients.length === 0) return undefined;
  const ranked = patients.slice().sort((a, b) => {
    const ta = a.meta?.lastUpdated ?? "";
    const tb = b.meta?.lastUpdated ?? "";
    return tb.localeCompare(ta);
  });
  if (ranked.length > 1) {
    console.warn(
      `[lab] EPID "${epid}" maps to ${ranked.length} Patient resources; using the most recently updated`,
    );
  }
  return ranked[0];
}

/**
 * Look up a Patient by EPID.
 *
 * Conceptually one EPID belongs to one patient/case, but the mobile app does
 * not deduplicate, so HAPI typically holds several resources for the same
 * EPID — every save writes another. We try the direct Patient.identifier
 * route first (preferred — the reports key off it too, see
 * `nphiis/reports/measles-cif-502.sql`), then fall back to looking up the
 * EPID Observation and following its `subject` reference. In both branches
 * we pick the most recently updated record so the latest submission wins.
 */
export async function lookupPatientByEpid(
  epid: string,
  token: string,
): Promise<EpidLookupResult> {
  // Primary: Patient.identifier
  const directHits = await searchPatientsByEpidIdentifier(epid, token);
  let chosen = chooseLatestPatient(directHits, epid);

  // Fallback: EPID Observation -> subject -> Patient
  if (!chosen) {
    const observations = await searchEpidObservations(epid, token);
    const subjectIds = observations
      .map((o) => ({
        id: patientRefId(o.subject?.reference),
        ts: o.meta?.lastUpdated ?? o.issued ?? o.effectiveDateTime ?? "",
      }))
      .filter((x): x is { id: string; ts: string } => Boolean(x.id));
    if (subjectIds.length > 0) {
      subjectIds.sort((a, b) => b.ts.localeCompare(a.ts));
      const distinct = new Set(subjectIds.map((s) => s.id));
      if (distinct.size > 1) {
        console.warn(
          `[lab] EPID "${epid}" Observation lookup maps to ${distinct.size} distinct patients; using the most recently updated`,
        );
      }
      const fetched = await fetchPatientById(subjectIds[0].id, token);
      if (fetched) chosen = fetched;
    }
  }

  if (!chosen?.id) return { kind: "not-found" };
  const caseEncounter = findCaseEncounter(chosen);
  return {
    kind: "found",
    patient: {
      id: chosen.id,
      displayName: displayName(chosen),
      gender: chosen.gender,
      birthDate: chosen.birthDate,
      caseEncounterId: caseEncounter?.id,
      caseEncounterSystem: caseEncounter?.system,
    },
  };
}

/* ── Case vs Line-List resolution ────────────────────────────────────────── */

export type PatientRecordType = "case" | "line-list" | "unknown";

/**
 * Returns whether the given patient was registered as a Case or a Line-List
 * entry. Queries the answer Observation stored by the mobile app (code =
 * linkId `865158268604`). If multiple observations exist (updates over time)
 * we take the most recent.
 *
 * Mirrors PatientListViewModel.kt:245-246 / SummarizedActivity.kt:167-176:
 * missing observations fall back to "case" — matching the mobile default.
 */
export async function getPatientRecordType(
  patientId: string,
  token: string,
): Promise<PatientRecordType> {
  const url =
    `${FHIR_BASE_URL}/Observation` +
    `?subject=Patient/${encodeURIComponent(patientId)}` +
    `&code=${encodeURIComponent(CASE_OR_LINELIST_LINKID)}` +
    `&_sort=-_lastUpdated&_count=5`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/fhir+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Case/line-list lookup failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const bundle = (await res.json()) as { entry?: BundleEntry<ObservationResource>[] };
  const obs = bundle.entry?.map((e) => e.resource).filter(Boolean) ?? [];
  if (obs.length === 0) return "unknown";
  const latest = obs
    .slice()
    .sort((a, b) => {
      const ta = a?.meta?.lastUpdated ?? a?.issued ?? "";
      const tb = b?.meta?.lastUpdated ?? b?.issued ?? "";
      return tb.localeCompare(ta);
    })[0];
  const v = (latest?.valueString ?? "").trim().toLowerCase();
  if (v === "case") return "case";
  if (v === "line list" || v === "line-list" || v === "linelist")
    return "line-list";
  return "unknown";
}


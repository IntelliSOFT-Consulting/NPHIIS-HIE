import { createHash } from "crypto";

/**
 * Pure helpers for the NPHL Surveillance Data API (POST /v1/surveillance, docs at
 * https://data-apis.nphl.go.ke/). One call carries one case record and every specimen
 * collected for it; the response returns the lab's current result for each specimen.
 *
 * Each Specimen's journey to the lab is tracked with a FHIR Task (one per Specimen),
 * and results are written back as an Observation and a DiagnosticReport on the case.
 */

export const VHF_CASE_REASON = "VHF Case Information";
export const WORKFLOW_ENCOUNTER_EXT = "http://hl7.org/fhir/StructureDefinition/workflow-encounter";

export const TASK_CODE_SYSTEM = "http://nphiis.health.go.ke/fhir/CodeSystem/task-code";
export const TASK_CODE = "nphl-specimen-submission";
export const TASK_ID_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/nphl-specimen-task";
/** The ID printed on the sample tube; NPHL matches results on it. */
export const SPECIMEN_LABEL_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/specimen-id";
/** The lab's accession number for the specimen (e.g. NVRL/1051/26), once the lab sends it. */
export const LAB_NUMBER_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/nphl-lab-number";
export const BUSINESS_STATUS_SYSTEM = "http://nphiis.health.go.ke/fhir/CodeSystem/nphl-specimen-status";
export const RESULT_CODE_SYSTEM = "http://nphiis.health.go.ke/fhir/CodeSystem/nphl-lab";
export const RESULT_CODE = "nphl-lab-result";

export const DEFAULT_LAB_TESTS = ["RT-PCR"];

/** Case-form linkIds written by the mobile VHF case form. */
const OBS = {
  family: "486402457213",
  given: "873240407472",
  sex: "929966324957",
  sexOther: "vhf-sex-other",
  ageYears: "492731638700",
  ageMonths: "185726989867",
  ageDays: "828303331247",
  county: "a4-county",
  subcounty: "a3-sub-county",
  symptoms: "vhf-symptoms",
  symptomsOther: "vhf-symptoms-other",
  onset: "728034137219",
  vaccinated: "vhf-ebola-vaccinated",
};
const ONSET_PREFIX = "vhf-onset-";
const CARE_CODES = [
  "vhf-care-type",
  "vhf-care-facility",
  "vhf-outpatient-number",
  "vhf-treatment",
  "vhf-antibiotics",
  "vhf-outcome",
  "vhf-case-status",
];

export type NphlResult = {
  specimenId: string;
  result: "Positive" | "Negative" | null;
  resultType: "Final" | "Preliminary" | null;
  /** `code` is the test's LOINC code when the lab sends one. */
  narration: Array<{ analysis?: string; test_name?: string; test_method?: string; result?: string; result_type?: string; code?: string }>;
  resultDate: string | null;
  testingLab: string | null;
};

export type Rejection = { reason: string; date: string | null; lab: string | null };

/** The specimen's progress at the lab before a result: it arrived, or testing started. */
export type LabProgress = { stage: "received" | "in-testing"; date: string | null; lab: string | null };

/** Free text from the lab about a specimen, e.g. a request for a repeat sample. */
export type LabNote = { text: string; date: string | null; lab: string | null };

export type TaskState =
  | { kind: "awaiting-epid" }
  | { kind: "submission-failed"; error: string }
  | { kind: "submitted"; result: NphlResult | null }
  | { kind: "rejected"; rejection: Rejection }
  | { kind: "lab-progress"; progress: LabProgress };

/**
 * One update the lab system sends for a specimen. `altIds` are other IDs the lab sent for it
 * (its order identifier), tried when `specimenId` matches no Task; `labNumber` is the lab's
 * own accession number (line-list caseIdentifier), kept on the Task.
 */
export type LabUpdate = { specimenId: string; altIds?: string[]; labNumber?: string } & (
  | { kind: "result"; result: NphlResult }
  | { kind: "rejected"; rejection: Rejection }
  | { kind: "progress"; progress: LabProgress }
  | { kind: "note"; note: LabNote }
);

export type LabelSource = "identifier" | "fhir-id";

function refId(reference: string | undefined, type: string): string | null {
  const ref = reference?.trim();
  if (!ref?.startsWith(`${type}/`)) return null;
  return ref.split("/")[1]?.trim() || null;
}

export function specimenCaseEncounterId(specimen: any): string | null {
  const ext = (specimen?.extension ?? []).find((e: any) => e?.url === WORKFLOW_ENCOUNTER_EXT);
  return refId(ext?.valueReference?.reference, "Encounter");
}

export function isVhfCaseEncounter(encounter: any): boolean {
  return (encounter?.reasonCode ?? []).some((rc: any) =>
    (rc?.coding ?? []).some((c: any) => c?.code === VHF_CASE_REASON),
  );
}

/**
 * The tube label NPHL matches on. Mobile does not capture one yet, so fall back to the
 * FHIR id and record that on the Task: a result can only come back once the lab knows it.
 */
export function specimenLabel(specimen: any): { value: string; source: LabelSource } {
  const ids: any[] = specimen?.identifier ?? [];
  const preferred = ids.find((i) => i?.system === SPECIMEN_LABEL_SYSTEM && i?.value?.trim());
  const any = preferred ?? ids.find((i) => i?.value?.trim()) ?? specimen?.accessionIdentifier;
  if (any?.value?.trim()) return { value: any.value.trim(), source: "identifier" };
  return { value: String(specimen.id), source: "fhir-id" };
}

/** Mobile stores local midnight as UTC; report the date as entered in Kenya (UTC+3). */
export function nairobiDate(dateTime: string | undefined): string | null {
  if (!dateTime) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTime)) return dateTime;
  const t = Date.parse(dateTime);
  if (Number.isNaN(t)) return null;
  return new Date(t + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function obsTime(o: any): number {
  const t = Date.parse(o?.meta?.lastUpdated ?? o?.issued ?? o?.effectiveDateTime ?? "");
  return Number.isNaN(t) ? 0 : t;
}

function obsValue(o: any): string | null {
  const v =
    o?.valueString ??
    o?.valueDateTime ??
    o?.valueDate ??
    o?.valueCoding?.display ??
    o?.valueCoding?.code ??
    o?.valueInteger ??
    o?.valueDecimal ??
    (typeof o?.valueBoolean === "boolean" ? (o.valueBoolean ? "Yes" : "No") : undefined);
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/** Latest value per Observation code; Observations are appended, never edited. */
export function observationValues(observations: any[]): Map<string, string> {
  const latest = new Map<string, { t: number; v: string }>();
  for (const o of observations) {
    const code = o?.code?.coding?.[0]?.code;
    const v = obsValue(o);
    if (!code || v == null) continue;
    const t = obsTime(o);
    const prev = latest.get(code);
    if (!prev || t >= prev.t) latest.set(code, { t, v });
  }
  return new Map([...latest].map(([k, { v }]) => [k, v]));
}

function snake(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sexFrom(values: Map<string, string>, patient: any): string | null {
  const sex = values.get(OBS.sex);
  if (sex && /other/i.test(sex)) return values.get(OBS.sexOther) ?? "Other";
  if (sex) return sex;
  const g = patient?.gender;
  if (g === "male") return "Male";
  if (g === "female") return "Female";
  return null;
}

function compact(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));
}

export function buildCaseDemographics(patient: any, values: Map<string, string>) {
  const name = patient?.name?.[0];
  const address = patient?.address?.[0];
  return compact({
    given: values.get(OBS.given) ?? name?.given?.join(" "),
    family: values.get(OBS.family) ?? name?.family,
    sex: sexFrom(values, patient),
    date_of_birth: patient?.birthDate,
    age_years: patient?.birthDate ? undefined : values.get(OBS.ageYears),
    age_months: patient?.birthDate ? undefined : values.get(OBS.ageMonths),
    age_days: patient?.birthDate ? undefined : values.get(OBS.ageDays),
    county: values.get(OBS.county) ?? address?.city,
    subcounty: values.get(OBS.subcounty) ?? address?.state,
  });
}

/**
 * NPHL treats every field in clinical_information_<syndrome> as a symptom, so only
 * symptoms and onset dates go here: "Fever, Other (specify)" → { fever: "Yes", other_symptoms: … }.
 */
export function buildClinicalInformation(values: Map<string, string>) {
  const out: Record<string, string> = {};
  for (const s of (values.get(OBS.symptoms) ?? "").split(",").map((x) => x.trim())) {
    if (!s || /^other/i.test(s)) continue;
    out[snake(s)] = "Yes";
  }
  const other = values.get(OBS.symptomsOther);
  if (other) out.other_symptoms = other;
  const onset = values.get(OBS.onset);
  if (onset) out.date_of_onset = onset;
  for (const [code, v] of values) {
    if (!code.startsWith(ONSET_PREFIX)) continue;
    const sym = code.slice(ONSET_PREFIX.length);
    out[`date_of_onset_of_${sym === "other" ? "other_symptom" : snake(sym)}`] = v;
  }
  return out;
}

function pick(values: Map<string, string>, codes: string[]) {
  const out: Record<string, string> = {};
  for (const c of codes) {
    const v = values.get(c);
    if (v != null) out[snake(c.replace(/^vhf-/, ""))] = v;
  }
  return out;
}

export function buildLaboratory(specimen: any, labTests: string[] = DEFAULT_LAB_TESTS) {
  const type =
    specimen?.type?.text ??
    specimen?.type?.coding?.find((c: any) => c?.system === "specimen-details")?.display ??
    specimen?.type?.coding?.[0]?.display ??
    null;
  return {
    specimen_id: specimenLabel(specimen).value,
    sample_collected: "Yes",
    type_of_sample: type,
    type_of_sample_other: null,
    date_of_collection: nairobiDate(specimen?.collection?.collectedDateTime),
    laboratory_tests: labTests,
    preliminary_laboratory_facility: null,
    final_laboratory_result: null,
    date_of_final_laboratory_result: null,
  };
}

/**
 * record_ident is the case Encounter id, not the EPID: NPHL keys its records on it, and an
 * EPID can still be corrected after assignment.
 */
export function buildSurveillancePayload(args: {
  caseEncounterId: string;
  epid: string;
  patient: any;
  observations: any[];
  specimens: any[];
  labTests?: string[];
}) {
  const values = observationValues(args.observations);
  const caseRecord = {
    ident: args.caseEncounterId,
    initial: { EPID: args.epid },
    sections: {
      case_demographics: [buildCaseDemographics(args.patient, values)],
      clinical_information_vhf: [buildClinicalInformation(values)],
      clinical_care_vhf: [pick(values, CARE_CODES)],
      vaccination_information_vhf: [pick(values, [OBS.vaccinated])],
    },
  };
  return {
    record_ident: args.caseEncounterId,
    record_payload: args.specimens.map((s) => ({
      laboratory: buildLaboratory(s, args.labTests),
      record_payload: caseRecord,
    })),
  };
}

/**
 * Lab results come as Negative/Positive, or as Absent/Present (lab line-list conclusions,
 * LOINC LA9634-2 / LA9633-4). Anything else (pending, inconclusive, blank) is not a result.
 * Negative is checked first: "Not detected" contains "detected".
 */
function normaliseResult(v: unknown): "Positive" | "Negative" | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/\b(negative|absent|not\s+detected)\b/i.test(s)) return "Negative";
  if (/\b(positive|present|detected)\b/i.test(s)) return "Positive";
  return null;
}

const ANSWER_CODES: Record<string, "Positive" | "Negative"> = { "LA9634-2": "Negative", "LA9633-4": "Positive" };

/** A line-list row's result: its conclusion, else its LOINC answer code. */
function lineListResult(r: any): "Positive" | "Negative" | null {
  return normaliseResult(r?.conclusion) ?? ANSWER_CODES[String(r?.valueCode ?? "").trim()] ?? null;
}

function normaliseResultType(v: unknown): "Final" | "Preliminary" | null {
  if (v == null || String(v).trim() === "") return null;
  return /^final$/i.test(String(v).trim()) ? "Final" : "Preliminary";
}

/** One entry of the POST /v1/surveillance response `data` array. */
export function parseSurveillanceEntry(entry: any): NphlResult {
  return {
    specimenId: String(entry?.specimen_id ?? ""),
    result: normaliseResult(entry?.laboratory_result),
    resultType: normaliseResultType(entry?.laboratory_result_type),
    narration: Array.isArray(entry?.laboratory_result_narration) ? entry.laboratory_result_narration : [],
    resultDate: entry?.date_of_laboratory_result ?? null,
    testingLab: entry?.other_laboratory_facility ?? null,
  };
}

/**
 * Lab line-list rows (the lab-staging /list schema), one row per test, grouped per specimen.
 * Rows carry no Final/Preliminary flag; a row is treated as Final unless it says otherwise.
 */
export function parseLineListRecords(rows: any[]): NphlResult[] {
  const bySpecimen = new Map<string, any[]>();
  for (const r of rows) {
    const id = String(r?.specimenIdentifier ?? "").trim();
    if (!id) continue;
    bySpecimen.set(id, [...(bySpecimen.get(id) ?? []), r]);
  }
  return [...bySpecimen].map(([specimenId, rs]) => {
    const tested = rs.filter((r) => lineListResult(r) !== null);
    const results = tested.map((r) => lineListResult(r));
    const types = tested.map((r) => normaliseResultType(r.resultType ?? "Final"));
    const dates = tested.map((r) => r.effectiveDateTime).filter(Boolean).sort();
    // The live /list repeats a specimen's test rows at times; list each test result once.
    const seen = new Set<string>();
    const narration = tested
      .map((r) => ({
        analysis: r.codeText || undefined,
        test_name: r.testName || undefined,
        result: lineListResult(r) ?? String(r.conclusion),
        result_type: normaliseResultType(r.resultType ?? "Final") ?? undefined,
        code: String(r.componentCode || r.code || "").trim() || undefined,
      }))
      .filter((n) => {
        const key = JSON.stringify([n.test_name, n.analysis, n.result, n.code]);
        return !seen.has(key) && !!seen.add(key);
      });
    return {
      specimenId,
      result: results.includes("Positive") ? "Positive" : results.length ? "Negative" : null,
      resultType: types.includes("Final") ? "Final" : types.length ? "Preliminary" : null,
      narration,
      resultDate: dates[dates.length - 1] ?? null,
      testingLab: tested.find((r) => r.testingLabName)?.testingLabName ?? null,
    };
  });
}

const REJECTED = /reject/i;

function rowIsRejection(r: any): boolean {
  return r?.rejected === true || REJECTED.test(String(r?.status ?? "")) || REJECTED.test(String(r?.specimen_status ?? ""));
}

function rejectionFrom(r: any, fallbackReason: string): Rejection {
  const reason = String(r?.rejection_reason ?? r?.rejectionReason ?? "").trim() || fallbackReason;
  return {
    reason,
    date: r?.date_rejected ?? r?.dateRejected ?? r?.effectiveDateTime ?? null,
    lab: r?.other_laboratory_facility ?? r?.testingLabName ?? null,
  };
}

/**
 * Parses result and rejection rows (see parseLabMessages for a POST /lab/results body): an array or { data: [...] } of either
 * - result/rejection entries keyed by specimen_id (the /v1/surveillance response shape, plus
 *   `status`: "final" | "preliminary" | "rejected" and `rejection_reason`), or
 * - lab line-list rows keyed by specimenIdentifier (the lab-staging /list shape); a row whose
 *   status or conclusion says rejected rejects the specimen.
 */
export function parseLabUpdates(body: any): LabUpdate[] {
  const rows = bodyRows(body);
  const updates: LabUpdate[] = [];

  const lineList = rows.filter((r) => r?.specimenIdentifier != null && String(r.specimenIdentifier).trim());
  const rowsFor = (id: string) => lineList.filter((x) => String(x.specimenIdentifier).trim() === id);
  const lineRejected = lineList.filter((r) => rowIsRejection(r) || REJECTED.test(String(r?.conclusion ?? "")));
  const rejectedIds = new Set(lineRejected.map((r) => String(r.specimenIdentifier).trim()));
  for (const id of rejectedIds) {
    const r = lineRejected.find((x) => String(x.specimenIdentifier).trim() === id);
    updates.push({ specimenId: id, ...updateIds(id, rowsFor(id)), kind: "rejected", rejection: rejectionFrom(r, String(r?.conclusion || "Rejected")) });
  }
  for (const result of parseLineListRecords(lineList.filter((r) => !rejectedIds.has(String(r.specimenIdentifier).trim())))) {
    if (result.result) updates.push({ specimenId: result.specimenId, ...updateIds(result.specimenId, rowsFor(result.specimenId)), kind: "result", result });
  }

  for (const r of rows) {
    if (r?.specimenIdentifier != null || r?.specimen_id == null || !String(r.specimen_id).trim()) continue;
    const specimenId = String(r.specimen_id).trim();
    if (rowIsRejection(r) || REJECTED.test(String(r?.laboratory_result ?? ""))) {
      updates.push({ specimenId, ...updateIds(specimenId, [r]), kind: "rejected", rejection: rejectionFrom(r, "Rejected") });
      continue;
    }
    const result = parseSurveillanceEntry({ ...r, specimen_id: specimenId, laboratory_result_type: r.laboratory_result_type ?? r.status });
    if (result.result) updates.push({ specimenId, ...updateIds(specimenId, [r]), kind: "result", result });
  }
  return updates;
}

function bodyRows(body: any): any[] {
  return Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
}

const text = (v: unknown) => (v == null ? "" : String(v).trim());

/** A specimen's order identifier (when it differs from the specimen ID) and lab number, from its rows. */
function updateIds(specimenId: string, rows: any[]): { altIds?: string[]; labNumber?: string } {
  const altIds = [...new Set(rows.map((r) => text(r?.orderIdentifier ?? r?.order_identifier)))].filter(
    (v) => v && v !== specimenId,
  );
  const labNumber = rows.map((r) => text(r?.caseIdentifier ?? r?.lab_number ?? r?.labNumber)).find(Boolean);
  return { ...(altIds.length ? { altIds } : {}), ...(labNumber ? { labNumber } : {}) };
}

const FHIR_DATE_TIME = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;

/** The value when it is a valid FHIR date or dateTime, else null (HAPI rejects the write otherwise). */
function fhirDateTime(v: unknown): string | null {
  const s = text(v);
  return FHIR_DATE_TIME.test(s) ? s : null;
}

const MESSAGE_TYPES: Record<string, "result" | "rejected" | "received" | "in-testing" | "note"> = {
  result: "result",
  results: "result",
  "result-ready": "result",
  "preliminary-result": "result",
  "final-result": "result",
  rejected: "rejected",
  rejection: "rejected",
  "specimen-rejected": "rejected",
  "sample-rejected": "rejected",
  received: "received",
  "specimen-received": "received",
  "sample-received": "received",
  "in-testing": "in-testing",
  testing: "in-testing",
  "testing-in-progress": "in-testing",
  "testing-started": "in-testing",
  note: "note",
  comment: "note",
  message: "note",
};

export type InvalidLabMessage = { index: number; specimenId?: string; error: string };

/**
 * Parses a push to POST /lab/results: an array or { data: [...] } of
 * messages, each with `messageType` (or `message_type`) and the specimen's `specimenIdentifier`
 * (or `specimen_id`):
 * - `result` / `rejected`: as parseLabUpdates (also the type of a message without one);
 * - `received` / `in-testing`: the specimen reached the lab, or testing started, with `date`
 *   and `laboratory`;
 * - `note`: free text (`text`) for the people following the specimen.
 * Messages that cannot be used are returned in `invalid` with their index in the batch.
 */
export function parseLabMessages(body: any): { updates: LabUpdate[]; invalid: InvalidLabMessage[] } {
  const rows = bodyRows(body);
  const updates: LabUpdate[] = [];
  const invalid: InvalidLabMessage[] = [];
  const resultRows: Array<{ index: number; specimenId: string; row: any }> = [];

  rows.forEach((r, index) => {
    if (!r || typeof r !== "object") return invalid.push({ index, error: "Message is not an object" });
    const rawType = text(r.messageType ?? r.message_type);
    const type = rawType ? MESSAGE_TYPES[rawType.toLowerCase().replace(/[\s_]+/g, "-")] : "result";
    const specimenId = text(r.specimenIdentifier ?? r.specimen_id);
    if (!type) return invalid.push({ index, specimenId, error: `Unknown messageType "${rawType}"` });
    if (!specimenId) return invalid.push({ index, error: "Missing specimenIdentifier" });
    if (type === "result" || type === "rejected") {
      resultRows.push({ index, specimenId, row: type === "rejected" ? { ...r, status: "rejected" } : r });
      return;
    }
    const ids = updateIds(specimenId, [r]);
    const date = fhirDateTime(r.date ?? r.dateTime ?? r.effectiveDateTime);
    const lab = text(r.laboratory ?? r.testingLabName ?? r.other_laboratory_facility) || null;
    if (type === "note") {
      const note = text(r.text ?? r.note ?? r.message ?? r.comment);
      if (!note) return invalid.push({ index, specimenId, error: "A note needs text" });
      updates.push({ specimenId, ...ids, kind: "note", note: { text: note.slice(0, 2000), date, lab } });
      return;
    }
    updates.push({ specimenId, ...ids, kind: "progress", progress: { stage: type, date, lab } });
  });

  const parsed = parseLabUpdates(resultRows.map((r) => r.row));
  const parsedIds = new Set(parsed.map((u) => u.specimenId));
  for (const r of resultRows) {
    if (!parsedIds.has(r.specimenId)) invalid.push({ index: r.index, specimenId: r.specimenId, error: "No recognisable result or rejection" });
  }
  return { updates: [...updates, ...parsed], invalid: invalid.sort((a, b) => a.index - b.index) };
}

const PAYLOAD_HASH_INPUT = "submitted-payload-sha256";

export function taskPayloadHash(task: any): string | undefined {
  return (task?.input ?? []).find((i: any) => i?.type?.text === PAYLOAD_HASH_INPUT)?.valueString;
}

export function taskLabNumber(task: any): string | undefined {
  return (task?.identifier ?? []).find((i: any) => i?.system === LAB_NUMBER_SYSTEM)?.value;
}

function labNotes(task: any): any[] {
  return (task?.note ?? []).filter((n: any) => n?.authorString);
}

/** The Task with the lab's note added, or null when the same note is already on it (a re-sent message). */
export function taskWithLabNote(task: any, note: LabNote, now = new Date().toISOString()): any | null {
  const author = note.lab || "Laboratory";
  if (labNotes(task).some((n) => n.text === note.text && n.authorString === author)) return null;
  return { ...task, lastModified: now, note: [...(task.note ?? []), { authorString: author, time: note.date ?? now, text: note.text }] };
}

/**
 * Task state from one POST /v1/surveillance response entry. The live API also returns
 * `rejected` and `rejection_reason` (not in its docs), so a rejection can arrive on the poll too.
 */
export function surveillanceEntryState(entry: any): TaskState {
  if (rowIsRejection(entry) || REJECTED.test(String(entry?.laboratory_result ?? ""))) {
    return { kind: "rejected", rejection: rejectionFrom(entry, "Rejected") };
  }
  return { kind: "submitted", result: parseSurveillanceEntry(entry) };
}

export function taskIdForSpecimen(specimenId: string): string {
  return `nphl-${specimenId}`;
}

export function resultObservationIdForSpecimen(specimenId: string): string {
  return `nphl-result-${specimenId}`;
}

export function resultReportIdForSpecimen(specimenId: string): string {
  return `nphl-report-${specimenId}`;
}

export function taskStatusFor(state: TaskState): { status: string; businessStatus: string; reason?: string } {
  switch (state.kind) {
    case "awaiting-epid":
      return { status: "on-hold", businessStatus: "awaiting-epid", reason: "Case has no EPID yet" };
    case "submission-failed":
      return { status: "requested", businessStatus: "submission-failed", reason: state.error };
    case "rejected":
      return { status: "rejected", businessStatus: "specimen-rejected", reason: state.rejection.reason };
    case "lab-progress":
      return { status: "in-progress", businessStatus: state.progress.stage === "received" ? "received-at-lab" : "in-testing" };
    case "submitted":
      if (!state.result?.result) return { status: "in-progress", businessStatus: "awaiting-result" };
      if (state.result.resultType === "Final") return { status: "completed", businessStatus: "final-result" };
      return { status: "in-progress", businessStatus: "preliminary-result" };
  }
}

const BUSINESS_STATUS_DISPLAY: Record<string, string> = {
  "awaiting-epid": "Waiting for the case EPID",
  "submission-failed": "Submission to NPHL failed; will retry",
  "awaiting-result": "Submitted to NPHL; no result yet",
  "received-at-lab": "Received at the lab",
  "in-testing": "Testing in progress at the lab",
  "preliminary-result": "Preliminary result received",
  "final-result": "Final result received",
  "specimen-rejected": "Specimen rejected by the lab",
};

/** Builds the Task for a Specimen, keeping authoredOn and earlier fields from `existing`. */
export function buildSpecimenTask(args: {
  existing?: any;
  specimen: any;
  caseEncounterId: string;
  state: TaskState;
  resultObservationId?: string;
  resultReportId?: string;
  /** Hash of the payload NPHL accepted; kept from `existing` when not given. */
  payloadHash?: string;
  /** The lab's accession number; kept from `existing` when not given. */
  labNumber?: string;
  now?: string;
}): any {
  const now = args.now ?? new Date().toISOString();
  const label = specimenLabel(args.specimen);
  const { status, businessStatus, reason } = taskStatusFor(args.state);
  const result = args.state.kind === "submitted" ? args.state.result : null;
  const labNumber = args.labNumber ?? taskLabNumber(args.existing);
  const task: any = {
    resourceType: "Task",
    id: taskIdForSpecimen(args.specimen.id),
    identifier: [
      { system: TASK_ID_SYSTEM, value: args.specimen.id },
      { system: SPECIMEN_LABEL_SYSTEM, value: label.value },
      ...(labNumber ? [{ system: LAB_NUMBER_SYSTEM, value: labNumber }] : []),
    ],
    status,
    businessStatus: {
      coding: [{ system: BUSINESS_STATUS_SYSTEM, code: businessStatus, display: BUSINESS_STATUS_DISPLAY[businessStatus] }],
      text: BUSINESS_STATUS_DISPLAY[businessStatus],
    },
    intent: "order",
    code: { coding: [{ system: TASK_CODE_SYSTEM, code: TASK_CODE, display: "Submit specimen to NPHL" }] },
    focus: { reference: `Specimen/${args.specimen.id}` },
    for: args.specimen.subject,
    encounter: { reference: `Encounter/${args.caseEncounterId}` },
    authoredOn: args.existing?.authoredOn ?? now,
    lastModified: now,
    owner: { display: "National Public Health Laboratory (NPHL)" },
    input: [
      { type: { text: "specimen-label" }, valueString: label.value },
      { type: { text: "specimen-label-source" }, valueString: label.source },
    ],
  };
  const payloadHash = args.payloadHash ?? taskPayloadHash(args.existing);
  if (payloadHash) task.input.push({ type: { text: PAYLOAD_HASH_INPUT }, valueString: payloadHash });
  if (reason) task.statusReason = { text: reason.slice(0, 1000) };
  // Notes from the lab (they have an author) are kept; ours is rebuilt.
  const notes = labNotes(args.existing);
  if (label.source === "fhir-id") {
    notes.unshift({
      time: now,
      text: "Specimen has no tube label ID; submitted to NPHL with its FHIR id. Results only match if the lab records the same ID.",
    });
  }
  if (notes.length) task.note = notes;
  if (args.state.kind === "lab-progress") {
    const { stage, date, lab } = args.state.progress;
    task.output = [
      ...(date ? [{ type: { text: `${stage}-on` }, valueDateTime: date }] : []),
      ...(lab ? [{ type: { text: "laboratory" }, valueString: lab }] : []),
    ];
    if (!task.output.length) delete task.output;
  }
  if (result?.result) {
    task.output = [
      { type: { text: "result" }, valueString: result.result },
      ...(args.resultObservationId
        ? [{ type: { text: "result-observation" }, valueReference: { reference: `Observation/${args.resultObservationId}` } }]
        : []),
      ...(args.resultReportId
        ? [{ type: { text: "result-report" }, valueReference: { reference: `DiagnosticReport/${args.resultReportId}` } }]
        : []),
    ];
  }
  if (args.state.kind === "rejected") {
    const { rejection } = args.state;
    task.output = [
      { type: { text: "rejection-reason" }, valueString: rejection.reason },
      ...(rejection.lab ? [{ type: { text: "rejected-by" }, valueString: rejection.lab }] : []),
      ...(rejection.date ? [{ type: { text: "rejected-on" }, valueDateTime: rejection.date }] : []),
    ];
  }
  if (status === "completed" || status === "rejected") task.executionPeriod = { start: args.existing?.executionPeriod?.start ?? task.authoredOn, end: now };
  else task.executionPeriod = { start: args.existing?.executionPeriod?.start ?? task.authoredOn };
  return task;
}

export const TEST_RESULT_CODE = "nphl-lab-test-result";

type TestResult = { id: string; name: string; value: string; status: "final" | "preliminary"; code?: string };

const LOINC = "http://loinc.org";

const loincCoding = (code?: string) => (code ? [{ system: LOINC, code }] : []);

/**
 * One entry per test in the lab's narration. The id is keyed on the test name, so a re-poll
 * updates the same Observation; it is hashed because a FHIR id is at most 64 characters.
 */
export function testResultsFor(specimenId: string, result: NphlResult): TestResult[] {
  const seen = new Set<string>();
  const out: TestResult[] = [];
  for (const n of result.narration) {
    const raw = String(n.result ?? "").trim();
    if (!raw) continue;
    const name = [n.test_name, n.analysis].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" — ") || "Test";
    const key = name.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const type = normaliseResultType(n.result_type) ?? result.resultType;
    out.push({
      id: `${resultObservationIdForSpecimen(specimenId)}-${createHash("sha256").update(key).digest("hex").slice(0, 8)}`,
      name,
      value: normaliseResult(raw) ?? raw,
      status: type === "Final" ? "final" : "preliminary",
      ...(n.code ? { code: n.code } : {}),
    });
  }
  return out;
}

/**
 * The result as stored on a result Observation, for rebuilding what is derived from it. Each
 * component's text is "test name — analysis" (see buildResultObservation).
 */
export function resultFromObservation(obs: any): NphlResult | null {
  const result = normaliseResult(obs?.valueString);
  if (!result) return null;
  return {
    specimenId: refId(obs.specimen?.reference, "Specimen") ?? "",
    result,
    resultType: obs.status === "final" ? "Final" : "Preliminary",
    narration: (obs.component ?? []).map((c: any) => {
      const [test_name, analysis] = String(c?.code?.text ?? "").split(" — ");
      const code = (c?.code?.coding ?? []).find((x: any) => x?.system === LOINC)?.code;
      return { test_name: test_name || undefined, analysis: analysis || undefined, result: c?.valueString, ...(code ? { code } : {}) };
    }),
    resultDate: obs.effectiveDateTime ?? null,
    testingLab: obs.performer?.[0]?.display ?? null,
  };
}

/** One Observation per test, each a member of the specimen's result Observation. */
export function buildTestObservations(args: { specimen: any; caseEncounterId: string; result: NphlResult }): any[] {
  const { result } = args;
  return testResultsFor(args.specimen.id, result).map((t) => ({
    resourceType: "Observation",
    id: t.id,
    status: t.status,
    category: [
      {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }],
      },
    ],
    code: {
      coding: [{ system: RESULT_CODE_SYSTEM, code: TEST_RESULT_CODE, display: "NPHL test result" }, ...loincCoding(t.code)],
      text: t.name,
    },
    subject: args.specimen.subject,
    encounter: { reference: `Encounter/${args.caseEncounterId}` },
    specimen: { reference: `Specimen/${args.specimen.id}` },
    ...(result.resultDate ? { effectiveDateTime: result.resultDate } : {}),
    ...(result.testingLab ? { performer: [{ display: result.testingLab }] } : {}),
    valueString: t.value,
  }));
}

export function buildResultObservation(args: { specimen: any; caseEncounterId: string; result: NphlResult }): any {
  const { result } = args;
  const tests = testResultsFor(args.specimen.id, result);
  return {
    resourceType: "Observation",
    id: resultObservationIdForSpecimen(args.specimen.id),
    status: result.resultType === "Final" ? "final" : "preliminary",
    category: [
      {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }],
      },
    ],
    code: { coding: [{ system: RESULT_CODE_SYSTEM, code: RESULT_CODE, display: "NPHL laboratory result" }] },
    subject: args.specimen.subject,
    encounter: { reference: `Encounter/${args.caseEncounterId}` },
    specimen: { reference: `Specimen/${args.specimen.id}` },
    ...(result.resultDate ? { effectiveDateTime: result.resultDate } : {}),
    ...(result.testingLab ? { performer: [{ display: result.testingLab }] } : {}),
    valueString: result.result,
    component: result.narration.map((n) => ({
      code: {
        ...(n.code ? { coding: loincCoding(n.code) } : {}),
        text: [n.test_name, n.analysis].filter(Boolean).join(" — ") || "Test",
      },
      valueString: n.result ?? "",
    })),
    ...(tests.length ? { hasMember: tests.map((t) => ({ reference: `Observation/${t.id}` })) } : {}),
  };
}

/**
 * The lab report for one specimen: links the case Encounter, the Specimen, the overall result
 * Observation and each test's Observation, so a case's lab results can be read with
 * DiagnosticReport?encounter=.
 */
export function buildResultDiagnosticReport(args: { specimen: any; caseEncounterId: string; result: NphlResult }): any {
  const { result } = args;
  return {
    resourceType: "DiagnosticReport",
    id: resultReportIdForSpecimen(args.specimen.id),
    status: result.resultType === "Final" ? "final" : "preliminary",
    category: [
      { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory" }] },
    ],
    code: { coding: [{ system: RESULT_CODE_SYSTEM, code: RESULT_CODE, display: "NPHL laboratory result" }] },
    subject: args.specimen.subject,
    encounter: { reference: `Encounter/${args.caseEncounterId}` },
    ...(result.resultDate ? { effectiveDateTime: result.resultDate } : {}),
    ...(result.testingLab ? { performer: [{ display: result.testingLab }] } : {}),
    specimen: [{ reference: `Specimen/${args.specimen.id}` }],
    result: [
      { reference: `Observation/${resultObservationIdForSpecimen(args.specimen.id)}` },
      ...testResultsFor(args.specimen.id, result).map((t) => ({ reference: `Observation/${t.id}` })),
    ],
    ...(result.result ? { conclusion: result.result } : {}),
  };
}

/** True when `next` would change the stored DiagnosticReport. */
export function reportChanged(existingReport: any, next: any): boolean {
  if (!existingReport || existingReport.resourceType !== "DiagnosticReport") return true;
  const strip = (r: any) =>
    JSON.stringify({
      status: r.status,
      subject: r.subject,
      encounter: r.encounter,
      effectiveDateTime: r.effectiveDateTime,
      performer: r.performer,
      specimen: r.specimen,
      result: r.result,
      conclusion: r.conclusion,
    });
  return strip(existingReport) !== strip(next);
}

/** True when `next` would change what is already stored, to avoid a new version per poll. */
export function resultChanged(existingObservation: any, next: any): boolean {
  if (!existingObservation || existingObservation.resourceType !== "Observation") return true;
  const strip = (o: any) =>
    JSON.stringify({
      status: o.status,
      valueString: o.valueString,
      effectiveDateTime: o.effectiveDateTime,
      performer: o.performer,
      component: o.component,
      hasMember: o.hasMember,
      code: o.code,
      subject: o.subject,
      encounter: o.encounter,
      specimen: o.specimen,
    });
  return strip(existingObservation) !== strip(next);
}

export const SPECIMEN_LAB_STATUS_EXT = "http://nphiis.health.go.ke/fhir/StructureDefinition/nphl-lab-status";
const LAB_STATUS_ON_SPECIMEN = new Set([
  "awaiting-result",
  "received-at-lab",
  "in-testing",
  "preliminary-result",
  "final-result",
  "specimen-rejected",
]);

/**
 * The Specimen with its lab progress from `task`: the businessStatus in the nphl-lab-status
 * extension, and status "unsatisfactory" while the lab has it rejected. Only once the specimen
 * has reached the lab; null when nothing would change. The date the lab received it becomes
 * receivedTime, unless the Specimen already has one.
 */
export function specimenWithLabStatus(specimen: any, task: any): any | null {
  const coding = task?.businessStatus?.coding?.[0];
  if (!LAB_STATUS_ON_SPECIMEN.has(coding?.code)) return null;
  const others = (specimen?.extension ?? []).filter((e: any) => e?.url !== SPECIMEN_LAB_STATUS_EXT);
  const previous = (specimen?.extension ?? []).find((e: any) => e?.url === SPECIMEN_LAB_STATUS_EXT)?.valueCoding?.code;
  const rejected = coding.code === "specimen-rejected";
  const status = rejected
    ? "unsatisfactory"
    : previous === "specimen-rejected" && specimen?.status === "unsatisfactory"
      ? "available"
      : specimen?.status;
  const receivedOn = (task?.output ?? []).find((o: any) => o?.type?.text === "received-on")?.valueDateTime;
  const receivedTime = specimen?.receivedTime ?? receivedOn;
  if (previous === coding.code && status === specimen?.status && receivedTime === specimen?.receivedTime) return null;
  return {
    ...specimen,
    ...(status ? { status } : {}),
    ...(receivedTime ? { receivedTime } : {}),
    extension: [...others, { url: SPECIMEN_LAB_STATUS_EXT, valueCoding: { system: coding.system, code: coding.code, display: coding.display } }],
  };
}

const NOTIFY_ON = new Set(["preliminary-result", "final-result", "specimen-rejected"]);

/** The outcome to email the case submitter about when a Task moves from `existing` to `next`, else null. */
export function notifiableOutcome(existing: any, next: any): string | null {
  const code = next?.businessStatus?.coding?.[0]?.code;
  if (!NOTIFY_ON.has(code)) return null;
  return existing?.businessStatus?.coding?.[0]?.code === code ? null : code;
}

/** Rows for the lab result email, from the specimen's Task and (for a result) its Observation. */
export function labOutcomeEmailLines(task: any, observation?: any): Array<{ label: string; value: string }> {
  const out = (name: string) => (task?.output ?? []).find((o: any) => o?.type?.text === name);
  const label = (task?.identifier ?? []).find((i: any) => i?.system === SPECIMEN_LABEL_SYSTEM)?.value;
  const lines = [
    { label: "Specimen ID", value: label ?? task?.focus?.reference ?? "—" },
    { label: "Status", value: task?.businessStatus?.text ?? "—" },
  ];
  if (task?.status === "rejected") {
    lines.push({ label: "Rejection reason", value: out("rejection-reason")?.valueString ?? task?.statusReason?.text ?? "—" });
    const on = out("rejected-on")?.valueDateTime;
    if (on) lines.push({ label: "Rejected on", value: String(on) });
    return lines;
  }
  lines.push({ label: "Result", value: out("result")?.valueString ?? observation?.valueString ?? "—" });
  if (observation?.effectiveDateTime) lines.push({ label: "Result date", value: String(observation.effectiveDateTime) });
  for (const c of observation?.component ?? []) lines.push({ label: c?.code?.text ?? "Test", value: c?.valueString || "—" });
  return lines;
}

export function taskChanged(existing: any, next: any): boolean {
  if (!existing || existing.resourceType !== "Task") return true;
  const strip = (t: any) =>
    JSON.stringify({
      status: t.status,
      businessStatus: t.businessStatus?.coding?.[0]?.code,
      statusReason: t.statusReason?.text,
      output: t.output,
      identifier: t.identifier,
      input: t.input,
      notes: labNotes(t),
    });
  return strip(existing) !== strip(next);
}

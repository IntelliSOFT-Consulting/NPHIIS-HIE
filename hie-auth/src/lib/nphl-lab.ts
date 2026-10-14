/**
 * Pure helpers for the NPHL Surveillance Data API (POST /v1/surveillance, docs at
 * https://data-apis.nphl.go.ke/). One call carries one case record and every specimen
 * collected for it; the response returns the lab's current result for each specimen.
 *
 * Each Specimen's journey to the lab is tracked with a FHIR Task (one per Specimen),
 * and results are written back as an Observation on the case.
 */

export const VHF_CASE_REASON = "VHF Case Information";
export const WORKFLOW_ENCOUNTER_EXT = "http://hl7.org/fhir/StructureDefinition/workflow-encounter";

export const TASK_CODE_SYSTEM = "http://nphiis.health.go.ke/fhir/CodeSystem/task-code";
export const TASK_CODE = "nphl-specimen-submission";
export const TASK_ID_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/nphl-specimen-task";
/** The ID printed on the sample tube; NPHL matches results on it. */
export const SPECIMEN_LABEL_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/specimen-id";
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
  narration: Array<{ analysis?: string; test_name?: string; test_method?: string; result?: string; result_type?: string }>;
  resultDate: string | null;
  testingLab: string | null;
};

export type Rejection = { reason: string; date: string | null; lab: string | null };

export type TaskState =
  | { kind: "awaiting-epid" }
  | { kind: "submission-failed"; error: string }
  | { kind: "submitted"; result: NphlResult | null }
  | { kind: "rejected"; rejection: Rejection };

/** One update the lab system pushes for a specimen: a result, or the specimen's rejection. */
export type LabUpdate =
  | { specimenId: string; kind: "result"; result: NphlResult }
  | { specimenId: string; kind: "rejected"; rejection: Rejection };

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

function normaliseResult(v: unknown): "Positive" | "Negative" | null {
  if (v == null || String(v).trim() === "") return null;
  return /^negative$/i.test(String(v).trim()) ? "Negative" : "Positive";
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
    const tested = rs.filter((r) => normaliseResult(r.conclusion) !== null);
    const results = tested.map((r) => normaliseResult(r.conclusion));
    const types = tested.map((r) => normaliseResultType(r.resultType ?? "Final"));
    const dates = tested.map((r) => r.effectiveDateTime).filter(Boolean).sort();
    return {
      specimenId,
      result: results.includes("Positive") ? "Positive" : results.length ? "Negative" : null,
      resultType: types.includes("Final") ? "Final" : types.length ? "Preliminary" : null,
      narration: tested.map((r) => ({
        analysis: r.codeText || undefined,
        test_name: r.testName || undefined,
        result: String(r.conclusion),
        result_type: normaliseResultType(r.resultType ?? "Final") ?? undefined,
      })),
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
 * Parses a push to POST /lab/results: an array or { data: [...] } of either
 * - result/rejection entries keyed by specimen_id (the /v1/surveillance response shape, plus
 *   `status`: "final" | "preliminary" | "rejected" and `rejection_reason`), or
 * - lab line-list rows keyed by specimenIdentifier (the lab-staging /list shape); a row whose
 *   status or conclusion says rejected rejects the specimen.
 */
export function parseLabUpdates(body: any): LabUpdate[] {
  const rows: any[] = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  const updates: LabUpdate[] = [];

  const lineList = rows.filter((r) => r?.specimenIdentifier != null && String(r.specimenIdentifier).trim());
  const lineRejected = lineList.filter((r) => rowIsRejection(r) || REJECTED.test(String(r?.conclusion ?? "")));
  const rejectedIds = new Set(lineRejected.map((r) => String(r.specimenIdentifier).trim()));
  for (const id of rejectedIds) {
    const r = lineRejected.find((x) => String(x.specimenIdentifier).trim() === id);
    updates.push({ specimenId: id, kind: "rejected", rejection: rejectionFrom(r, String(r?.conclusion || "Rejected")) });
  }
  for (const result of parseLineListRecords(lineList.filter((r) => !rejectedIds.has(String(r.specimenIdentifier).trim())))) {
    if (result.result) updates.push({ specimenId: result.specimenId, kind: "result", result });
  }

  for (const r of rows) {
    if (r?.specimenIdentifier != null || r?.specimen_id == null || !String(r.specimen_id).trim()) continue;
    const specimenId = String(r.specimen_id).trim();
    if (rowIsRejection(r) || REJECTED.test(String(r?.laboratory_result ?? ""))) {
      updates.push({ specimenId, kind: "rejected", rejection: rejectionFrom(r, "Rejected") });
      continue;
    }
    const result = parseSurveillanceEntry({ ...r, specimen_id: specimenId, laboratory_result_type: r.laboratory_result_type ?? r.status });
    if (result.result) updates.push({ specimenId, kind: "result", result });
  }
  return updates;
}

const PAYLOAD_HASH_INPUT = "submitted-payload-sha256";

export function taskPayloadHash(task: any): string | undefined {
  return (task?.input ?? []).find((i: any) => i?.type?.text === PAYLOAD_HASH_INPUT)?.valueString;
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

export function taskStatusFor(state: TaskState): { status: string; businessStatus: string; reason?: string } {
  switch (state.kind) {
    case "awaiting-epid":
      return { status: "on-hold", businessStatus: "awaiting-epid", reason: "Case has no EPID yet" };
    case "submission-failed":
      return { status: "requested", businessStatus: "submission-failed", reason: state.error };
    case "rejected":
      return { status: "rejected", businessStatus: "specimen-rejected", reason: state.rejection.reason };
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
  /** Hash of the payload NPHL accepted; kept from `existing` when not given. */
  payloadHash?: string;
  now?: string;
}): any {
  const now = args.now ?? new Date().toISOString();
  const label = specimenLabel(args.specimen);
  const { status, businessStatus, reason } = taskStatusFor(args.state);
  const result = args.state.kind === "submitted" ? args.state.result : null;
  const task: any = {
    resourceType: "Task",
    id: taskIdForSpecimen(args.specimen.id),
    identifier: [
      { system: TASK_ID_SYSTEM, value: args.specimen.id },
      { system: SPECIMEN_LABEL_SYSTEM, value: label.value },
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
  if (label.source === "fhir-id") {
    task.note = [
      {
        time: now,
        text: "Specimen has no tube label ID; submitted to NPHL with its FHIR id. Results only match if the lab records the same ID.",
      },
    ];
  }
  if (result?.result) {
    task.output = [
      { type: { text: "result" }, valueString: result.result },
      ...(args.resultObservationId
        ? [{ type: { text: "result-observation" }, valueReference: { reference: `Observation/${args.resultObservationId}` } }]
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

export function buildResultObservation(args: { specimen: any; caseEncounterId: string; result: NphlResult }): any {
  const { result } = args;
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
      code: { text: [n.test_name, n.analysis].filter(Boolean).join(" — ") || "Test" },
      valueString: n.result ?? "",
    })),
  };
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
    });
  return strip(existingObservation) !== strip(next);
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
    });
  return strip(existing) !== strip(next);
}

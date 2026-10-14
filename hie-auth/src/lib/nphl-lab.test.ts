import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  SPECIMEN_LABEL_SYSTEM,
  buildClinicalInformation,
  buildResultObservation,
  buildSpecimenTask,
  buildSurveillancePayload,
  isVhfCaseEncounter,
  nairobiDate,
  observationValues,
  parseLabUpdates,
  parseLineListRecords,
  parseSurveillanceEntry,
  resultChanged,
  surveillanceEntryState,
  specimenCaseEncounterId,
  specimenLabel,
  taskChanged,
  taskStatusFor,
} from "./nphl-lab";

// Shapes match what the mobile VHF case form writes; values are synthetic.
const specimen = (over: Record<string, unknown> = {}) => ({
  resourceType: "Specimen",
  id: "spec-1",
  extension: [
    {
      url: "http://hl7.org/fhir/StructureDefinition/workflow-encounter",
      valueReference: { reference: "Encounter/case-1" },
    },
  ],
  type: {
    coding: [
      { system: "http://terminology.hl7.org/CodeSystem/v2-0487", code: "BLD", display: "Whole blood" },
      { system: "specimen-details", code: "vhf-sample-type", display: "Blood" },
    ],
    text: "Blood",
  },
  subject: { reference: "Patient/pat-1" },
  collection: { collectedDateTime: "2026-10-13T21:00:00Z" },
  ...over,
});

const obs = (code: string, valueString: string, lastUpdated = "2026-10-14T10:00:00Z") => ({
  resourceType: "Observation",
  meta: { lastUpdated },
  code: { coding: [{ code }] },
  valueString,
});

const caseObservations = [
  obs("486402457213", "Testfamily"),
  obs("873240407472", "Testgiven"),
  obs("929966324957", "Female"),
  obs("492731638700", "32"),
  obs("185726989867", "11"),
  obs("828303331247", "15"),
  obs("a4-county", "KERICHO"),
  obs("a3-sub-county", "KIPKELION EAST"),
  obs("vhf-symptoms", "Other (specify), Diarrhea, Fatigue"),
  obs("vhf-symptoms-other", "Abdominal pain"),
  obs("728034137219", "2026-05-17"),
  obs("vhf-onset-fatigue", "2026-05-20"),
  obs("vhf-onset-other", "2026-05-19"),
  obs("vhf-care-type", "Outpatient"),
  obs("vhf-outcome", "Alive"),
  obs("vhf-ebola-vaccinated", "No"),
];

const patient = {
  resourceType: "Patient",
  id: "pat-1",
  gender: "unknown",
  name: [{ family: "Fallbackfamily", given: ["Fallbackgiven"] }],
  address: [{ city: "NAIROBI", state: "WESTLANDS" }],
};

describe("specimen links", () => {
  it("reads the case encounter from the workflow-encounter extension", () => {
    expect(specimenCaseEncounterId(specimen())).toBe("case-1");
    expect(specimenCaseEncounterId(specimen({ extension: [] }))).toBeNull();
  });

  it("recognises VHF case encounters by reason code", () => {
    expect(isVhfCaseEncounter({ reasonCode: [{ coding: [{ code: "VHF Case Information" }] }] })).toBe(true);
    expect(isVhfCaseEncounter({ reasonCode: [{ coding: [{ code: "Measles Case Information" }] }] })).toBe(false);
  });
});

describe("specimenLabel", () => {
  it("prefers the specimen-id identifier", () => {
    const s = specimen({
      identifier: [
        { system: "other", value: "X" },
        { system: SPECIMEN_LABEL_SYSTEM, value: " 25-TE3ST " },
      ],
    });
    expect(specimenLabel(s)).toEqual({ value: "25-TE3ST", source: "identifier" });
  });

  it("falls back to the FHIR id when the tube label is not captured", () => {
    expect(specimenLabel(specimen())).toEqual({ value: "spec-1", source: "fhir-id" });
  });
});

describe("fixtures/vhf-specimen.json (the shape mobile is asked to write)", () => {
  const fixture = JSON.parse(readFileSync(join(__dirname, "../../fixtures/vhf-specimen.json"), "utf8"));

  it("gives NPHL the tube label, the case and the Kenyan collection date", () => {
    expect(specimenLabel(fixture)).toEqual({ value: "KEN-KER-KIE-2026-VHF-001-S1", source: "identifier" });
    expect(specimenCaseEncounterId(fixture)).toBe("4e42232c-df7c-4795-85b8-73b88eedcadd");
    const [entry] = buildSurveillancePayload({
      caseEncounterId: "4e42232c-df7c-4795-85b8-73b88eedcadd",
      epid: "KEN-KER-KIE-2026-VHF-001",
      patient,
      observations: [],
      specimens: [fixture],
    }).record_payload;
    expect(entry.laboratory).toMatchObject({
      specimen_id: "KEN-KER-KIE-2026-VHF-001-S1",
      type_of_sample: "Blood",
      date_of_collection: "2026-10-14",
    });
  });
});

describe("nairobiDate", () => {
  it("reports local midnight stored as UTC as the Kenyan date", () => {
    expect(nairobiDate("2026-10-13T21:00:00Z")).toBe("2026-10-14");
    expect(nairobiDate("2026-10-13")).toBe("2026-10-13");
    expect(nairobiDate(undefined)).toBeNull();
  });
});

describe("observationValues", () => {
  it("keeps the latest value per code", () => {
    const v = observationValues([
      obs("vhf-outcome", "Alive", "2026-10-14T10:00:00Z"),
      obs("vhf-outcome", "Dead", "2026-10-15T10:00:00Z"),
    ]);
    expect(v.get("vhf-outcome")).toBe("Dead");
  });
});

describe("buildClinicalInformation", () => {
  it("turns the symptom list into Yes flags with onset dates", () => {
    expect(buildClinicalInformation(observationValues(caseObservations))).toEqual({
      diarrhea: "Yes",
      fatigue: "Yes",
      other_symptoms: "Abdominal pain",
      date_of_onset: "2026-05-17",
      date_of_onset_of_fatigue: "2026-05-20",
      date_of_onset_of_other_symptom: "2026-05-19",
    });
  });
});

describe("buildSurveillancePayload", () => {
  const payload = buildSurveillancePayload({
    caseEncounterId: "case-1",
    epid: "KEN-KER-KIE-2026-VHF-001",
    patient,
    observations: caseObservations,
    specimens: [specimen(), specimen({ id: "spec-2", identifier: [{ system: SPECIMEN_LABEL_SYSTEM, value: "LAB-2" }] })],
  });

  it("sends one case with one entry per specimen", () => {
    expect(payload.record_ident).toBe("case-1");
    expect(payload.record_payload.map((p) => p.laboratory.specimen_id)).toEqual(["spec-1", "LAB-2"]);
  });

  it("fills the laboratory block from the Specimen", () => {
    expect(payload.record_payload[0].laboratory).toMatchObject({
      sample_collected: "Yes",
      type_of_sample: "Blood",
      date_of_collection: "2026-10-14",
      laboratory_tests: ["RT-PCR"],
    });
  });

  it("carries the EPID and VHF sections", () => {
    const rec = payload.record_payload[0].record_payload;
    expect(rec.initial.EPID).toBe("KEN-KER-KIE-2026-VHF-001");
    expect(Object.keys(rec.sections)).toEqual([
      "case_demographics",
      "clinical_information_vhf",
      "clinical_care_vhf",
      "vaccination_information_vhf",
    ]);
    expect(rec.sections.case_demographics[0]).toEqual({
      given: "Testgiven",
      family: "Testfamily",
      sex: "Female",
      age_years: "32",
      age_months: "11",
      age_days: "15",
      county: "KERICHO",
      subcounty: "KIPKELION EAST",
    });
    expect(rec.sections.clinical_care_vhf[0]).toEqual({ care_type: "Outpatient", outcome: "Alive" });
    expect(rec.sections.vaccination_information_vhf[0]).toEqual({ ebola_vaccinated: "No" });
  });

  it("falls back to the Patient name and address, and reports 'Other' sex as specified", () => {
    const p = buildSurveillancePayload({
      caseEncounterId: "case-1",
      epid: "E",
      patient: { ...patient, birthDate: "1990-01-15" },
      observations: [obs("929966324957", "Other (specify)"), obs("vhf-sex-other", "Intersex"), obs("492731638700", "32")],
      specimens: [specimen()],
    });
    expect(p.record_payload[0].record_payload.sections.case_demographics[0]).toEqual({
      given: "Fallbackgiven",
      family: "Fallbackfamily",
      sex: "Intersex",
      date_of_birth: "1990-01-15",
      county: "NAIROBI",
      subcounty: "WESTLANDS",
    });
  });
});

describe("parseSurveillanceEntry", () => {
  it("normalises a final result", () => {
    expect(
      parseSurveillanceEntry({
        specimen_id: "25-TE3ST",
        laboratory_result: "Positive",
        laboratory_result_type: "Final",
        laboratory_result_narration: [{ test_name: "Ebola PCR", result: "Detected" }],
        date_of_laboratory_result: "2026-04-07T00:00:00.000Z",
        other_laboratory_facility: "NVRL",
      }),
    ).toEqual({
      specimenId: "25-TE3ST",
      result: "Positive",
      resultType: "Final",
      narration: [{ test_name: "Ebola PCR", result: "Detected" }],
      resultDate: "2026-04-07T00:00:00.000Z",
      testingLab: "NVRL",
    });
  });

  it("returns null results when the specimen is not tested yet", () => {
    const r = parseSurveillanceEntry({ specimen_id: "A", laboratory_result: null, laboratory_result_narration: [] });
    expect(r.result).toBeNull();
    expect(r.resultType).toBeNull();
  });
});

describe("surveillanceEntryState", () => {
  // Shape of a live POST /v1/surveillance response entry (2026-10-14).
  const live = {
    record_ident: "case-1",
    specimen_id: "spec-1",
    laboratory_tests: ["RT-PCR"],
    laboratory_result: null,
    laboratory_result_type: null,
    rejected: false,
    rejection_reason: null,
    laboratory_result_narration: [],
    date_of_laboratory_result: null,
    other_laboratory_facility: null,
  };

  it("is submitted with no result while the lab has not tested it", () => {
    expect(surveillanceEntryState(live)).toEqual({
      kind: "submitted",
      result: { specimenId: "spec-1", result: null, resultType: null, narration: [], resultDate: null, testingLab: null },
    });
  });

  it("is rejected when NPHL flags the specimen rejected", () => {
    expect(surveillanceEntryState({ ...live, rejected: true, rejection_reason: "Insufficient volume", other_laboratory_facility: "NVRL" })).toEqual({
      kind: "rejected",
      rejection: { reason: "Insufficient volume", date: null, lab: "NVRL" },
    });
  });
});

describe("parseLineListRecords", () => {
  const row = (testName: string, conclusion: string) => ({
    specimenIdentifier: "NVRL/ML/0001/26",
    testName,
    codeText: `${testName} Virus`,
    conclusion,
    effectiveDateTime: "2026-10-11",
    testingLabName: "National Virology Reference Laboratory (NVRL)",
  });

  it("groups test rows per specimen; any positive test makes the specimen positive", () => {
    const [r] = parseLineListRecords([row("EVD", "Negative"), row("Marburg", "Positive")]);
    expect(r).toMatchObject({ specimenId: "NVRL/ML/0001/26", result: "Positive", resultType: "Final", resultDate: "2026-10-11" });
    expect(r.narration).toHaveLength(2);
  });

  it("is negative when every test is negative", () => {
    expect(parseLineListRecords([row("EVD", "Negative"), row("Marburg", "Negative")])[0].result).toBe("Negative");
  });
});

describe("parseLabUpdates", () => {
  it("accepts line-list rows and specimen_id entries, as an array or under data", () => {
    const u = parseLabUpdates({
      data: [
        { specimenIdentifier: "A", testName: "EVD", conclusion: "Negative" },
        { specimen_id: "B", laboratory_result: "Positive", status: "preliminary" },
        { specimen_id: "C", laboratory_result: "Negative", laboratory_result_type: "Final" },
      ],
    });
    expect(u.map((x) => [x.specimenId, x.kind, x.kind === "result" ? x.result.result : null, x.kind === "result" ? x.result.resultType : null])).toEqual([
      ["A", "result", "Negative", "Final"],
      ["B", "result", "Positive", "Preliminary"],
      ["C", "result", "Negative", "Final"],
    ]);
    expect(parseLabUpdates([{ specimen_id: "D", laboratory_result: "Negative" }])).toHaveLength(1);
    expect(parseLabUpdates({})).toEqual([]);
  });

  it("parses a rejection with its reason, date and lab", () => {
    expect(
      parseLabUpdates([
        { specimen_id: "R1", status: "rejected", rejection_reason: "Haemolysed", date_rejected: "2026-10-14", other_laboratory_facility: "NVRL" },
      ]),
    ).toEqual([
      { specimenId: "R1", kind: "rejected", rejection: { reason: "Haemolysed", date: "2026-10-14", lab: "NVRL" } },
    ]);
  });

  it("never reads a rejection as a positive result", () => {
    const [u] = parseLabUpdates([{ specimenIdentifier: "R2", testName: "EVD", conclusion: "Sample Rejected", testingLabName: "NVRL" }]);
    expect(u).toMatchObject({ specimenId: "R2", kind: "rejected", rejection: { reason: "Sample Rejected", lab: "NVRL" } });
    const [v] = parseLabUpdates([{ specimen_id: "R3", laboratory_result: "Rejected" }]);
    expect(v).toMatchObject({ kind: "rejected", rejection: { reason: "Rejected" } });
  });

  it("drops entries with no result and no rejection", () => {
    expect(parseLabUpdates([{ specimen_id: "E", laboratory_result: null }])).toEqual([]);
  });
});

describe("Task lifecycle", () => {
  const result = (resultType: "Final" | "Preliminary" | null, value: "Positive" | "Negative" | null = "Negative") => ({
    specimenId: "spec-1",
    result: value,
    resultType,
    narration: [],
    resultDate: null,
    testingLab: null,
  });

  it("maps states to Task status and business status", () => {
    expect(taskStatusFor({ kind: "awaiting-epid" })).toMatchObject({ status: "on-hold", businessStatus: "awaiting-epid" });
    expect(taskStatusFor({ kind: "submission-failed", error: "x" })).toMatchObject({ status: "requested", businessStatus: "submission-failed" });
    expect(taskStatusFor({ kind: "submitted", result: null })).toMatchObject({ status: "in-progress", businessStatus: "awaiting-result" });
    expect(taskStatusFor({ kind: "submitted", result: result(null, null) })).toMatchObject({ businessStatus: "awaiting-result" });
    expect(taskStatusFor({ kind: "submitted", result: result("Preliminary") })).toMatchObject({ status: "in-progress", businessStatus: "preliminary-result" });
    expect(taskStatusFor({ kind: "submitted", result: result("Final") })).toMatchObject({ status: "completed", businessStatus: "final-result" });
    expect(taskStatusFor({ kind: "rejected", rejection: { reason: "Leaked", date: null, lab: null } })).toEqual({
      status: "rejected",
      businessStatus: "specimen-rejected",
      reason: "Leaked",
    });
  });

  it("records the rejection reason on the Task and closes it", () => {
    const t = buildSpecimenTask({
      specimen: specimen(),
      caseEncounterId: "case-1",
      state: { kind: "rejected", rejection: { reason: "Leaked in transit", date: "2026-10-14", lab: "NVRL" } },
      now: "2026-10-15T00:00:00Z",
    });
    expect(t.status).toBe("rejected");
    expect(t.statusReason).toEqual({ text: "Leaked in transit" });
    expect(t.output).toEqual([
      { type: { text: "rejection-reason" }, valueString: "Leaked in transit" },
      { type: { text: "rejected-by" }, valueString: "NVRL" },
      { type: { text: "rejected-on" }, valueDateTime: "2026-10-14" },
    ]);
    expect(t.executionPeriod.end).toBe("2026-10-15T00:00:00Z");
  });

  it("builds a Task linking specimen, patient and case, keyed for idempotency", () => {
    const t = buildSpecimenTask({
      specimen: specimen(),
      caseEncounterId: "case-1",
      state: { kind: "submitted", result: result("Final") },
      resultObservationId: "nphl-result-spec-1",
      now: "2026-10-14T12:00:00Z",
    });
    expect(t).toMatchObject({
      resourceType: "Task",
      id: "nphl-spec-1",
      status: "completed",
      intent: "order",
      focus: { reference: "Specimen/spec-1" },
      for: { reference: "Patient/pat-1" },
      encounter: { reference: "Encounter/case-1" },
      executionPeriod: { start: "2026-10-14T12:00:00Z", end: "2026-10-14T12:00:00Z" },
    });
    expect(t.identifier).toContainEqual({ system: SPECIMEN_LABEL_SYSTEM, value: "spec-1" });
    expect(t.output).toContainEqual({ type: { text: "result-observation" }, valueReference: { reference: "Observation/nphl-result-spec-1" } });
    expect(t.note?.[0].text).toMatch(/no tube label/);
  });

  it("keeps authoredOn from the existing Task", () => {
    const t = buildSpecimenTask({
      existing: { authoredOn: "2026-10-01T00:00:00Z", executionPeriod: { start: "2026-10-01T00:00:00Z" } },
      specimen: specimen(),
      caseEncounterId: "case-1",
      state: { kind: "submitted", result: null },
    });
    expect(t.authoredOn).toBe("2026-10-01T00:00:00Z");
    expect(t.executionPeriod.start).toBe("2026-10-01T00:00:00Z");
  });

  it("only reports a change when something meaningful differs", () => {
    const a = buildSpecimenTask({ specimen: specimen(), caseEncounterId: "case-1", state: { kind: "submitted", result: null }, now: "1" });
    const b = buildSpecimenTask({ specimen: specimen(), caseEncounterId: "case-1", state: { kind: "submitted", result: null }, now: "2" });
    expect(taskChanged(a, b)).toBe(false);
    const c = buildSpecimenTask({ specimen: specimen(), caseEncounterId: "case-1", state: { kind: "submitted", result: result("Final") }, now: "2" });
    expect(taskChanged(a, c)).toBe(true);
  });

  it("builds a result Observation and detects unchanged results", () => {
    const o = buildResultObservation({ specimen: specimen(), caseEncounterId: "case-1", result: result("Preliminary", "Positive") });
    expect(o).toMatchObject({
      id: "nphl-result-spec-1",
      status: "preliminary",
      valueString: "Positive",
      specimen: { reference: "Specimen/spec-1" },
      encounter: { reference: "Encounter/case-1" },
    });
    expect(resultChanged({ ...o, meta: { versionId: "3" } }, o)).toBe(false);
    expect(resultChanged(o, { ...o, status: "final" })).toBe(true);
    expect(resultChanged(null, o)).toBe(true);
  });
});

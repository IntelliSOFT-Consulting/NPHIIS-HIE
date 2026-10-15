import { beforeAll, describe, expect, it } from "vitest";

process.env.FHIR_BASE_URL = "http://hapi.internal:8080/fhir";
let toSubmittedSpecimen: typeof import("./fhir-specimens").toSubmittedSpecimen;
beforeAll(async () => {
  ({ toSubmittedSpecimen } = await import("./fhir-specimens"));
});

const included = new Map<string, any>([
  [
    "Specimen/s1",
    {
      resourceType: "Specimen",
      id: "s1",
      type: { text: "Blood" },
      collection: { collectedDateTime: "2026-10-14T08:30:00+03:00" },
      extension: [
        {
          url: "http://example.org/fhir/StructureDefinition/specimen-managingLocation",
          valueReference: { display: "KABULA A COMMUNITY HEALTH UNIT" },
        },
      ],
    },
  ],
  [
    "Patient/p1",
    {
      resourceType: "Patient",
      id: "p1",
      name: [{ given: ["Jane"], family: "Doe" }],
      address: [{ city: "Kericho", state: "Kipkelion East" }],
      identifier: [{ system: "http://hie.org/identifiers/EPID", value: "PATIENT-EPID", use: "official" }],
    },
  ],
  [
    "Encounter/e1",
    {
      resourceType: "Encounter",
      id: "e1",
      identifier: [{ system: "http://hie.org/identifiers/EPID", value: "KEN-KER-001" }],
    },
  ],
]);

const baseTask = {
  id: "nphl-s1",
  identifier: [{ system: "http://nphiis.health.go.ke/fhir/identifiers/specimen-id", value: "TUBE-1" }],
  focus: { reference: "Specimen/s1" },
  for: { reference: "Patient/p1" },
  encounter: { reference: "Encounter/e1" },
  authoredOn: "2026-10-14T10:00:00Z",
  input: [
    { type: { text: "specimen-label" }, valueString: "TUBE-1" },
    { type: { text: "specimen-label-source" }, valueString: "identifier" },
  ],
};

describe("toSubmittedSpecimen", () => {
  it("reads the case, specimen and final result", () => {
    const s = toSubmittedSpecimen(
      {
        ...baseTask,
        businessStatus: { coding: [{ code: "final-result" }], text: "Final result received" },
        output: [{ type: { text: "result" }, valueString: "Negative" }],
      },
      included,
      {
        status: "final",
        valueString: "Negative",
        effectiveDateTime: "2026-10-15",
        performer: [{ display: "NPHL Nairobi" }],
        component: [{ code: { text: "RT-PCR — Ebola" }, valueString: "Not detected" }],
      },
    );
    expect(s).toMatchObject({
      specimenId: "s1",
      label: "TUBE-1",
      labelIsFhirId: false,
      epid: "KEN-KER-001",
      patientName: "Jane Doe",
      county: "Kericho",
      facility: "KABULA A COMMUNITY HEALTH UNIT",
      sampleType: "Blood",
      status: "final-result",
      result: "Negative",
      resultType: "Final",
      testingLab: "NPHL Nairobi",
      tests: [{ name: "RT-PCR — Ebola", result: "Not detected" }],
    });
  });

  it("carries the rejection from the Task outputs", () => {
    const s = toSubmittedSpecimen(
      {
        ...baseTask,
        businessStatus: { coding: [{ code: "specimen-rejected" }] },
        statusReason: { text: "Haemolysed" },
        output: [
          { type: { text: "rejection-reason" }, valueString: "Haemolysed" },
          { type: { text: "rejected-by" }, valueString: "KEMRI" },
          { type: { text: "rejected-on" }, valueDateTime: "2026-10-15T09:00:00Z" },
        ],
      },
      included,
    );
    expect(s).toMatchObject({
      status: "specimen-rejected",
      statusReason: "Haemolysed",
      rejectedBy: "KEMRI",
      rejectedOn: "2026-10-15T09:00:00Z",
      result: undefined,
      tests: [],
    });
  });

  it("falls back to the patient's official EPID and flags an unlabelled tube", () => {
    const s = toSubmittedSpecimen(
      {
        ...baseTask,
        identifier: [],
        encounter: { reference: "Encounter/missing" },
        businessStatus: { coding: [{ code: "awaiting-result" }] },
        input: [{ type: { text: "specimen-label-source" }, valueString: "fhir-id" }],
      },
      included,
    );
    expect(s.epid).toBe("PATIENT-EPID");
    expect(s.label).toBe("s1");
    expect(s.labelIsFhirId).toBe(true);
  });
});

import { beforeAll, describe, expect, it } from "vitest";

process.env.FHIR_BASE_URL = "http://hapi.internal:8080/fhir";
let mod: typeof import("./fhir-screenings");
beforeAll(async () => {
  mod = await import("./fhir-screenings");
});

const screeningType = {
  coding: [{ system: "vhf-screened", code: "vhf-screened", display: "VHF Screening" }],
  text: "Screening No.",
};

const qr = {
  id: "q1",
  authored: "2026-10-14T14:50:00+03:00",
  meta: {
    tag: [
      { system: "http://nphiis.health.go.ke/fhir/CodeSystem/record-origin", code: "screened" },
      { system: "http://nphiis.health.go.ke/fhir/CodeSystem/screening-outcome", code: "suspected" },
    ],
  },
  subject: { reference: "Patient/p1" },
  item: [
    {
      linkId: "point-of-entry",
      item: [
        { linkId: "point-of-entry.name", answer: [{ valueString: "Lunga Lunga One Stop Border Post" }] },
        { linkId: "point-of-entry.type", answer: [{ valueString: "border" }] },
      ],
    },
  ],
};
// vhf-case.json groups go first in the response.
qr.item.unshift(
  {
    linkId: "vhf-clinical",
    item: [
      {
        linkId: "vhf-symptoms",
        answer: [
          { valueCoding: { code: "fever", display: "Fever" } },
          { valueCoding: { code: "other", display: "Other (specify)" } },
        ],
      },
      { linkId: "vhf-symptoms-other", answer: [{ valueString: "Cough; Rash (trunk)" }] },
      { linkId: "728034137219", answer: [{ valueDate: "2026-10-12" }] },
      { linkId: "vhf-onset-fever", answer: [{ valueDate: "2026-10-12" }] },
    ],
  } as any,
  {
    linkId: "vhf-travel",
    item: [
      { linkId: "vhf-travelled", answer: [{ valueCoding: { code: "yes", display: "Yes" } }] },
      {
        linkId: "vhf-travel-origin-country",
        answer: [{ valueCoding: { system: "urn:iso:std:iso:3166", code: "TZ", display: "Tanzania" } }],
      },
      { linkId: "vhf-travel-origin-place", answer: [{ valueString: "Tanga" }] },
      { linkId: "vhf-travel-stopovers", answer: [{ valueString: "Uganda, Kampala 2026-10-01–2026-10-05" }] },
      { linkId: "vhf-travel-destination-country", answer: [{ valueCoding: { system: "urn:iso:std:iso:3166", code: "KE", display: "Kenya" } }] },
      { linkId: "vhf-travel-arrival-date", answer: [{ valueDate: "2026-10-13" }] },
    ],
  } as any,
);
qr.item.push({ linkId: "screening-temperature", answer: [{ valueDecimal: 38.4 }] } as any);

describe("toScreening", () => {
  it("reads point of entry, outcome, temperature, symptoms and trips from the vhf-case linkIds", () => {
    expect(mod.toScreening(qr)).toEqual({
      id: "q1",
      screeningType: "entry",
      screenedAt: "2026-10-14T14:50:00+03:00",
      outcome: "suspected",
      pointOfEntry: "Lunga Lunga One Stop Border Post",
      pointOfEntryType: "border",
      temperatureCelsius: 38.4,
      symptoms: [
        { code: "fever", onsetDate: "2026-10-12", note: undefined },
        { code: "other", onsetDate: undefined, note: "Cough; Rash (trunk)" },
      ],
      hasTravelled: true,
      trips: [
        { country: "Tanzania", city: "Tanga", departureDate: undefined, arrivalDate: "2026-10-13", purpose: undefined },
        { country: "Uganda, Kampala 2026-10-01–2026-10-05" },
      ],
    });
  });

  it("reads vhf-travelled no as not travelled", () => {
    const s = mod.toScreening({
      id: "q2",
      item: [{ linkId: "vhf-travel", item: [{ linkId: "vhf-travelled", answer: [{ valueCoding: { code: "no" } }] }] }],
    });
    expect(s).toMatchObject({ hasTravelled: false, trips: [], symptoms: [] });
  });
});

describe("toScreenedPerson", () => {
  const screened = {
    resourceType: "Patient",
    id: "p1",
    name: [{ given: ["Sarah"], family: "Thompson" }],
    address: [{ state: "MOMBASA", district: "MVITA" }],
    identifier: [
      { type: screeningType, system: "vhf-screening-number", value: "SCR-1" },
      { type: screeningType, system: "vhf-screened", value: "SCR-1" },
      {
        type: { coding: [{ code: "Passport", display: "Passport" }] },
        system: "http://nphiis.health.go.ke/fhir/identifier/screening-patient",
        value: "P123",
      },
    ],
  };

  it("lists a Screening No. once and shows documents, not bookkeeping IDs", () => {
    const p = mod.toScreenedPerson(screened, [qr], []);
    expect(p.screeningNumbers).toEqual(["SCR-1"]);
    expect(p.identifiers).toEqual(["Passport P123"]);
    expect(p).toMatchObject({ name: "Sarah Thompson", county: "MOMBASA", subCounty: "MVITA", stage: "screened" });
  });

  it("follows a mobile case through to its NPHL result", () => {
    const mobileCase = {
      resourceType: "Patient",
      id: "p2",
      address: [{ city: "LAIKIPIA", state: "LAIKIPIA WEST" }],
      identifier: [
        { type: screeningType, system: "vhf-screening-number", value: "SCR-2" },
        { system: "vhf-case-information", value: "e1" },
        { system: "passport", value: "40350008" },
        { system: "national-id", value: "35104278" },
        {
          use: "official",
          type: { coding: [{ system: "http://hie.org/identifiers/EPID", code: "EPID" }] },
          value: "KEN-LAI-LAW-2026-VHF-001",
        },
      ],
    };
    const isCase = mod.toScreenedPerson(mobileCase, [], []);
    expect(isCase).toMatchObject({ stage: "case", epid: "KEN-LAI-LAW-2026-VHF-001", county: "LAIKIPIA" });
    expect(isCase.identifiers).toEqual(["Passport 40350008", "National ID 35104278"]);

    const task = {
      focus: { reference: "Specimen/s1" },
      for: { reference: "Patient/p2" },
      businessStatus: { coding: [{ code: "awaiting-result" }] },
      authoredOn: "2026-10-14T19:00:00Z",
    };
    expect(mod.toScreenedPerson(mobileCase, [], [task]).stage).toBe("specimen");
    const resulted = mod.toScreenedPerson(mobileCase, [], [
      { ...task, businessStatus: { coding: [{ code: "final-result" }] }, output: [{ type: { text: "result" }, valueString: "Negative" }] },
    ]);
    expect(resulted.stage).toBe("result");
    expect(resulted.specimens[0]).toMatchObject({ label: "s1", status: "final-result", result: "Negative" });
  });
});

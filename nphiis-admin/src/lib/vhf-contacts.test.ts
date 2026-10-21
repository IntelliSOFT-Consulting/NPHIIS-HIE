import { describe, expect, it } from "vitest";
import {
  buildContactBundle,
  buildContactUpdateBundle,
  buildConversionBundle,
  buildExtraExposureBundle,
  buildFollowUpBundle,
  contactIds,
  contactUpdate,
  creationStamp,
  reportingSiteBackfill,
  responseItems,
  CASE_FORM,
  uuidv5,
  type ContactInput,
  type ContactOnRecord,
  type IndexCase,
  type ReportingSite,
} from "./vhf-contacts";

const index: IndexCase = { encounterId: "e0", patientId: "p0", epid: "KEN-NAI-KIB-2026-VHF-001", disease: "ebola" };
const jane: ContactInput = {
  rowNumber: 3,
  givenNames: "Jane Akinyi",
  familyName: "Otieno",
  sex: "female",
  ageYears: 34,
  phone: "0712345678",
  contactDate: "2026-10-03",
  relationship: "family",
  county: { id: "47", name: "NAIROBI" },
  subCounty: { id: "4710", name: "KIBRA" },
  notes: "Quarantine Facility: KNH",
  followUps: [{ day: 1, symptomatic: false }, { day: 2, symptomatic: true }],
};
const NOW = new Date("2026-10-17T07:00:00Z");
const facility = { id: "f1", name: "Kibra Health Centre" };

type Entry = { resource: any; request: { method: string; url: string } };
const of = (entries: Entry[], type: string) => entries.filter((e) => e.resource.resourceType === type).map((e) => e.resource);
const obsValue = (entries: Entry[], code: string, encounterId?: string) =>
  of(entries, "Observation").find(
    (o) => o.code.coding[0].code === code && (!encounterId || o.encounter.reference === `Encounter/${encounterId}`),
  );

function findItem(items: any[], linkId: string, path: string[] = []): string[] | null {
  for (const i of items ?? []) {
    const here = [...path, i.linkId];
    if (i.linkId === linkId) return here;
    const found = findItem([...(i.item ?? []), ...(i.answer ?? []).flatMap((a: any) => a.item ?? [])], linkId, here);
    if (found) return found;
  }
  return null;
}

describe("buildContactBundle", () => {
  const bundle = buildContactBundle(index, jane, { practitionerId: "pr1", facility, now: NOW });
  const entries = bundle.entry as Entry[];
  const ids = contactIds(index, jane);

  it("derives the same ids for the same person and case", () => {
    expect(contactIds(index, { ...jane, phone: "+254712345678", rowNumber: 9 })).toEqual(ids);
    expect(contactIds({ encounterId: "other" }, jane).patientId).not.toBe(ids.patientId);
    expect(uuidv5("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(entries.every((e) => e.request.method === "PUT" && e.request.url === `${e.resource.resourceType}/${e.resource.id}`)).toBe(true);
  });

  it("writes the Patient as mobile does, with no Patient.link", () => {
    const [patient] = of(entries, "Patient");
    expect(patient.id).toBe(ids.patientId);
    expect(patient.name).toEqual([{ family: "Otieno", given: ["Jane Akinyi"] }]);
    expect(patient.gender).toBe("female");
    expect(patient.telecom).toEqual([{ system: "phone", use: "mobile", value: "0712345678" }]);
    expect(patient.address).toEqual([{ state: "KIBRA", city: "NAIROBI", line: ["KIBRA", "NAIROBI"] }]);
    expect(patient.link).toBeUndefined();
    expect(patient.identifier.map((i: any) => [i.system, i.value])).toEqual([
      ["system-creation", creationStamp(NOW)],
      ["vhf-case-information", ids.encounterId],
    ]);
    expect(patient.meta.tag[0]).toEqual({
      system: "http://example.org/fhir/StructureDefinition/patient-managingLocation",
      code: "Location/f1",
      display: "Kibra Health Centre",
    });
  });

  it("writes the VHF case Encounter, response and answers of a contact", () => {
    const encounters = of(entries, "Encounter");
    const caseEnc = encounters.find((e) => e.id === ids.encounterId);
    expect(caseEnc.reasonCode[0].coding[0].code).toBe("VHF Case Information");
    expect(caseEnc.partOf).toBeUndefined();

    expect(obsValue(entries, "vhf-case-type").valueString).toBe("Contact");
    const source = obsValue(entries, "vhf-source-case-epid");
    expect(source.valueString).toBe("KEN-NAI-KIB-2026-VHF-001");
    expect(source.focus).toEqual([{ reference: "Encounter/e0" }]);
    expect(obsValue(entries, "vhf-contact-date").valueString).toBe("2026-10-03");
    expect(obsValue(entries, "929966324957").valueString).toBe("Female");
    expect(obsValue(entries, "a3-sub-county").valueString).toBe("KIBRA");
    expect(obsValue(entries, "vhf-relationship").valueString).toBe("Family");
    expect(obsValue(entries, "442636360588").valueString).toBe("Unknown");
    expect(obsValue(entries, "492731638700").valueString).toBe("34");
    expect(obsValue(entries, "contact_import_notes").valueString).toBe("Quarantine Facility: KNH");
    expect(obsValue(entries, "vhf-case-type").code.coding[0]).toMatchObject({ system: "http://snomed.info/sct" });

    const [qr] = of(entries, "QuestionnaireResponse");
    expect(qr.status).toBe("in-progress");
    expect(qr.encounter).toEqual({ reference: `Encounter/${ids.encounterId}` });
    // Nested as in the mobile form.
    expect(findItem(qr.item, "vhf-case-type")).toEqual(["151479012557", "vhf-case-type"]);
    expect(findItem(qr.item, "vhf-phone")).toEqual(["vhf-demographics", "vhf-phone"]);
    expect(findItem(qr.item, "vhf-contact-date")?.[0]).toBe("vhf-exposure");
    expect(findItem(qr.item, "contact_import_notes")).toBeNull();
  });

  it("adds a follow-up record per filled day column, dated from the date of contact", () => {
    const followUps = of(entries, "Encounter").filter((e) => e.partOf);
    expect(followUps).toHaveLength(2);
    expect(followUps.every((e) => e.partOf.reference === `Encounter/${ids.encounterId}`)).toBe(true);
    expect(followUps.every((e) => e.reasonCode[0].coding[0].code === "VHF Contact Follow Up")).toBe(true);
    const day2 = followUps[1].id;
    expect(obsValue(entries, "vhf-follow-up-day", day2).valueString).toBe("2");
    expect(obsValue(entries, "vhf-follow-up-date", day2).valueString).toBe("2026-10-05");
    expect(obsValue(entries, "vhf-follow-up-symptomatic", day2).valueString).toBe("Yes");
  });
});

describe("other bundles", () => {
  const contact = { patientId: "p1", contactEncounterId: "e1" };

  it("records a day's follow up as a child of the contact's case record", () => {
    const entries = buildFollowUpBundle(contact, { day: 4, date: "2026-10-07", symptomatic: false, approach: "phone-call" }, { now: NOW }).entry as Entry[];
    const [enc] = of(entries, "Encounter");
    expect(enc.partOf).toEqual({ reference: "Encounter/e1" });
    expect(obsValue(entries, "vhf-follow-up-symptomatic").valueString).toBe("No");
    expect(obsValue(entries, "vhf-follow-up-approach").valueString).toBe("Phone call");
  });

  it("converts by adding a new type of case answer", () => {
    const entries = buildConversionBundle(contact, "suspected", { now: NOW }).entry as Entry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].resource).toMatchObject({ encounter: { reference: "Encounter/e1" }, valueString: "Suspected" });
  });

  it("links an existing contact to a second case", () => {
    const entries = buildExtraExposureBundle(index, { patientId: "p1", encounterId: "e1" }, "2026-10-10", { now: NOW }).entry as Entry[];
    expect(entries.map((e) => [e.resource.code.coding[0].code, e.resource.valueString])).toEqual([
      ["vhf-source-case-epid", "KEN-NAI-KIB-2026-VHF-001"],
      ["vhf-contact-date", "2026-10-10"],
    ]);
  });

  it("nests only answered questions", () => {
    expect(responseItems(CASE_FORM, {})).toEqual([]);
  });
});

describe("reporting site of an uploaded contact", () => {
  const site: ReportingSite = {
    role: "ADMINISTRATOR",
    county: { id: "47", name: "NAIROBI" },
    subCounty: { id: "DAGORETTI-NORTH", name: "DAGORETTI NORTH" },
    ward: { id: "GATINA", name: "GATINA" },
    facility: { id: "30016", name: "ENEA HEALTHCARE" },
    facilityType: "Public",
  };
  const qrOf = (s?: ReportingSite) => of(buildContactBundle(index, jane, { site: s, now: NOW }).entry as Entry[], "QuestionnaireResponse")[0];
  const group = (qr: any) => qr.item.find((i: any) => i.linkId === "151479012557").item;

  it("fills the user and the level group of the uploader's role, as mobile does", () => {
    const items = group(qrOf(site));
    const byId = (id: string) => items.find((i: any) => i.linkId === id);
    expect(byId("user_role").answer).toEqual([{ valueString: "ADMINISTRATOR" }]);
    expect(byId("user_facility").answer).toEqual([{ valueString: "30016" }]);
    expect(byId("facility_level")).toBeUndefined();
    const national = byId("national_level").item;
    expect(national.map((i: any) => i.linkId)).toEqual([
      "294367770999_national",
      "819946803642_national",
      "819943434_national",
      "819946803677_national",
      "438862163919_national",
    ]);
    expect(national[3].answer).toEqual([{ valueReference: { reference: "Location/30016", display: "ENEA HEALTHCARE" } }]);
    expect(national[4].answer[0].valueCoding).toMatchObject({ code: "Public" });
    expect(byId("vhf-investigation-date").answer).toEqual([{ valueDate: "2026-10-17" }]);
    expect(byId("vhf-investigation-location").answer[0].valueCoding).toMatchObject({ code: "community" });
    expect(byId("vhf-case-type").answer[0].valueCoding).toMatchObject({ code: "contact" });
  });

  it("uses the facility group for a vaccinator", () => {
    const items = group(qrOf({ ...site, role: "VACCINATOR" }));
    expect(items.find((i: any) => i.linkId === "facility_level").item.map((i: any) => i.linkId)).toContain("819946803677");
    expect(items.find((i: any) => i.linkId === "national_level")).toBeUndefined();
  });

  it("writes no user or level answers without a site", () => {
    const ids = group(qrOf(undefined)).map((i: any) => i.linkId);
    expect(ids.some((id: string) => id.startsWith("user_") || id.endsWith("_level"))).toBe(false);
    expect(ids).toContain("vhf-investigation-date");
  });
});

describe("reporting site backfill", () => {
  // A contact as the portal saved it before it filled the site: no reporting answers.
  const saved = () => {
    const qr = of(buildContactBundle(index, jane, { practitionerId: "u1", facility, now: NOW }).entry as Entry[], "QuestionnaireResponse")[0];
    const group = qr.item.find((i: any) => i.linkId === "151479012557");
    group.item = group.item.filter((i: any) => !["vhf-investigation-date", "vhf-investigation-location"].includes(i.linkId));
    return qr;
  };
  const site: ReportingSite = { role: "COUNTY_DISEASE_SURVEILLANCE_OFFICER", county: { id: "47", name: "NAIROBI" } };

  it("adds the site in form order and keeps the answers already there", () => {
    const bundle = reportingSiteBackfill(saved(), site)!;
    const qr = of(bundle.entry as Entry[], "QuestionnaireResponse")[0];
    const ids = qr.item[0].item.map((i: any) => i.linkId);
    expect(ids).toEqual(["user_role", "user_county", "county_level", "vhf-disease", "vhf-investigation-date", "vhf-investigation-location", "vhf-case-type", "vhf-source-case-epid"]);
    expect(qr.item[0].item[2].item).toEqual([{ linkId: "294367770999_county", text: "County", answer: [{ valueReference: { reference: "Location/47", display: "NAIROBI" } }] }]);
    expect(qr.item.map((i: any) => i.linkId)).toEqual(saved().item.map((i: any) => i.linkId));
    expect(qr.item[0].item[4].answer).toEqual([{ valueDate: "2026-10-17" }]);
  });

  it("writes one Observation per added answer, on the contact's encounter", () => {
    const entries = reportingSiteBackfill(saved(), site)!.entry as Entry[];
    const codes = of(entries, "Observation").map((o) => o.code.coding[0].code).sort();
    expect(codes).toEqual(["294367770999_county", "user_county", "user_role", "vhf-investigation-date", "vhf-investigation-location"].sort());
    const ids = contactIds(index, jane);
    expect(obsValue(entries, "user_role").encounter.reference).toBe(`Encounter/${ids.encounterId}`);
    expect(obsValue(entries, "user_role").performer).toEqual([{ reference: "Practitioner/u1" }]);
  });

  it("is a no-op once the site is there", () => {
    const qr = of(reportingSiteBackfill(saved(), site)!.entry as Entry[], "QuestionnaireResponse")[0];
    expect(reportingSiteBackfill(qr, site)).toBeNull();
  });
});

describe("re-upload (upsert)", () => {
  /** Jane as saved by her first upload: the answers and follow-up days on record. */
  const saved = buildContactBundle(index, jane, { now: NOW }).entry as Entry[];
  const ids = contactIds(index, jane);
  const record = (over: Partial<ContactOnRecord> = {}): ContactOnRecord => ({
    patientId: ids.patientId,
    encounterId: ids.encounterId,
    answers: new Map(
      of(saved, "Observation")
        .filter((o) => o.encounter.reference === `Encounter/${ids.encounterId}`)
        .map((o) => [o.code.coding[0].code, o.valueString]),
    ),
    followUps: new Map([[1, false], [2, true]]),
    dayZero: "2026-10-03",
    ...over,
  });
  const patient = of(saved, "Patient")[0];

  it("finds nothing new in the same row", () => {
    const u = contactUpdate(index, jane, record());
    expect(u.changes).toEqual([]);
    expect(buildContactUpdateBundle(record(), patient, jane, u, { now: NOW })).toBeNull();
  });

  it("does not clear what a blank cell leaves out", () => {
    const { phone: _p, village: _v, followUps: _f, ...fewer } = jane;
    expect(contactUpdate(index, fewer, record()).changes).toEqual([]);
  });

  it("adds new follow-up days and changed details", () => {
    const row: ContactInput = {
      ...jane,
      phone: "0722000111",
      followUps: [...jane.followUps!, { day: 3, symptomatic: false }, { day: 4, symptomatic: true }],
    };
    const u = contactUpdate(index, row, record());
    expect(u.changes).toEqual(["Phone", "Days 3, 4"]);
    expect(u.followUps).toEqual([{ day: 3, symptomatic: false }, { day: 4, symptomatic: true }]);

    const later = new Date("2026-10-20T07:00:00Z");
    const entries = buildContactUpdateBundle(record(), patient, row, u, { now: later })!.entry as Entry[];
    // The Patient's phone changes; the answer is appended as a new Observation.
    expect(of(entries, "Patient")[0].telecom[0].value).toBe("0722000111");
    expect(obsValue(entries, "vhf-phone", ids.encounterId).valueString).toBe("0722000111");
    expect(of(entries, "Observation").find((o) => o.code.coding[0].code === "vhf-phone").id).not.toBe(
      of(saved, "Observation").find((o) => o.code.coding[0].code === "vhf-phone").id,
    );
    // Day 3 and 4 follow ups, dated from the contact date.
    const visits = of(entries, "Encounter");
    expect(visits).toHaveLength(2);
    expect(visits.every((e) => e.partOf.reference === `Encounter/${ids.encounterId}`)).toBe(true);
    expect(of(entries, "Observation").filter((o) => o.code.coding[0].code === "vhf-follow-up-date").map((o) => o.valueString).sort()).toEqual([
      "2026-10-06",
      "2026-10-07",
    ]);
  });

  it("records a corrected day result", () => {
    const row: ContactInput = { ...jane, followUps: [{ day: 1, symptomatic: true }, { day: 2, symptomatic: true }] };
    expect(contactUpdate(index, row, record()).followUps).toEqual([{ day: 1, symptomatic: true }]);
  });

  it("dates day columns from the record when the row has no contact date", () => {
    const { contactDate: _d, ...row } = { ...jane, followUps: [{ day: 5, symptomatic: false }] };
    const u = contactUpdate(index, row, record());
    expect(u.changes).toEqual(["Day 5"]);
    const entries = buildContactUpdateBundle(record(), null, row, u, { now: NOW })!.entry as Entry[];
    expect(obsValue(entries, "vhf-follow-up-date").valueString).toBe("2026-10-08");
  });

  it("moves the residence on the Patient", () => {
    const row: ContactInput = { ...jane, subCounty: { id: "4711", name: "LANGATA" } };
    const u = contactUpdate(index, row, record());
    expect(u.changes).toEqual(["Residence"]);
    const entries = buildContactUpdateBundle(record(), patient, row, u, { now: NOW })!.entry as Entry[];
    expect(of(entries, "Patient")[0].address[0]).toMatchObject({ state: "LANGATA", city: "NAIROBI" });
  });
});

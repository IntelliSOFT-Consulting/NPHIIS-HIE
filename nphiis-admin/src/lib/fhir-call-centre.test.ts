import { beforeAll, describe, expect, it } from "vitest";
import type { CallLogPayload } from "./call-centre";

process.env.FHIR_BASE_URL = "http://hapi.internal:8080/fhir";
let mod: typeof import("./fhir-call-centre");
beforeAll(async () => {
  mod = await import("./fhir-call-centre");
});

const NOW = new Date("2026-10-21T07:30:00Z"); // 10:30 in Nairobi
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const locations = {
  "a4-county": { id: "c1", name: "Nairobi" },
  "a3-sub-county": { id: "s1", name: "Embakasi East" },
};

const answered = {
  "alert-date": "2026-10-21",
  "alert-source-type": "hotline",
  "alert-reporter-name": "Peter Reporter",
  "alert-reporter-mobile": "0712345678",
  "486402457213": "Otieno",
  "873240407472": "Mary",
  "929966324957": "female",
  "alert-age-unit": "years",
  "492731638700": "34",
  "alert-home-country": "KE",
  "alert-mobile": "0798765432",
  "alert-vital-status": "alive",
  "alert-fever": "yes",
  "alert-vomiting": "yes",
  "alert-travelled": "no",
  "alert-sample-collected": "yes",
  "alert-meets-case-definition": "yes",
  "alert-specimen-type": "oral-swab",
};

const assessment: CallLogPayload = {
  answers: answered,
  locations: { ...locations, "a2-ward": { id: "w1", name: "Utawala" } },
};

/** An alert with no patient name, to see the placeholder. */
const advice: CallLogPayload = {
  answers: {
    "alert-date": "2026-10-21",
    "alert-source-type": "hotline",
    "alert-reporter-name": "Peter Reporter",
    "alert-reporter-mobile": "0712345678",
    // Only asked when a sample was collected: must not be saved.
    "alert-meets-case-definition": "yes",
  },
  locations,
};

const CASE = { patientId: "case-9", epid: "KEN-NAI-EME-2026-VHF-001", name: "Mary Otieno" };

const byType = (bundle: { entry: Array<{ resource?: any }> }, type: string) =>
  bundle.entry.map((e) => e.resource).filter((r) => r?.resourceType === type);
const obsFor = (bundle: { entry: Array<{ resource?: any }> }, code: string) =>
  byType(bundle, "Observation").find((o) => o.code.coding[0].code === code);

describe("buildCreateBundle", () => {
  it("saves a call log in the mobile app's shape", () => {
    const bundle = mod.buildCreateBundle(assessment, { practitionerId: "pr-1", now: NOW, newId: ids() });
    expect(bundle.type).toBe("transaction");
    expect(bundle.entry.every((e) => e.request.method === "PUT")).toBe(true);

    const [patient] = byType(bundle, "Patient");
    const [encounter] = byType(bundle, "Encounter");
    const [response] = byType(bundle, "QuestionnaireResponse");
    expect(patient.identifier).toContainEqual(
      expect.objectContaining({ system: "alert-rumor-log", value: encounter.id }),
    );
    expect(patient.identifier[0]).toMatchObject({ system: "system-creation", value: "2026-10-21 10:30:00" });
    expect(patient.name).toEqual([{ family: "Otieno", given: ["Mary"] }]);
    expect(patient.gender).toBe("female");
    expect(patient.telecom).toEqual([{ system: "phone", value: "0798765432", use: "mobile" }]);
    expect(obsFor(bundle, "486402457213").valueString).toBe("Otieno");
    expect(patient.address).toEqual([
      { state: "Embakasi East", city: "Nairobi", line: ["Embakasi East", "Nairobi"] },
    ]);

    expect(encounter.reasonCode[0].coding[0].code).toBe("Alert Rumor Log");
    expect(encounter.subject.reference).toBe(`Patient/${patient.id}`);
    expect(encounter.status).toBe("finished");

    expect(response.encounter.reference).toBe(`Encounter/${encounter.id}`);
    expect(response.author.reference).toBe("Practitioner/pr-1");
  });

  it("writes one Observation per answer, with the answer text", () => {
    const bundle = mod.buildCreateBundle(assessment, { now: NOW, newId: ids() });
    expect(obsFor(bundle, "a3-sub-county").valueString).toBe("Embakasi East");
    expect(obsFor(bundle, "alert-fever").valueString).toBe("Yes");
    expect(obsFor(bundle, "alert-source-type").valueString).toBe("Hotline");
    expect(obsFor(bundle, "alert-date").valueString).toBe("2026-10-21");
    // Call logs get no EPID, provisional or otherwise.
    expect(obsFor(bundle, "EPID")).toBeUndefined();
    expect(obsFor(bundle, "linked-case-epid")).toBeUndefined();
    expect(JSON.stringify(bundle)).not.toContain("hie.org/identifiers/EPID");
  });

  it("keeps choices as coded answers and locations as references in the response", () => {
    const bundle = mod.buildCreateBundle(assessment, { now: NOW, newId: ids() });
    const [response] = byType(bundle, "QuestionnaireResponse");
    const clinical = response.item.find((i: any) => i.linkId === "alert-clinical");
    const fever = clinical.item.find((i: any) => i.linkId === "alert-fever");
    expect(fever.answer.map((a: any) => a.valueCoding.code)).toEqual(["yes"]);
    const patientGroup = response.item.find((i: any) => i.linkId === "alert-patient");
    const county = patientGroup.item.find((i: any) => i.linkId === "a4-county");
    expect(county.answer[0].valueReference).toEqual({ reference: "Location/c1", display: "Nairobi" });
  });

  it("drops answers to questions the form does not ask for these answers", () => {
    const bundle = mod.buildCreateBundle(advice, { now: NOW, newId: ids() });
    // The assessment section is only asked when a sample was collected.
    expect(obsFor(bundle, "alert-meets-case-definition")).toBeUndefined();
    expect(obsFor(bundle, "alert-reporter-name").valueString).toBe("Peter Reporter");
  });

  it("names the Patient 'Alert' when nobody is named, and never uses the reporter's name or phone", () => {
    const bundle = mod.buildCreateBundle(advice, { now: NOW, newId: ids() });
    const [patient] = byType(bundle, "Patient");
    expect(patient.name).toEqual([{ family: "Alert" }]);
    expect(patient.telecom).toBeUndefined();
  });
});

describe("reading a saved log back", () => {
  it("restores the form's answers from the response", () => {
    const bundle = mod.buildCreateBundle(assessment, { now: NOW, newId: ids() });
    const [response] = byType(bundle, "QuestionnaireResponse");
    const back = mod.payloadFromResponse(response);
    expect(back.answers["alert-fever"]).toBe("yes");
    expect(back.answers["alert-date"]).toBe("2026-10-21");
    expect(back.locations["a2-ward"]).toEqual({ id: "w1", name: "Utawala" });
    expect(back.answers["873240407472"]).toBe("Mary");
  });

  it("falls back to the Observations, matching option labels that contain commas", () => {
    const observations = [
      { code: { coding: [{ code: "alert-travel-mode" }] }, valueString: "Road, public transport" },
      { code: { coding: [{ code: "alert-fever" }] }, valueString: "Yes" },
      { code: { coding: [{ code: "a4-county" }] }, valueString: "Nairobi" },
    ];
    const back = mod.payloadFromObservations(observations);
    expect(back.answers["alert-travel-mode"]).toBe("road-public");
    expect(back.answers["alert-fever"]).toBe("yes");
    expect(back.locations["a4-county"]).toEqual({ id: "", name: "Nairobi" });
  });

  it("summarises a log for the list, showing the linked case's EPID", () => {
    const bundle = mod.buildCreateBundle({ ...assessment, linkedCase: CASE }, { now: NOW, newId: ids() });
    const [patient] = byType(bundle, "Patient");
    const summary = mod.toSummary(patient, byType(bundle, "Observation"));
    expect(summary).toMatchObject({
      epid: "KEN-NAI-EME-2026-VHF-001",
      callerName: "Peter Reporter",
      patientName: "Mary Otieno",
      county: "Nairobi",
      source: "Hotline",
      vitalStatus: "Alive",
      meetsDefinition: "Yes",
    });
  });
});

describe("buildUpdateBundle", () => {
  it("updates changed answers, adds new ones and deletes cleared ones", () => {
    const created = mod.buildCreateBundle(assessment, { now: NOW, newId: ids() });
    const [patient] = byType(created, "Patient");
    const [encounter] = byType(created, "Encounter");
    const [response] = byType(created, "QuestionnaireResponse");
    const log = {
      patient,
      encounter,
      encounterId: encounter.id,
      response,
      observations: byType(created, "Observation"),
    };
    const edited: CallLogPayload = {
      answers: { ...assessment.answers, "alert-vital-status": "deceased", "alert-description": "Sent RRT" },
      locations,
    };
    delete edited.answers["alert-fever"];

    const bundle = mod.buildUpdateBundle(log, edited, { now: NOW, newId: () => "new-obs" });
    const puts = bundle.entry.filter((e) => e.request.method === "PUT").map((e) => e.resource!);
    const deletes = bundle.entry.filter((e) => e.request.method === "DELETE").map((e) => e.request.url);

    const status = puts.find((r) => r.resourceType === "Observation" && r.code.coding[0].code === "alert-vital-status");
    expect(status?.id).toBe(obsFor(created, "alert-vital-status").id);
    expect(status?.valueString).toBe("Deceased");
    expect(puts.find((r) => r.id === "new-obs")?.valueString).toBe("Sent RRT");
    // Unchanged answers are left alone; the EPID is never touched.
    expect(puts.some((r) => r.resourceType === "Observation" && r.code.coding[0].code === "alert-source-type")).toBe(false);
    expect(deletes).toEqual(
      expect.arrayContaining([
        `Observation/${obsFor(created, "alert-fever").id}`,
        `Observation/${obsFor(created, "a2-ward").id}`,
      ]),
    );
    expect(puts.find((r) => r.resourceType === "QuestionnaireResponse")?.id).toBe(response.id);
  });
});

describe("linking a case", () => {
  const logFrom = (payload: CallLogPayload) => {
    const created = mod.buildCreateBundle(payload, { now: NOW, newId: ids() });
    const [patient] = byType(created, "Patient");
    const [encounter] = byType(created, "Encounter");
    const [response] = byType(created, "QuestionnaireResponse");
    const observations = byType(created, "Observation");
    return { created, log: { patient, encounter, encounterId: encounter.id, response, observations } };
  };

  it("keeps the case's EPID on an Observation that points at the case", () => {
    const { created, log } = logFrom({ ...advice, linkedCase: CASE });
    const link = obsFor(created, "linked-case-epid");
    expect(link.valueString).toBe(CASE.epid);
    expect(link.focus).toEqual([{ reference: "Patient/case-9", display: "Mary Otieno" }]);
    expect(mod.linkedCaseOf(log.observations)).toEqual(CASE);
  });

  it("can be added to a log later", () => {
    const { log } = logFrom(advice);
    const bundle = mod.buildUpdateBundle(log, { ...advice, linkedCase: CASE }, { now: NOW, newId: () => "link-1" });
    const link = bundle.entry.find((e) => e.resource?.id === "link-1")?.resource;
    expect(link?.valueString).toBe(CASE.epid);
  });

  it("is rewritten when changed and deleted when removed", () => {
    const { created, log } = logFrom({ ...advice, linkedCase: CASE });
    const linkId = obsFor(created, "linked-case-epid").id;

    const other = { patientId: "case-2", epid: "KEN-KIS-KIS-2026-MEA-004" };
    const changed = mod.buildUpdateBundle(log, { ...advice, linkedCase: other }, { now: NOW });
    const put = changed.entry.find((e) => e.request.url === `Observation/${linkId}`);
    expect(put?.request.method).toBe("PUT");
    expect(put?.resource?.valueString).toBe(other.epid);

    const removed = mod.buildUpdateBundle(log, { ...advice, linkedCase: null }, { now: NOW });
    expect(removed.entry.find((e) => e.request.url === `Observation/${linkId}`)?.request.method).toBe("DELETE");

    const unchanged = mod.buildUpdateBundle(log, { ...advice, linkedCase: CASE }, { now: NOW });
    expect(unchanged.entry.some((e) => e.request.url === `Observation/${linkId}`)).toBe(false);
  });

  it("only offers Patients with an official EPID, never call logs", () => {
    const epid = { use: "official", system: "http://hie.org/identifiers/EPID", value: "KEN-X-1" };
    expect(mod.toCaseCandidate({ id: "p1", identifier: [epid], name: [{ given: ["Ann"], family: "Wanjiru" }] })).toMatchObject({
      patientId: "p1",
      epid: "KEN-X-1",
      name: "Ann Wanjiru",
    });
    expect(mod.toCaseCandidate({ id: "p2", identifier: [] })).toBeNull();
    expect(mod.toCaseCandidate({ id: "p3", identifier: [epid, { system: "alert-rumor-log", value: "e" }] })).toBeNull();
  });
});

describe("Alert Log ID", () => {
  it("is shown on the list once the server has given one", () => {
    const bundle = mod.buildCreateBundle(advice, { now: NOW, newId: ids() });
    const [patient] = byType(bundle, "Patient");
    expect(mod.toSummary(patient, []).logId).toBeUndefined();
    patient.identifier.push({ system: mod.ALERT_LOG_ID_SYSTEM, value: "KEN-NAI-EME-2026-ALR-001" });
    expect(mod.toSummary(patient, []).logId).toBe("KEN-NAI-EME-2026-ALR-001");
  });
});

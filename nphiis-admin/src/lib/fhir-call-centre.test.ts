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

const advice: CallLogPayload = {
  answers: {
    "alert-date": "2026-10-21T10:15",
    "alert-agent-id": "Jane Agent",
    "alert-reporter-name": "Peter Caller",
    "alert-reporter-mobile": "0712345678",
    "alert-calling-about": "self",
    "alert-source-type": "hotline",
    "alert-call-pathway": "general-advice",
    // Only asked on the assessment pathway: must not be saved.
    "873240407472": "Someone Else",
    "alert-call-end": "10:20",
  },
  locations,
};

const assessment: CallLogPayload = {
  answers: {
    "alert-date": "2026-10-21T10:15",
    "alert-agent-id": "Jane Agent",
    "alert-reporter-name": "Peter Caller",
    "alert-reporter-mobile": "0712345678",
    "alert-calling-about": "family",
    "alert-source-type": "community",
    "alert-call-pathway": "assessment",
    "873240407472": "Mary",
    "486402457213": "Otieno",
    "929966324957": "female",
    "alert-mobile": "0798765432",
    "alert-symptoms": "fever;vomiting",
    "alert-exposures": "funeral-or-body",
    "alert-classification": "possible",
    "alert-routed-action": "pheoc-rrt",
    "alert-action-status": "pending",
    "alert-call-end": "10:25",
  },
  locations: { ...locations, "a2-ward": { id: "w1", name: "Utawala" } },
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
    // Surname and the person's mobile are hidden questions on this form, as on mobile.
    expect(patient.name).toEqual([{ given: ["Mary"] }]);
    expect(patient.gender).toBe("female");
    expect(patient.telecom).toBeUndefined();
    expect(obsFor(bundle, "486402457213")).toBeUndefined();
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
    expect(obsFor(bundle, "alert-symptoms").valueString).toBe("Fever, Vomiting");
    expect(obsFor(bundle, "alert-date").valueString).toBe("2026-10-21T10:15:00+03:00");
    expect(obsFor(bundle, "alert-call-end").valueString).toBe("10:25:00");
    expect(obsFor(bundle, "alert-symptoms").code.coding[0].system).toBe("http://snomed.info/sct");
    // Call logs get no EPID, provisional or otherwise.
    expect(obsFor(bundle, "EPID")).toBeUndefined();
    expect(obsFor(bundle, "linked-case-epid")).toBeUndefined();
    expect(JSON.stringify(bundle)).not.toContain("hie.org/identifiers/EPID");
  });

  it("keeps repeated choices as separate response answers", () => {
    const bundle = mod.buildCreateBundle(assessment, { now: NOW, newId: ids() });
    const [response] = byType(bundle, "QuestionnaireResponse");
    const event = response.item.find((i: any) => i.linkId === "alert-event");
    const symptoms = event.item.find((i: any) => i.linkId === "alert-symptoms");
    expect(symptoms.answer.map((a: any) => a.valueCoding.code)).toEqual(["fever", "vomiting"]);
    const source = response.item.find((i: any) => i.linkId === "alert-source");
    expect(source.item[0].answer[0].valueReference).toEqual({ reference: "Location/c1", display: "Nairobi" });
  });

  it("drops answers to questions the pathway does not ask, and names a caller calling about themselves", () => {
    const bundle = mod.buildCreateBundle(advice, { now: NOW, newId: ids() });
    expect(obsFor(bundle, "873240407472")).toBeUndefined();
    const [patient] = byType(bundle, "Patient");
    expect(patient.name).toEqual([{ given: ["Peter Caller"] }]);
    expect(patient.telecom[0].value).toBe("0712345678");
  });

  it("names the Patient 'Alert' when nobody is named", () => {
    const bundle = mod.buildCreateBundle(
      { ...advice, answers: { ...advice.answers, "alert-calling-about": "chp" } },
      { now: NOW, newId: ids() },
    );
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
    expect(back.answers["alert-symptoms"]).toBe("fever;vomiting");
    expect(back.answers["alert-date"]).toBe("2026-10-21T10:15");
    expect(back.answers["alert-call-end"]).toBe("10:25");
    expect(back.locations["a2-ward"]).toEqual({ id: "w1", name: "Utawala" });
    expect(back.answers["873240407472"]).toBe("Mary");
  });

  it("falls back to the Observations, matching option labels that contain commas", () => {
    const observations = [
      { code: { coding: [{ code: "alert-calling-about" }] }, valueString: "Chief, village elder, or local administrator" },
      { code: { coding: [{ code: "alert-symptoms" }] }, valueString: "Fever, Severe headache" },
      { code: { coding: [{ code: "a4-county" }] }, valueString: "Nairobi" },
    ];
    const back = mod.payloadFromObservations(observations);
    expect(back.answers["alert-calling-about"]).toBe("chief");
    expect(back.answers["alert-symptoms"]).toBe("fever;severe-headache");
    expect(back.locations["a4-county"]).toEqual({ id: "", name: "Nairobi" });
  });

  it("summarises a log for the list, showing the linked case's EPID", () => {
    const bundle = mod.buildCreateBundle({ ...assessment, linkedCase: CASE }, { now: NOW, newId: ids() });
    const [patient] = byType(bundle, "Patient");
    const summary = mod.toSummary(patient, byType(bundle, "Observation"));
    expect(summary).toMatchObject({
      epid: "KEN-NAI-EME-2026-VHF-001",
      callerName: "Peter Caller",
      county: "Nairobi",
      pathway: "Symptoms or exposure assessment",
      actionStatus: "Pending",
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
      answers: { ...assessment.answers, "alert-action-status": "completed", "alert-description": "Sent RRT" },
      locations,
    };
    delete edited.answers["alert-exposures"];

    const bundle = mod.buildUpdateBundle(log, edited, { now: NOW, newId: () => "new-obs" });
    const puts = bundle.entry.filter((e) => e.request.method === "PUT").map((e) => e.resource!);
    const deletes = bundle.entry.filter((e) => e.request.method === "DELETE").map((e) => e.request.url);

    const status = puts.find((r) => r.resourceType === "Observation" && r.code.coding[0].code === "alert-action-status");
    expect(status?.id).toBe(obsFor(created, "alert-action-status").id);
    expect(status?.valueString).toBe("Completed");
    expect(puts.find((r) => r.id === "new-obs")?.valueString).toBe("Sent RRT");
    // Unchanged answers are left alone; the EPID is never touched.
    expect(puts.some((r) => r.resourceType === "Observation" && r.code.coding[0].code === "alert-symptoms")).toBe(false);
    expect(deletes).toEqual(
      expect.arrayContaining([
        `Observation/${obsFor(created, "alert-exposures").id}`,
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

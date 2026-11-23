import { beforeAll, describe, expect, it } from "vitest";
import type { CallLogPayload } from "./call-centre";

process.env.FHIR_BASE_URL = "http://hapi.internal:8080/fhir";
let mod: typeof import("./fhir-call-centre");
beforeAll(async () => {
  mod = await import("./fhir-call-centre");
});

const NOW = new Date("2026-11-23T07:30:00Z"); // 10:30 in Nairobi
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const locations = {
  "a4-county": { id: "c1", name: "Nairobi" },
  "a3-sub-county": { id: "s1", name: "Embakasi East" },
};

const triage: CallLogPayload = {
  answers: {
    "alert-date": "2026-11-23",
    "alert-time": "10:15",
    "alert-received-by": "Jane Officer",
    "alert-source-type": "hotline",
    "alert-mode": "phone",
    "alert-reporter-name": "Peter Reporter",
    "alert-reporter-mobile": "0712345678",
    "alert-facility": "Mukuru Health Centre",
    "alert-description": "Three people in one family with fever and bleeding",
    "alert-first-noticed": "2026-11-20",
    "alert-suspected-cases": "3",
    "alert-symptoms": "fever;bleeding",
    "alert-confirmed": "no",
    // Only asked when another source confirmed it: must not be saved.
    "alert-confirmed-source": "left over",
    "alert-risk-level": "high",
    "alert-actions": "notify-county;activate-rrt",
    "alert-officer-name": "Jane Officer",
    "alert-officer-signature": "Jane Officer",
    "alert-officer-date": "2026-11-23",
  },
  locations,
};

/** An alert logged on the earlier Alert Log form. */
const legacy: CallLogPayload = {
  answers: {
    "alert-date": "2026-11-10",
    "alert-source-type": "hotline",
    "alert-facility": "Mukuru Health Centre",
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
    "alert-onset-date": "2026-11-08",
    "alert-true-onset-date": "2026-11-08",
    "alert-fever": "yes",
    "alert-headache": "no",
    "alert-chills": "no",
    "alert-weakness": "yes",
    "alert-joint-pain": "no",
    "alert-fatigue": "no",
    "alert-muscle-pain": "no",
    "alert-diarrhoea": "no",
    "alert-nose-bleeding": "no",
    "alert-vomiting": "yes",
    "alert-unexplained-bleeding": "no",
    "alert-known-case-contact": "no",
    "alert-travelled": "no",
    "alert-facilities-visited": "None",
    "alert-sample-collected": "no",
    "alert-meets-case-definition": "yes",
    "alert-investigator-name": "Jane Investigator",
  },
  locations: { ...locations, "a2-ward": { id: "w1", name: "Utawala" } },
};

const CASE = { patientId: "case-9", epid: "KEN-NAI-EME-2026-VHF-001", name: "Mary Otieno" };

const byType = (bundle: { entry: Array<{ resource?: any }> }, type: string) =>
  bundle.entry.map((e) => e.resource).filter((r) => r?.resourceType === type);
const obsFor = (bundle: { entry: Array<{ resource?: any }> }, code: string) =>
  byType(bundle, "Observation").find((o) => o.code.coding[0].code === code);

describe("buildCreateBundle", () => {
  it("saves an alert in the mobile app's shape", () => {
    const bundle = mod.buildCreateBundle(triage, { practitionerId: "pr-1", now: NOW, newId: ids() });
    expect(bundle.type).toBe("transaction");
    expect(bundle.entry.every((e) => e.request.method === "PUT")).toBe(true);

    const [patient] = byType(bundle, "Patient");
    const [encounter] = byType(bundle, "Encounter");
    const [response] = byType(bundle, "QuestionnaireResponse");
    expect(patient.identifier).toContainEqual(
      expect.objectContaining({ system: "alert-rumor-log", value: encounter.id }),
    );
    expect(patient.identifier[0]).toMatchObject({ system: "system-creation", value: "2026-11-23 10:30:00" });
    // A triage alert is about an event, not a named person.
    expect(patient.name).toEqual([{ family: "Alert" }]);
    expect(patient.telecom).toBeUndefined();
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
    const bundle = mod.buildCreateBundle(triage, { now: NOW, newId: ids() });
    expect(obsFor(bundle, "a3-sub-county").valueString).toBe("Embakasi East");
    expect(obsFor(bundle, "alert-symptoms").valueString).toBe("Fever, Bleeding");
    expect(obsFor(bundle, "alert-risk-level").valueString).toBe("High");
    expect(obsFor(bundle, "alert-date").valueString).toBe("2026-11-23");
    expect(obsFor(bundle, "alert-time").valueString).toBe("10:15:00");
    expect(obsFor(bundle, "alert-confirmed-source")).toBeUndefined();
    expect(obsFor(bundle, "alert-symptoms").code.coding[0].system).toBe("http://snomed.info/sct");
    // Alert logs get no EPID, provisional or otherwise.
    expect(obsFor(bundle, "EPID")).toBeUndefined();
    expect(obsFor(bundle, "linked-case-epid")).toBeUndefined();
    expect(JSON.stringify(bundle)).not.toContain("hie.org/identifiers/EPID");
  });

  it("keeps repeated choices as separate response answers, and dates as dates", () => {
    const bundle = mod.buildCreateBundle(triage, { now: NOW, newId: ids() });
    const [response] = byType(bundle, "QuestionnaireResponse");
    const section = (id: string) => response.item.find((i: any) => i.linkId === id);
    const action = section("alert-action-section").item.find((i: any) => i.linkId === "alert-actions");
    expect(action.answer.map((a: any) => a.valueCoding.code)).toEqual(["notify-county", "activate-rrt"]);
    const info = section("alert-info");
    expect(info.item.find((i: any) => i.linkId === "alert-date").answer).toEqual([{ valueDate: "2026-11-23" }]);
    expect(info.item.find((i: any) => i.linkId === "a4-county").answer[0].valueReference).toEqual({
      reference: "Location/c1",
      display: "Nairobi",
    });
  });

  it("never saves a new alert on the earlier Alert Log form", () => {
    const bundle = mod.buildCreateBundle(legacy, { now: NOW, newId: ids() });
    expect(obsFor(bundle, "alert-meets-case-definition")).toBeUndefined();
    expect(obsFor(bundle, "873240407472")).toBeUndefined();
    expect(obsFor(bundle, "alert-reporter-name").valueString).toBe("Peter Reporter");
  });
});

describe("reading a saved alert back", () => {
  it("restores the form's answers from the response", () => {
    const bundle = mod.buildCreateBundle(triage, { now: NOW, newId: ids() });
    const [response] = byType(bundle, "QuestionnaireResponse");
    const back = mod.payloadFromResponse(response);
    expect(back.answers["alert-actions"]).toBe("notify-county;activate-rrt");
    expect(back.answers["alert-date"]).toBe("2026-11-23");
    expect(back.answers["alert-time"]).toBe("10:15");
    expect(back.answers["alert-suspected-cases"]).toBe("3");
    expect(back.locations["a4-county"]).toEqual({ id: "c1", name: "Nairobi" });
  });

  it("falls back to the Observations, matching option labels", () => {
    const observations = [
      { code: { coding: [{ code: "alert-symptoms" }] }, valueString: "Fever, Respiratory symptoms" },
      { code: { coding: [{ code: "alert-risk-level" }] }, valueString: "Critical" },
      { code: { coding: [{ code: "a4-county" }] }, valueString: "Nairobi" },
    ];
    const back = mod.payloadFromObservations(observations);
    expect(back.answers["alert-symptoms"]).toBe("fever;respiratory-symptoms");
    expect(back.answers["alert-risk-level"]).toBe("critical");
    expect(back.locations["a4-county"]).toEqual({ id: "", name: "Nairobi" });
  });

  it("reads earlier alert logs with the earlier form", () => {
    const observations = [
      { code: { coding: [{ code: "alert-vital-status" }] }, valueString: "Deceased" },
      { code: { coding: [{ code: "alert-meets-case-definition" }] }, valueString: "Yes" },
    ];
    const back = mod.payloadFromObservations(observations);
    expect(back.answers["alert-vital-status"]).toBe("deceased");
    expect(back.answers["alert-meets-case-definition"]).toBe("yes");
  });

  it("summarises an alert for the list, showing the linked case's EPID", () => {
    const bundle = mod.buildCreateBundle({ ...triage, linkedCase: CASE }, { now: NOW, newId: ids() });
    const [patient] = byType(bundle, "Patient");
    const summary = mod.toSummary(patient, byType(bundle, "Observation"));
    expect(summary).toMatchObject({
      epid: "KEN-NAI-EME-2026-VHF-001",
      receivedAt: "2026-11-23T10:15:00+03:00",
      receivedBy: "Jane Officer",
      reporterName: "Peter Reporter",
      source: "Hotline",
      county: "Nairobi",
      riskLevel: "High",
      action: "Notify County, Activate RRT",
    });
  });
});

describe("buildUpdateBundle", () => {
  const logOf = (bundle: { entry: Array<{ resource?: any }> }) => {
    const [patient] = byType(bundle, "Patient");
    const [encounter] = byType(bundle, "Encounter");
    const [response] = byType(bundle, "QuestionnaireResponse");
    return { patient, encounter, encounterId: encounter.id, response, observations: byType(bundle, "Observation") };
  };

  it("updates changed answers, adds new ones and deletes cleared ones", () => {
    const created = mod.buildCreateBundle(triage, { now: NOW, newId: ids() });
    const log = logOf(created);
    const edited: CallLogPayload = {
      answers: { ...triage.answers, "alert-risk-level": "critical", "alert-remarks": "RRT sent" },
      locations,
    };
    delete edited.answers["alert-symptoms"];

    const bundle = mod.buildUpdateBundle(log, edited, { now: NOW, newId: () => "new-obs" });
    const puts = bundle.entry.filter((e) => e.request.method === "PUT").map((e) => e.resource!);
    const deletes = bundle.entry.filter((e) => e.request.method === "DELETE").map((e) => e.request.url);

    const risk = puts.find((r) => r.resourceType === "Observation" && r.code.coding[0].code === "alert-risk-level");
    expect(risk?.id).toBe(obsFor(created, "alert-risk-level").id);
    expect(risk?.valueString).toBe("Critical");
    expect(puts.find((r) => r.id === "new-obs")?.valueString).toBe("RRT sent");
    // Unchanged answers are left alone.
    expect(puts.some((r) => r.resourceType === "Observation" && r.code.coding[0].code === "alert-actions")).toBe(false);
    expect(deletes).toEqual([`Observation/${obsFor(created, "alert-symptoms").id}`]);
    expect(puts.find((r) => r.resourceType === "QuestionnaireResponse")?.id).toBe(response(created).id);
  });

  it("keeps an earlier alert log on its own form when edited", () => {
    const patient = { resourceType: "Patient", id: "old-1", identifier: [{ system: "alert-rumor-log", value: "enc-1" }] };
    const old = { patient, encounter: null, encounterId: "enc-1", response: null, observations: [] };
    const edited: CallLogPayload = {
      ...legacy,
      answers: {
        ...legacy.answers,
        "alert-vital-status": "deceased",
        // Section E (assessment) is asked only when a sample was collected.
        "alert-sample-collected": "yes",
        "alert-specimen-date": "2026-11-10",
        "alert-specimen-type": "whole-blood-edta",
      },
    };
    const bundle = mod.buildUpdateBundle(old, edited, { now: NOW, newId: ids() });
    expect(obsFor(bundle, "alert-vital-status").valueString).toBe("Deceased");
    expect(obsFor(bundle, "alert-meets-case-definition").valueString).toBe("Yes");
    const saved = byType(bundle, "Patient")[0];
    expect(saved.name).toEqual([{ family: "Otieno", given: ["Mary"] }]);
    expect(saved.telecom[0].value).toBe("0798765432");
    const [resp] = byType(bundle, "QuestionnaireResponse");
    expect(resp.item.map((i: any) => i.linkId)).toContain("alert-patient");
  });
});

function response(bundle: { entry: Array<{ resource?: any }> }) {
  return byType(bundle, "QuestionnaireResponse")[0];
}

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
    const { created, log } = logFrom({ ...triage, linkedCase: CASE });
    const link = obsFor(created, "linked-case-epid");
    expect(link.valueString).toBe(CASE.epid);
    expect(link.focus).toEqual([{ reference: "Patient/case-9", display: "Mary Otieno" }]);
    expect(mod.linkedCaseOf(log.observations)).toEqual(CASE);
  });

  it("can be added to a log later", () => {
    const { log } = logFrom(triage);
    const bundle = mod.buildUpdateBundle(log, { ...triage, linkedCase: CASE }, { now: NOW, newId: () => "link-1" });
    const link = bundle.entry.find((e) => e.resource?.id === "link-1")?.resource;
    expect(link?.valueString).toBe(CASE.epid);
  });

  it("is rewritten when changed and deleted when removed", () => {
    const { created, log } = logFrom({ ...triage, linkedCase: CASE });
    const linkId = obsFor(created, "linked-case-epid").id;

    const other = { patientId: "case-2", epid: "KEN-KIS-KIS-2026-MEA-004" };
    const changed = mod.buildUpdateBundle(log, { ...triage, linkedCase: other }, { now: NOW });
    const put = changed.entry.find((e) => e.request.url === `Observation/${linkId}`);
    expect(put?.request.method).toBe("PUT");
    expect(put?.resource?.valueString).toBe(other.epid);

    const removed = mod.buildUpdateBundle(log, { ...triage, linkedCase: null }, { now: NOW });
    expect(removed.entry.find((e) => e.request.url === `Observation/${linkId}`)?.request.method).toBe("DELETE");

    const unchanged = mod.buildUpdateBundle(log, { ...triage, linkedCase: CASE }, { now: NOW });
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
    const bundle = mod.buildCreateBundle(triage, { now: NOW, newId: ids() });
    const [patient] = byType(bundle, "Patient");
    expect(mod.toSummary(patient, []).logId).toBeUndefined();
    patient.identifier.push({ system: mod.ALERT_LOG_ID_SYSTEM, value: "KEN-NAI-EME-2026-ALR-001" });
    expect(mod.toSummary(patient, []).logId).toBe("KEN-NAI-EME-2026-ALR-001");
  });
});

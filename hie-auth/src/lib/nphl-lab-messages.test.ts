import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAB_NUMBER_SYSTEM,
  SPECIMEN_LABEL_SYSTEM,
  buildSpecimenTask,
  buildTestObservations,
  parseLabMessages,
  parseLabUpdates,
  taskWithLabNote,
} from "./nphl-lab";
import { applyLabUpdates } from "./nphl-lab-sync";

// Two test rows for one specimen as the live lab-staging /list returns them (Oct 2026): the tube
// barcode in specimenIdentifier, the NVRL accession number in caseIdentifier, LOINC codes.
const liveRow = (over: Record<string, unknown> = {}) => ({
  id: 30393,
  subjectIdentifier: "NVRL/1051/26",
  caseIdentifier: "NVRL/1051/26",
  identifier: "10175",
  orderIdentifier: "",
  specimenIdentifier: "2261733",
  specimenType: "Blood",
  collectDate: "2026-09-15",
  performerMFL: "13080",
  effectiveDateTime: "2026-09-16",
  code: "86518-8",
  testName: "EVD",
  codeText: "Ebola VIrus",
  componentCode: "86518-8",
  value: null,
  unit: "NONE",
  conclusion: "Absent",
  valueCode: "LA9634-2",
  testingLabCode: "20580",
  testingLabName: "National Virology Reference Laboratory (NVRL)",
  ...over,
});
const marburg = { code: "86574-1", componentCode: "86574-1", testName: "MARBUG", codeText: "Marbug virus" };

describe("parseLabUpdates with the live line-list shape", () => {
  it("keeps the lab number and LOINC codes, and lists repeated test rows once", () => {
    const [u] = parseLabUpdates([liveRow(), liveRow({ ...marburg }), liveRow(), liveRow({ ...marburg })]);
    expect(u).toMatchObject({ specimenId: "2261733", labNumber: "NVRL/1051/26", kind: "result" });
    expect(u).not.toHaveProperty("altIds");
    if (u.kind !== "result") throw new Error();
    expect(u.result.narration.map((n) => [n.test_name, n.code, n.result])).toEqual([
      ["EVD", "86518-8", "Negative"],
      ["MARBUG", "86574-1", "Negative"],
    ]);
    const [ebola] = buildTestObservations({
      specimen: { id: "spec-1", subject: { reference: "Patient/p1" } },
      caseEncounterId: "case-1",
      result: u.result,
    });
    expect(ebola.code.coding).toContainEqual({ system: "http://loinc.org", code: "86518-8" });
  });

  it("offers the order identifier as an alternative ID", () => {
    const [u] = parseLabUpdates([liveRow({ orderIdentifier: "KEN-KER-001-S1" })]);
    expect(u.altIds).toEqual(["KEN-KER-001-S1"]);
  });
});

describe("parseLabMessages", () => {
  it("reads progress, notes, results and rejections, in any spelling of the type", () => {
    const { updates, invalid } = parseLabMessages({
      data: [
        { messageType: "SPECIMEN_RECEIVED", specimenIdentifier: "A", date: "2026-10-15T08:00:00+03:00", laboratory: "NVRL", caseIdentifier: "NVRL/1/26" },
        { message_type: "testing", specimen_id: "B" },
        { messageType: "note", specimenIdentifier: "C", text: "Please send a repeat sample", laboratory: "NVRL" },
        { messageType: "rejected", specimen_id: "D", rejection_reason: "Haemolysed" },
        liveRow({ specimenIdentifier: "E" }),
      ],
    });
    expect(invalid).toEqual([]);
    expect(updates.map((u) => [u.specimenId, u.kind])).toEqual([
      ["A", "progress"],
      ["B", "progress"],
      ["C", "note"],
      ["E", "result"],
      ["D", "rejected"],
    ]);
    expect(updates[0]).toMatchObject({
      labNumber: "NVRL/1/26",
      progress: { stage: "received", date: "2026-10-15T08:00:00+03:00", lab: "NVRL" },
    });
    expect(updates[1]).toMatchObject({ progress: { stage: "in-testing", date: null, lab: null } });
    expect(updates[2]).toMatchObject({ note: { text: "Please send a repeat sample", lab: "NVRL" } });
    expect(updates[4]).toMatchObject({ rejection: { reason: "Haemolysed" } });
  });

  it("lists unusable messages by index and drops dates FHIR would refuse", () => {
    const { updates, invalid } = parseLabMessages([
      { messageType: "teleport", specimenIdentifier: "A" },
      { messageType: "received" },
      { messageType: "note", specimenIdentifier: "C" },
      { specimen_id: "D", laboratory_result: "Pending" },
      "junk",
      { messageType: "received", specimenIdentifier: "F", date: "15/10/2026" },
    ]);
    expect(invalid.map((i) => [i.index, i.error])).toEqual([
      [0, 'Unknown messageType "teleport"'],
      [1, "Missing specimenIdentifier"],
      [2, "A note needs text"],
      [3, "No recognisable result or rejection"],
      [4, "Message is not an object"],
    ]);
    expect(updates).toEqual([{ specimenId: "F", kind: "progress", progress: { stage: "received", date: null, lab: null } }]);
  });
});

describe("Task lab progress", () => {
  const specimen = {
    resourceType: "Specimen",
    id: "spec-1",
    subject: { reference: "Patient/p1" },
    identifier: [{ system: SPECIMEN_LABEL_SYSTEM, value: "2261733" }],
  };

  it("records the stage, keeps the lab number and lab notes on later states", () => {
    const received = buildSpecimenTask({
      specimen,
      caseEncounterId: "case-1",
      state: { kind: "lab-progress", progress: { stage: "received", date: "2026-10-15", lab: "NVRL" } },
      labNumber: "NVRL/1051/26",
    });
    expect(received).toMatchObject({ status: "in-progress", businessStatus: { coding: [{ code: "received-at-lab" }] } });
    expect(received.output).toEqual([
      { type: { text: "received-on" }, valueDateTime: "2026-10-15" },
      { type: { text: "laboratory" }, valueString: "NVRL" },
    ]);
    const noted = taskWithLabNote(received, { text: "Repeat sample needed", date: null, lab: "NVRL" }, "2026-10-15T10:00:00Z")!;
    expect(noted.note).toEqual([{ authorString: "NVRL", time: "2026-10-15T10:00:00Z", text: "Repeat sample needed" }]);
    expect(taskWithLabNote(noted, { text: "Repeat sample needed", date: null, lab: "NVRL" })).toBeNull();

    const later = buildSpecimenTask({ existing: noted, specimen, caseEncounterId: "case-1", state: { kind: "submitted", result: null } });
    expect(later.identifier).toContainEqual({ system: LAB_NUMBER_SYSTEM, value: "NVRL/1051/26" });
    expect(later.note).toEqual(noted.note);
  });
});

// applyLabUpdates against a mocked FHIR server holding one submitted specimen.
const puts: any[] = [];
let task: any;
vi.mock("./utils", () => ({
  FhirApi: vi.fn(async ({ url, method, data }: { url: string; method?: string; data?: string }) => {
    if (method === "PUT") {
      const r = JSON.parse(String(data));
      puts.push(r);
      if (r.resourceType === "Task") task = r;
      return { status: "success", data: {} };
    }
    if (url.startsWith("/Task?")) {
      const label = decodeURIComponent(url).match(/specimen-id\|([^&]+)/)?.[1];
      return { status: "success", data: { entry: label === "TUBE-1" ? [{ resource: task }] : [] } };
    }
    if (url === "/Specimen/spec-1") return { status: "success", data: { resourceType: "Specimen", id: "spec-1", status: "available", subject: { reference: "Patient/p1" } } };
    return { status: "error", data: {} };
  }),
  apiHost: "http://hapi/fhir",
}));
vi.mock("./prisma", () => ({ prisma: { fhirSubscriptionCallbackLog: { create: vi.fn(async () => ({})) } } }));
vi.mock("./nphl-result-notification", () => ({ notifySpecimenOutcome: vi.fn(async () => ({ sent: true })) }));

describe("applyLabUpdates", () => {
  beforeEach(() => {
    puts.length = 0;
    task = {
      resourceType: "Task",
      id: "nphl-spec-1",
      status: "in-progress",
      businessStatus: { coding: [{ code: "awaiting-result" }] },
      identifier: [{ system: SPECIMEN_LABEL_SYSTEM, value: "TUBE-1" }],
      focus: { reference: "Specimen/spec-1" },
      encounter: { reference: "Encounter/case-1" },
      authoredOn: "2026-10-14T08:00:00Z",
    };
  });

  it("matches on the order identifier when the specimen ID is unknown", async () => {
    const { updates } = parseLabMessages([{ messageType: "received", specimenIdentifier: "2261733", orderIdentifier: "TUBE-1" }]);
    const [o] = await applyLabUpdates(updates);
    expect(o).toMatchObject({ matched: true, matchedOn: "TUBE-1", businessStatus: "received-at-lab" });
    expect(task.businessStatus.coding[0].code).toBe("received-at-lab");
  });

  it("never steps back from a result to a progress stage", async () => {
    await applyLabUpdates(parseLabMessages([liveRow({ specimenIdentifier: "TUBE-1" })]).updates);
    expect(task.businessStatus.coding[0].code).toBe("final-result");
    expect(task.identifier).toContainEqual({ system: LAB_NUMBER_SYSTEM, value: "NVRL/1051/26" });
    puts.length = 0;
    const [o] = await applyLabUpdates(parseLabMessages([{ messageType: "in-testing", specimenIdentifier: "TUBE-1" }]).updates);
    expect(o).toMatchObject({ matched: true, businessStatus: "final-result" });
    expect(puts).toEqual([]);
  });

  it("adds a note once, and reports unknown specimens as unmatched", async () => {
    const note = parseLabMessages([{ messageType: "note", specimenIdentifier: "TUBE-1", text: "Repeat sample" }]).updates;
    await applyLabUpdates(note);
    await applyLabUpdates(note);
    expect(puts.filter((r) => r.resourceType === "Task")).toHaveLength(1);
    expect(task.note).toMatchObject([{ authorString: "Laboratory", text: "Repeat sample" }]);
    const [o] = await applyLabUpdates(parseLabMessages([{ messageType: "note", specimenIdentifier: "NOPE", text: "x" }]).updates);
    expect(o).toMatchObject({ matched: false });
  });
});

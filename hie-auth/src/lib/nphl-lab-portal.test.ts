import { beforeEach, describe, expect, it, vi } from "vitest";

const LABEL = "http://nphiis.health.go.ke/fhir/identifiers/specimen-id";
const puts: any[] = [];
// Linked to its case, but never synced, so it has no Task.
const specimen = {
  resourceType: "Specimen",
  id: "spec-2",
  status: "available",
  identifier: [{ system: LABEL, value: "TUBE-2" }],
  extension: [{ url: "http://hl7.org/fhir/StructureDefinition/workflow-encounter", valueReference: { reference: "Encounter/case-1" } }],
  subject: { reference: "Patient/p1" },
};

vi.mock("./utils", () => ({
  FhirApi: vi.fn(async ({ url, method, data }: { url: string; method?: string; data?: string }) => {
    if (method === "PUT") {
      puts.push(JSON.parse(String(data)));
      return { status: "success", data: {} };
    }
    if (url.startsWith("/Task?")) return { status: "success", data: { resourceType: "Bundle", entry: [] } };
    if (url.startsWith("/Specimen?identifier=")) {
      const hit = decodeURIComponent(url).endsWith("|TUBE-2");
      return { status: "success", data: { resourceType: "Bundle", entry: hit ? [{ resource: specimen }] : [] } };
    }
    if (url === "/Specimen/spec-2") return { status: "success", data: specimen };
    return { status: "error", data: {} };
  }),
  apiHost: "http://hapi/fhir",
}));
vi.mock("./prisma", () => ({ prisma: { fhirSubscriptionCallbackLog: { create: vi.fn(async () => ({})) } } }));
vi.mock("./nphl-result-notification", () => ({ notifySpecimenOutcome: vi.fn(async () => ({ sent: true })) }));

import { applyLabUpdates } from "./nphl-lab-sync";
import { parseLabMessages } from "./nphl-lab";

const received = { messageType: "received", specimenIdentifier: "TUBE-2", date: "2026-10-15", laboratory: "NVRL" };

describe("applyLabUpdates for results entered in the portal", () => {
  beforeEach(() => {
    puts.length = 0;
  });

  it("leaves a specimen without a Task unmatched for the lab system", async () => {
    const [o] = await applyLabUpdates(parseLabMessages([received]).updates);
    expect(o).toMatchObject({ matched: false });
    expect(puts).toHaveLength(0);
  });

  it("starts tracking a case's specimen that has no Task yet", async () => {
    const [o] = await applyLabUpdates(parseLabMessages([received]).updates, { createMissingTasks: true });
    expect(o).toMatchObject({ matched: true, status: "in-progress", businessStatus: "received-at-lab" });
    expect(puts.find((r) => r.resourceType === "Task")).toMatchObject({
      id: "nphl-spec-2",
      focus: { reference: "Specimen/spec-2" },
      encounter: { reference: "Encounter/case-1" },
    });
    expect(puts.find((r) => r.resourceType === "Specimen")).toMatchObject({ receivedTime: "2026-10-15" });
  });

  it("matches on the FHIR id when the specimen has no tube label", async () => {
    const [o] = await applyLabUpdates(
      parseLabMessages([{ messageType: "rejected", specimenIdentifier: "spec-2", rejection_reason: "Haemolysed" }]).updates,
      { createMissingTasks: true },
    );
    expect(o).toMatchObject({ matched: true, status: "rejected" });
  });

  it("does not start tracking with a note", async () => {
    const [o] = await applyLabUpdates(
      parseLabMessages([{ messageType: "note", specimenIdentifier: "TUBE-2", text: "Volume low" }]).updates,
      { createMissingTasks: true },
    );
    expect(o).toMatchObject({ matched: false });
    expect(puts).toHaveLength(0);
  });

  it("still reports an unknown specimen as unmatched", async () => {
    const [o] = await applyLabUpdates(parseLabMessages([{ ...received, specimenIdentifier: "NOPE" }]).updates, {
      createMissingTasks: true,
    });
    expect(o).toMatchObject({ matched: false });
  });
});

// What nphiis-admin's lib/lab-messages.ts sends; keep in step with its messagesFor.
describe("parseLabMessages on the admin portal's messages", () => {
  it("reads a multi-test preliminary result as one positive result for the specimen", () => {
    const { updates, invalid } = parseLabMessages({
      data: [
        { messageType: "result", specimenIdentifier: "TUBE-2", caseIdentifier: "NVRL/1", testName: "PCR", conclusion: "Negative", resultType: "Preliminary", effectiveDateTime: "2026-10-15", testingLabName: "NVRL" },
        { messageType: "result", specimenIdentifier: "TUBE-2", caseIdentifier: "NVRL/1", testName: "ELISA", conclusion: "Positive", resultType: "Preliminary", effectiveDateTime: "2026-10-15", testingLabName: "NVRL" },
      ],
    });
    expect(invalid).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      specimenId: "TUBE-2",
      labNumber: "NVRL/1",
      kind: "result",
      result: { result: "Positive", resultType: "Preliminary", resultDate: "2026-10-15", testingLab: "NVRL" },
    });
    expect((updates[0] as any).result.narration.map((n: any) => [n.test_name, n.result])).toEqual([
      ["PCR", "Negative"],
      ["ELISA", "Positive"],
    ]);
  });

  it("reads a rejection with its reason, date and lab, and progress with its date", () => {
    const { updates } = parseLabMessages({
      data: [
        { messageType: "rejected", specimenIdentifier: "TUBE-2", rejection_reason: "Haemolysed", date_rejected: "2026-10-15", testingLabName: "NVRL" },
        { messageType: "in-testing", specimenIdentifier: "TUBE-3", date: "2026-10-15", laboratory: "NVRL" },
      ],
    });
    expect(updates).toEqual([
      expect.objectContaining({ specimenId: "TUBE-3", kind: "progress", progress: { stage: "in-testing", date: "2026-10-15", lab: "NVRL" } }),
      expect.objectContaining({ specimenId: "TUBE-2", kind: "rejected", rejection: { reason: "Haemolysed", date: "2026-10-15", lab: "NVRL" } }),
    ]);
  });
});

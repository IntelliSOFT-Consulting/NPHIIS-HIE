import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const puts: any[] = [];
const task = {
  resourceType: "Task",
  id: "nphl-spec-1",
  status: "in-progress",
  businessStatus: { coding: [{ code: "awaiting-result" }] },
  identifier: [{ system: "http://nphiis.health.go.ke/fhir/identifiers/specimen-id", value: "TUBE-1" }],
  focus: { reference: "Specimen/spec-1" },
  encounter: { reference: "Encounter/case-1" },
  authoredOn: "2026-10-14T08:00:00Z",
};
const specimen = { resourceType: "Specimen", id: "spec-1", status: "available", meta: { versionId: "2" }, subject: { reference: "Patient/p1" } };

vi.mock("./utils", () => ({
  FhirApi: vi.fn(async ({ url, method, data }: { url: string; method?: string; data?: string }) => {
    if (method === "PUT") {
      puts.push(JSON.parse(String(data)));
      return { status: "success", data: {} };
    }
    if (url.startsWith("/Task?")) return { status: "success", data: { entry: [{ resource: task }] } };
    if (url === "/Specimen/spec-1") return { status: "success", data: specimen };
    if (url === "/Task/nphl-spec-1") return { status: "success", data: task };
    return { status: "error", data: {} };
  }),
  apiHost: "http://hapi/fhir",
}));
vi.mock("./prisma", () => ({ prisma: { fhirSubscriptionCallbackLog: { create: vi.fn(async () => ({})) } } }));
const notify = vi.fn(async () => ({ sent: true }));
vi.mock("./nphl-result-notification", () => ({ notifySpecimenOutcome: (...a: any[]) => notify(...(a as [])) }));

import { pollLabStagingResults } from "./nphl-lab-sync";

const row = (specimenIdentifier: string, conclusion: string) => ({
  specimenIdentifier,
  testName: "EVD",
  codeText: "Ebola Virus",
  conclusion,
  effectiveDateTime: "2026-10-15",
  testingLabName: "National Virology Reference Laboratory (NVRL)",
});

describe("pollLabStagingResults", () => {
  beforeEach(() => {
    puts.length = 0;
    notify.mockClear();
    process.env.LAB_STAGING_API_KEY = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Success!", data: [row("TUBE-1", "Negative"), row("OTHER-9", "Positive")] }))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LAB_STAGING_API_KEY;
  });

  it("records results only for our open specimens, updates the Specimen and emails once", async () => {
    const stats = await pollLabStagingResults();
    expect(stats).toEqual({ rows: 2, open: 1, updates: 1, matched: 1 });

    const fetchUrl = String((fetch as any).mock.calls[0][0]);
    expect(fetchUrl).toMatch(/^https:\/\/lab-staging-api\.nphl\.go\.ke\/list\?dateFrom=\d{4}-\d{2}-\d{2}$/);

    const observation = puts.find((r) => r.resourceType === "Observation");
    expect(observation).toMatchObject({ id: "nphl-result-spec-1", valueString: "Negative", specimen: { reference: "Specimen/spec-1" } });
    expect(puts.find((r) => r.resourceType === "Task")).toMatchObject({ status: "completed" });
    const spec = puts.find((r) => r.resourceType === "Specimen");
    expect(spec.extension[0].valueCoding.code).toBe("final-result");

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]).toMatchObject([{ outcome: "final-result", caseEncounterId: "case-1" }]);
  });

  it("reports a missing key without calling the API", async () => {
    delete process.env.LAB_STAGING_API_KEY;
    expect(await pollLabStagingResults()).toEqual({ error: "LAB_STAGING_API_KEY is not configured" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

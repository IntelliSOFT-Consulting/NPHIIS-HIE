import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fhirCalls: string[] = [];
vi.mock("./utils", () => ({
  FhirApi: vi.fn(async ({ url }: { url: string }) => {
    fhirCalls.push(url);
    // Not a VHF case: the sync stops right after loading the Encounter.
    if (url.startsWith("/Encounter/")) return { status: "success", data: { resourceType: "Encounter", id: url.split("/")[2] } };
    return { status: "error", data: {} };
  }),
  apiHost: "http://hapi/fhir",
}));
vi.mock("./prisma", () => ({ prisma: { fhirSubscriptionCallbackLog: { create: vi.fn(async () => ({})) } } }));

import { queueCaseSync } from "./nphl-lab-sync";

describe("queueCaseSync", () => {
  beforeEach(() => {
    fhirCalls.length = 0;
    vi.useFakeTimers();
    process.env.NPHL_SYNC_DEBOUNCE_MS = "1000";
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NPHL_SYNC_DEBOUNCE_MS;
  });

  it("coalesces a burst of callbacks for one case into a single sync", async () => {
    expect(queueCaseSync("case-1")).toBe("queued");
    for (let i = 0; i < 4; i++) expect(queueCaseSync("case-1")).toBe("already-queued");
    expect(queueCaseSync("case-2")).toBe("queued");
    await vi.advanceTimersByTimeAsync(1000);
    expect(fhirCalls.filter((u) => u === "/Encounter/case-1")).toHaveLength(1);
    expect(fhirCalls.filter((u) => u === "/Encounter/case-2")).toHaveLength(1);
  });

  it("waits for the quiet window before syncing", async () => {
    queueCaseSync("case-3");
    await vi.advanceTimersByTimeAsync(500);
    expect(fhirCalls).not.toContain("/Encounter/case-3");
    await vi.advanceTimersByTimeAsync(500);
    expect(fhirCalls).toContain("/Encounter/case-3");
  });
});

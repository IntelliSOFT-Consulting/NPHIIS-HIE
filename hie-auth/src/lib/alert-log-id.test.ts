import { beforeEach, describe, expect, it, vi } from "vitest";

const fhir = vi.hoisted(() => ({ FhirApi: vi.fn() }));
const tracker = vi.hoisted(() => ({ generateCaseId: vi.fn() }));
const place = vi.hoisted(() => ({ resolveLocationNamesForEncounter: vi.fn() }));
vi.mock("./utils", () => ({ FhirApi: fhir.FhirApi, FhirIdentifier: vi.fn() }));
vi.mock("./caseIdTracker", () => tracker);
vi.mock("./county-segment-registry", () => ({ resolveCountyLocationSegment: vi.fn(async () => "NAI") }));
vi.mock("./epid-location-segment", async (orig) => ({
  ...(await orig<typeof import("./epid-location-segment")>()),
  resolveLocationNamesForEncounter: place.resolveLocationNamesForEncounter,
}));

import { ALERT_LOG_ID_SYSTEM_URI, alertLogYear, assignAlertLogId, getAlertLogId } from "./alert-log-id";

const created = (stamp: string) => ({ system: "system-creation", value: stamp });
const LOG = "alert-rumor-log";

function hapi(store: Record<string, any>) {
  const puts: Array<{ url: string; body: any }> = [];
  fhir.FhirApi.mockImplementation(async ({ url, method, data }: any) => {
    if (method === "PUT") {
      const body = JSON.parse(data);
      puts.push({ url, body });
      store[url] = body;
      return { status: "success", data: body };
    }
    return store[url] ? { status: "success", data: store[url] } : { status: "error", data: {} };
  });
  return puts;
}

const store = () => ({
  "/Encounter/e1": {
    resourceType: "Encounter",
    id: "e1",
    subject: { reference: "Patient/p1" },
    reasonCode: [{ coding: [{ code: "Alert Rumor Log" }] }],
    identifier: [created("2026-10-22 09:15:00")],
  },
  "/Patient/p1": {
    resourceType: "Patient",
    id: "p1",
    meta: { versionId: "3" },
    identifier: [created("2026-10-22 09:15:00"), { system: LOG, value: "e1" }],
  },
});

beforeEach(() => {
  fhir.FhirApi.mockReset();
  tracker.generateCaseId.mockReset();
  place.resolveLocationNamesForEncounter.mockReset();
  place.resolveLocationNamesForEncounter.mockResolvedValue({
    countryName: "KENYA",
    countyName: "NAIROBI",
    subCountyName: "EMBAKASI EAST",
  });
});

describe("assignAlertLogId", () => {
  it("numbers the log per sub-county and year, like an EPID, on the Patient and the Encounter", async () => {
    tracker.generateCaseId.mockResolvedValue(4);
    const s = store();
    const puts = hapi(s);

    const r = await assignAlertLogId("e1");

    expect(r).toMatchObject({ kind: "success", alertLogId: expect.stringMatching(/^KEN-NAI-.+-2026-ALR-004$/) });
    expect(tracker.generateCaseId).toHaveBeenCalledWith("KENYA", "NAIROBI", "EMBAKASI EAST", "ALR-2026");
    expect(puts.map((p) => p.url)).toEqual(["/Patient/p1", "/Encounter/e1"]);
    const id = (r as { alertLogId: string }).alertLogId;
    expect(getAlertLogId(s["/Patient/p1"])).toBe(id);
    expect(getAlertLogId(s["/Encounter/e1"])).toBe(id);
    // Never an EPID.
    expect(JSON.stringify(s["/Patient/p1"])).not.toContain("identifiers/EPID");
    expect(s["/Patient/p1"].identifier.at(-1)?.system).toBe(ALERT_LOG_ID_SYSTEM_URI);
  });

  it("does nothing more once both have the ID (so its own Encounter update cannot renumber it)", async () => {
    tracker.generateCaseId.mockResolvedValue(1);
    const s = store();
    hapi(s);
    const first = await assignAlertLogId("e1");
    const puts = hapi(s);
    const again = await assignAlertLogId("e1");

    expect(again).toMatchObject({ kind: "success", alertLogId: (first as { alertLogId: string }).alertLogId });
    expect(puts).toEqual([]);
    expect(tracker.generateCaseId).toHaveBeenCalledTimes(1);
  });

  it("copies an ID already on the Patient to the Encounter without a new number", async () => {
    const s = store();
    s["/Patient/p1"].identifier.push({ system: ALERT_LOG_ID_SYSTEM_URI, value: "KEN-NAI-EME-2026-ALR-009" });
    const puts = hapi(s);

    const r = await assignAlertLogId("e1");

    expect(r).toMatchObject({ kind: "success", alertLogId: "KEN-NAI-EME-2026-ALR-009" });
    expect(tracker.generateCaseId).not.toHaveBeenCalled();
    expect(puts.map((p) => p.url)).toEqual(["/Encounter/e1"]);
  });

  it("is not retryable when the log has no sub-county", async () => {
    place.resolveLocationNamesForEncounter.mockResolvedValue(null);
    hapi(store());
    expect(await assignAlertLogId("e1")).toMatchObject({ kind: "error", retryable: false });
  });
});

describe("alertLogYear", () => {
  it("comes from the creation stamp, else this year", () => {
    expect(alertLogYear({ identifier: [created("2025-12-31 23:59:00")] }, {})).toBe(2025);
    expect(alertLogYear({}, {}, new Date("2027-03-01"))).toBe(2027);
  });
});

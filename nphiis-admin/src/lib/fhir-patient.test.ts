import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.FHIR_BASE_URL = "http://hapi.test/fhir";
let listCasesWithoutLabResult: typeof import("./fhir-patient").listCasesWithoutLabResult;
beforeAll(async () => {
  ({ listCasesWithoutLabResult } = await import("./fhir-patient"));
});
afterEach(() => vi.unstubAllGlobals());

const SYSTEM = "measles-case-information";

function patient(id: string, epid: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    resourceType: "Patient", id, name: [{ text: name }],
    address: [{ city: "BOMET", state: "KONOIN" }],
    identifier: [
      { system: SYSTEM, value: `enc-${id}` },
      { value: epid, type: { coding: [{ code: "EPID" }] } },
    ],
    meta: { lastUpdated: "2026-10-01T00:00:00Z" },
    ...extra,
  };
}

function bundle(resources: unknown[]) {
  return { resourceType: "Bundle", entry: resources.map((resource) => ({ resource })) };
}

/** Fake HAPI: answers the three searches listCasesWithoutLabResult makes. */
function stubHapi(encounterReasonsSeen: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname.endsWith("/Patient")) {
      expect(url.searchParams.get("identifier")).toBe(`${SYSTEM}|`);
      return json(bundle([
        patient("p1", "KEN-BOM-KON-2026-MEA-001", "No Result"),
        patient("p2", "KEN-BOM-KON-2026-MEA-002", "Admin Result"),
        patient("p3", "KEN-BOM-KON-2026-MEA-003", "Mobile Result, older record"),
        patient("p4", "KEN-BOM-KON-2026-MEA-003", "Mobile Result, newer record",
                { meta: { lastUpdated: "2026-10-05T00:00:00Z" } }),
        patient("p5", "KEN-BOM-KON-2026-MEA-", "Unassigned EPID"),
        patient("p6", "KEN-BOM-KON-2026-MEA-006", "Line List Entry"),
        patient("p7", "KEN-BOM-KON-2026-MEA-007", "Inactive", { active: false }),
        patient("p8", "KEN-BOM-KON-2026-MEA-008", "Older Duplicate"),
        patient("p9", "KEN-BOM-KON-2026-MEA-008", "Newer Duplicate",
                { meta: { lastUpdated: "2026-10-09T00:00:00Z" } }),
      ]));
    }
    if (url.pathname.endsWith("/Encounter")) {
      encounterReasonsSeen.push(...(url.searchParams.get("reason-code") ?? "").split(","));
      return json(bundle([
        { resourceType: "Encounter", subject: { reference: "Patient/p2" } },
        { resourceType: "Encounter", subject: { reference: "Patient/p3" } },
      ]));
    }
    if (url.pathname.endsWith("/Observation")) {
      return json(bundle([
        { resourceType: "Observation", subject: { reference: "Patient/p6" }, valueString: "Line List" },
        { resourceType: "Observation", subject: { reference: "Patient/p1" }, valueString: "Case" },
      ]));
    }
    throw new Error(`unexpected request ${input}`);
  }));
}

describe("listCasesWithoutLabResult", () => {
  it("lists one row per EPID with no result under any of the form's reasons", async () => {
    const reasons: string[] = [];
    stubHapi(reasons);
    const { cases, withoutEpid } = await listCasesWithoutLabResult(
      SYSTEM, ["Measles Lab Information", "Measles Lab Results (mobile)"], "token");

    expect(reasons).toEqual(["Measles Lab Information", "Measles Lab Results (mobile)"]);
    expect(cases).toEqual([
      { epid: "KEN-BOM-KON-2026-MEA-001", name: "No Result", county: "BOMET", subCounty: "KONOIN" },
      // Duplicates share a row, described by the newest record.
      { epid: "KEN-BOM-KON-2026-MEA-008", name: "Newer Duplicate", county: "BOMET", subCounty: "KONOIN" },
    ]);
    // 002 has a result; 003 has one on its older record; 006 is a line-list
    // entry; 007 is inactive. Only the unassigned EPID counts as left out.
    expect(withoutEpid).toBe(1);
  });
});

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { COUNT_FIELDS, buildQuestionnaireResponse, type SnapshotInput } from "./evd-snapshot";

process.env.FHIR_BASE_URL = "http://hapi.internal:8080/fhir";
let mod: typeof import("./fhir-evd-snapshot");
beforeAll(async () => {
  mod = await import("./fhir-evd-snapshot");
});
afterEach(() => vi.unstubAllGlobals());

const LOCATIONS: Record<string, any> = {
  "34": { resourceType: "Location", id: "34", name: "KAJIADO" },
  "7": { resourceType: "Location", id: "7", name: "GARISSA" },
  "KAJIADO-EAST": { resourceType: "Location", id: "KAJIADO-EAST", name: "KAJIADO EAST", partOf: { reference: "Location/34" } },
  "KAJIADO-NORTH": { resourceType: "Location", id: "KAJIADO-NORTH", name: "KAJIADO NORTH", partOf: { reference: "Location/34" } },
  GARISSA: { resourceType: "Location", id: "GARISSA", name: "GARISSA", partOf: { reference: "Location/7" } },
};

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  county: { id: "34", name: "x" },
  subCounty: { id: "KAJIADO-EAST", name: "x" },
  reportingDate: "2026-11-24",
  focalPerson: "Jane",
  phone: "0712345678",
  email: "j@example.org",
  counts: Object.fromEntries(COUNT_FIELDS.map((f) => [f.id, "1"])),
  challenges: "",
  certified: true,
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("snapshotScopeFor", () => {
  it("lets national roles see everything", () => {
    expect(mod.snapshotScopeFor({ roles: ["NATIONAL_FOCAL_PERSON"] })).toBeNull();
    expect(mod.snapshotScopeFor({ roles: ["perm:", "ADMINISTRATOR"] })).toBeNull();
  });
  it("limits others to the smallest area on their profile, and refuses a profile with none", () => {
    const li = { county: "34", countyName: "KAJIADO", subCounty: "KAJIADO-EAST", subCountyName: "KAJIADO EAST" } as any;
    expect(mod.snapshotScopeFor({ roles: ["SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER"], locationInfo: li })).toEqual({
      subCountyId: "KAJIADO-EAST",
      subCountyName: "KAJIADO EAST",
    });
    expect(mod.snapshotScopeFor({ roles: ["COUNTY_DISEASE_SURVEILLANCE_OFFICER"], locationInfo: { ...li, subCounty: "", subCountyName: "" } })).toEqual({
      countyId: "34",
      countyName: "KAJIADO",
    });
    expect(mod.snapshotScopeFor({ roles: ["COUNTY_DISEASE_SURVEILLANCE_OFFICER"] })).toBeUndefined();
  });
});

describe("resolveReportingUnit", () => {
  const stub = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = decodeURIComponent(url.split("/Location/")[1]);
        return LOCATIONS[id] ? json(LOCATIONS[id]) : new Response("", { status: 404 });
      }),
    );

  it("takes the names from HAPI, not from the browser", async () => {
    stub();
    const u = await mod.resolveReportingUnit(input(), null, "t");
    expect(u).toEqual({ county: { id: "34", name: "KAJIADO" }, subCounty: { id: "KAJIADO-EAST", name: "KAJIADO EAST" } });
  });

  it("rejects a sub-county that is not in the county", async () => {
    stub();
    await expect(mod.resolveReportingUnit(input({ subCounty: { id: "GARISSA", name: "" } }), null, "t")).rejects.toThrow(/not in KAJIADO/);
  });

  it("rejects unknown locations", async () => {
    stub();
    await expect(mod.resolveReportingUnit(input({ subCounty: { id: "NOPE", name: "" } }), null, "t")).rejects.toThrow(/Sub-county not found/);
  });

  it("lets a sub-county officer report only for their own sub-county", async () => {
    stub();
    const own = { subCountyId: "KAJIADO-EAST" };
    await expect(mod.resolveReportingUnit(input(), own, "t")).resolves.toBeTruthy();
    await expect(mod.resolveReportingUnit(input({ subCounty: { id: "KAJIADO-NORTH", name: "" } }), own, "t")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("lets a county officer report for sub-counties of their county only", async () => {
    stub();
    const own = { countyId: "34" };
    await expect(mod.resolveReportingUnit(input({ subCounty: { id: "KAJIADO-NORTH", name: "" } }), own, "t")).resolves.toBeTruthy();
    await expect(
      mod.resolveReportingUnit(input({ county: { id: "7", name: "" }, subCounty: { id: "GARISSA", name: "" } }), own, "t"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("falls back to names when the profile carries no ids", async () => {
    stub();
    await expect(mod.resolveReportingUnit(input(), { subCountyName: " kajiado east " }, "t")).resolves.toBeTruthy();
    await expect(mod.resolveReportingUnit(input(), { subCountyName: "KAJIADO NORTH" }, "t")).rejects.toMatchObject({ status: 403 });
  });
});

describe("saveSnapshot", () => {
  it("creates the day's record with a PUT and reports it as new", async () => {
    const calls: Array<{ url: string; method: string; body?: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.includes("/QuestionnaireResponse/")) return method === "PUT" ? json({}, 201) : new Response("", { status: 404 });
        return json(LOCATIONS[decodeURIComponent(url.split("/Location/")[1])]);
      }),
    );
    const r = await mod.saveSnapshot(input(), { subCountyId: "KAJIADO-EAST" }, { submittedBy: "J" }, "t");
    expect(r).toEqual({ id: "evd-snapshot-KAJIADO-EAST-20261124", replaced: false });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("http://hapi.internal:8080/fhir/QuestionnaireResponse/evd-snapshot-KAJIADO-EAST-20261124");
    expect(put.body.resourceType).toBe("QuestionnaireResponse");
  });

  it("replaces an existing return and keeps its first submission time", async () => {
    const first = "2026-11-24T05:00:00.000Z";
    const existing = buildQuestionnaireResponse(
      { ...input(), county: { id: "34", name: "KAJIADO" }, subCounty: { id: "KAJIADO-EAST", name: "KAJIADO EAST" } },
      { now: new Date(first) },
    );
    let putBody: any;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/QuestionnaireResponse/")) {
          if (init?.method === "PUT") {
            putBody = JSON.parse(String(init.body));
            return json({});
          }
          return json(existing);
        }
        return json(LOCATIONS[decodeURIComponent(url.split("/Location/")[1])]);
      }),
    );
    const r = await mod.saveSnapshot(input(), null, {}, "t");
    expect(r.replaced).toBe(true);
    expect(putBody.authored).toBe(first);
  });

  it("does not write when the user is outside their area", async () => {
    const fetchMock = vi.fn(async (url: string) => json(LOCATIONS[decodeURIComponent(url.split("/Location/")[1])]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(mod.saveSnapshot(input(), { subCountyId: "KAJIADO-NORTH" }, {}, "t")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("QuestionnaireResponse"))).toBe(true);
  });
});

describe("listSnapshots", () => {
  it("scopes the search by tag, adds the filters, and pages on HAPI", async () => {
    let body = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = String(init?.body);
        return json({ total: 0, entry: [] });
      }),
    );
    await mod.listSnapshots("t", { countyId: "34" }, { page: 2, pageSize: 25, date: "2026-11-24", subCountyId: "KAJIADO-EAST" });
    const p = new URLSearchParams(body);
    expect(p.get("questionnaire")).toBe("http://nphiis.health.go.ke/Questionnaire/evd-daily-snapshot");
    expect(p.getAll("_tag")).toEqual([
      "http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-county|34",
      "http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-subcounty|KAJIADO-EAST",
      "http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-date|2026-11-24",
    ]);
    expect(p.get("_offset")).toBe("25");
    expect(p.get("_count")).toBe("25");
  });

  it("a sub-county officer cannot widen their view with a county filter", async () => {
    let body = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = String(init?.body);
        return json({ total: 0, entry: [] });
      }),
    );
    await mod.listSnapshots("t", { subCountyId: "KAJIADO-EAST" }, { page: 1, pageSize: 10, countyId: "7" });
    const tags = new URLSearchParams(body).getAll("_tag");
    // Both conditions are ANDed, so asking for another county returns nothing, not that county.
    expect(tags).toContain("http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-subcounty|KAJIADO-EAST");
    expect(tags).toContain("http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-county|7");
  });
});

describe("getSnapshot", () => {
  const stored = buildQuestionnaireResponse(
    { ...input(), county: { id: "34", name: "KAJIADO" }, subCounty: { id: "KAJIADO-EAST", name: "KAJIADO EAST" } },
    { now: new Date("2026-11-24T05:00:00Z") },
  );
  const stub = (r: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => json(r, status)));

  it("returns a snapshot inside the caller's area", async () => {
    stub(stored);
    expect((await mod.getSnapshot(stored.id, { subCountyId: "KAJIADO-EAST" }, "t")).subCounty).toBe("KAJIADO EAST");
  });
  it("says 'not found' for another area's snapshot instead of revealing it", async () => {
    stub(stored);
    await expect(mod.getSnapshot(stored.id, { subCountyId: "KAJIADO-NORTH" }, "t")).rejects.toMatchObject({ status: 404 });
    await expect(mod.getSnapshot(stored.id, { countyId: "7" }, "t")).rejects.toMatchObject({ status: 404 });
  });
  it("does not expose other QuestionnaireResponses through this route", async () => {
    stub({ ...stored, questionnaire: "http://nphiis.health.go.ke/Questionnaire/vhf-case" });
    await expect(mod.getSnapshot("x", null, "t")).rejects.toMatchObject({ status: 404 });
  });
});

describe("reportingStatus", () => {
  it("lists the sub-counties that have not reported", async () => {
    const snapshot = (sub: string, name: string, at: string) =>
      buildQuestionnaireResponse(
        { ...input(), county: { id: "34", name: "KAJIADO" }, subCounty: { id: sub, name } },
        { now: new Date(at) },
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/Location?")) {
          return json({
            entry: [
              { resource: LOCATIONS["KAJIADO-EAST"] && { ...LOCATIONS["KAJIADO-EAST"], partOf: { reference: "Location/34", display: "KAJIADO" } } },
              { resource: { ...LOCATIONS["KAJIADO-NORTH"], partOf: { reference: "Location/34", display: "KAJIADO" } } },
            ],
          });
        }
        return json({ entry: [{ resource: snapshot("KAJIADO-EAST", "KAJIADO EAST", "2026-11-24T05:00:00Z") }] });
      }),
    );
    const s = await mod.reportingStatus("t", { countyId: "34" }, "2026-11-24");
    expect(s).toMatchObject({ expected: 2, submitted: 1, onTime: 1 });
    expect(s.missing).toEqual([{ id: "KAJIADO-NORTH", name: "KAJIADO NORTH", county: "KAJIADO" }]);
  });
});

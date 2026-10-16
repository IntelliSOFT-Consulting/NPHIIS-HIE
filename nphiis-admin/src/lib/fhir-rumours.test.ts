import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.FHIR_BASE_URL = "http://hapi.internal:8080/fhir";
let mod: typeof import("./fhir-rumours");
beforeAll(async () => {
  mod = await import("./fhir-rumours");
});

const RUMOUR = "social-listening-and-rumor-tracking-tool";
const patient = (id: string, city = "MOMBASA", state = "MVITA") => ({
  resourceType: "Patient",
  id,
  identifier: [{ system: RUMOUR, value: `enc-${id}` }],
  address: [{ city, state }],
});
const obs = (subject: string, code: string, value: string, lastUpdated = "2026-10-01T00:00:00Z") => ({
  resourceType: "Observation",
  subject: { reference: `Patient/${subject}` },
  code: { coding: [{ code }] },
  valueString: value,
  meta: { lastUpdated },
});
const bundle = (resources: any[], total?: number) => ({
  resourceType: "Bundle",
  ...(total != null ? { total } : {}),
  entry: resources.map((resource) => ({ resource })),
});

/** Fake HAPI: answers by request, records every request made. */
function fakeHapi(handler: (url: URL, form?: URLSearchParams) => any) {
  const calls: Array<{ url: URL; form?: URLSearchParams }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const form = init?.method === "POST" ? new URLSearchParams(String(init.body)) : undefined;
      calls.push({ url, form });
      return new Response(JSON.stringify(handler(url, form)), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("listRumours", () => {
  it("asks HAPI for one page and fetches answers only for that page", async () => {
    const calls = fakeHapi((url) =>
      url.pathname.endsWith("/Patient/_search")
        ? bundle([patient("p1"), patient("p2")], 3403)
        : bundle([obs("p1", "EPID", "KEN-MSA-1"), obs("p2", "560083852118", "Water is poisoned")]),
    );
    const page = await mod.listRumours("t", null, { page: 3, pageSize: 10 });

    expect(page).toMatchObject({ total: 3403, page: 3, pageSize: 10 });
    expect(page.rumours.map((r) => [r.patientId, r.epid, r.rumour])).toEqual([
      ["p1", "KEN-MSA-1", undefined],
      ["p2", undefined, "Water is poisoned"],
    ]);
    const search = calls[0].form!;
    expect(Object.fromEntries(search)).toMatchObject({
      identifier: `${RUMOUR}|`,
      _sort: "-_lastUpdated",
      _count: "10",
      _offset: "20",
      _total: "accurate",
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].url.searchParams.get("subject")).toBe("Patient/p1,Patient/p2");
  });

  it("limits the page to reports whose current priority matches the search and filter", async () => {
    const calls = fakeHapi((url) => {
      if (url.pathname.endsWith("/Patient/_search")) return bundle([patient("p1")], 1);
      if (url.searchParams.get("value-string:contains"))
        return bundle([obs("p1", "EPID", "x"), obs("p2", "EPID", "x"), obs("p3", "EPID", "x")]);
      if (url.searchParams.get("code") === "rumour-priority")
        return bundle([
          obs("p1", "rumour-priority", "High"),
          obs("p2", "rumour-priority", "High", "2026-10-01T00:00:00Z"),
          obs("p2", "rumour-priority", "Low", "2026-10-02T00:00:00Z"),
          obs("p4", "rumour-priority", "High"),
        ]);
      return bundle([]);
    });
    await mod.listRumours("t", null, { page: 1, pageSize: 10, search: "church", priority: "High" });

    // p2 is now Low and p4 doesn't match the search.
    const search = calls.find((c) => c.form)!.form!;
    expect(search.get("_id")).toBe("p1");
  });

  it("excludes every prioritised report for 'not prioritised'", async () => {
    const calls = fakeHapi((url) => {
      if (url.pathname.endsWith("/Patient/_search")) return bundle([], 0);
      return bundle([obs("p1", "rumour-priority", "High"), obs("p2", "rumour-priority", "Low")]);
    });
    await mod.listRumours("t", null, { page: 1, pageSize: 10, priority: "unset" });
    expect(calls.find((c) => c.form)!.form!.get("_id:not")).toBe("p1,p2");
  });

  it("returns nothing without asking for Patients when the search matches no report", async () => {
    const calls = fakeHapi(() => bundle([]));
    const page = await mod.listRumours("t", null, { page: 1, pageSize: 10, search: "zzz" });
    expect(page).toMatchObject({ rumours: [], total: 0 });
    expect(calls.some((c) => c.form)).toBe(false);
  });

  it("filters by the user's area and drops prefix near-misses", async () => {
    const calls = fakeHapi((url) =>
      url.pathname.endsWith("/Patient/_search")
        ? bundle([patient("p1", "KISUMU", "KISUMU EAST"), patient("p2", "KISUMU", "KISUMU WEST")], 2)
        : bundle([]),
    );
    const page = await mod.listRumours("t", { subCounty: "Kisumu East" }, { page: 1, pageSize: 10 });
    expect(calls[0].form!.get("address-state")).toBe("Kisumu East");
    expect(page.rumours.map((r) => r.patientId)).toEqual(["p1"]);
  });
});

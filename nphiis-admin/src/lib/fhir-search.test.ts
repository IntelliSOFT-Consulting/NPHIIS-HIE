import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.FHIR_BASE_URL = "http://hapi.internal:8080/fhir";
let searchAll: typeof import("./fhir-search").searchAll;
let FhirSearchTooLargeError: typeof import("./fhir-search").FhirSearchTooLargeError;
beforeAll(async () => {
  ({ searchAll, FhirSearchTooLargeError } = await import("./fhir-search"));
});
afterEach(() => vi.unstubAllGlobals());

describe("searchAll", () => {
  it("follows next links on the configured base URL, not HAPI's public one", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requested.push(url);
      const page = requested.length;
      return new Response(JSON.stringify({
        entry: [{ resource: { id: `r${page}` } }, { resource: { id: "inc" }, search: { mode: "include" } }],
        link: page < 2 ? [{ relation: "next", url: "https://public.example/fhir?_getpages=abc&_getpagesoffset=1" }] : [],
      }));
    }));
    const results = await searchAll<{ id: string }>("http://hapi.internal:8080/fhir/Patient", "t");
    expect(results.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(requested[1]).toBe("http://hapi.internal:8080/fhir?_getpages=abc&_getpagesoffset=1");
  });

  it("fails instead of returning a partial list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      entry: [{ resource: { id: "x" } }],
      link: [{ relation: "next", url: "https://public.example/fhir?_getpages=abc" }],
    }))));
    await expect(searchAll("http://hapi.internal:8080/fhir/Patient", "t"))
      .rejects.toBeInstanceOf(FhirSearchTooLargeError);
  });
});

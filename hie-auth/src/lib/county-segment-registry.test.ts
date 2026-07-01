import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildCountySegmentRegistry,
  fetchAllCountyNames,
  getCountySegmentRegistry,
  resetCountySegmentRegistryCacheForTests,
  resolveCountyLocationSegment,
} from "./county-segment-registry";
import { buildEpidFormattedId, locationSegment } from "./epid-location-segment";
import { COUNTY_CODE, LOCATION_TYPE_SYSTEM } from "./epid-location";

function mkCountyBundle(names: string[]) {
  return {
    resourceType: "Bundle",
    entry: names.map((name, i) => ({
      resource: {
        resourceType: "Location",
        id: String(i),
        name,
        type: [
          {
            coding: [{ system: LOCATION_TYPE_SYSTEM, code: COUNTY_CODE }],
          },
        ],
      },
    })),
  };
}

/** Fixture counties for collision tests — test-only, not used in production code. */
function collisionFixtureNames(): string[] {
  return [
    "KISUMU",
    "KISII",
    "NYANDARUA",
    "NYAMIRA",
    "NAIROBI",
    "TANA RIVER",
    "MOMBASA",
  ];
}

describe("buildCountySegmentRegistry", () => {
  it("produces no duplicate segments across fixture counties", () => {
    const registry = buildCountySegmentRegistry(collisionFixtureNames());
    const segments = [...registry.values()];
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("extends colliding counties to 4 characters", () => {
    const registry = buildCountySegmentRegistry(collisionFixtureNames());
    expect(registry.get("KISUMU")).toBe("KISU");
    expect(registry.get("KISII")).toBe("KISI");
    expect(registry.get("NYANDARUA")).toBe("NYAN");
    expect(registry.get("NYAMIRA")).toBe("NYAM");
  });

  it("keeps non-colliding counties at 3 characters", () => {
    const registry = buildCountySegmentRegistry(collisionFixtureNames());
    expect(registry.get("NAIROBI")).toBe("NAI");
    expect(registry.get("TANA RIVER")).toBe("TAR");
    expect(registry.get("MOMBASA")).toBe("MOM");
  });
});

describe("fetchAllCountyNames", () => {
  it("paginates COUNTY Location search results", async () => {
    let call = 0;
    const fhirApi = vi.fn(async ({ url }: { url: string }) => {
      call++;
      if (url.includes("_offset=0")) {
        return {
          data: mkCountyBundle(Array.from({ length: 100 }, (_, i) => `COUNTY-${i}`)),
        };
      }
      if (url.includes("_offset=100")) {
        return { data: mkCountyBundle(["GAMMA"]) };
      }
      return { data: { entry: [] } };
    });

    const names = await fetchAllCountyNames(fhirApi);
    expect(names).toHaveLength(101);
    expect(names[100]).toBe("GAMMA");
    expect(call).toBe(2);
    expect(fhirApi.mock.calls[0][0].url).toContain(
      encodeURIComponent(`${LOCATION_TYPE_SYSTEM}|${COUNTY_CODE}`),
    );
  });
});

describe("getCountySegmentRegistry cache", () => {
  beforeEach(() => {
    resetCountySegmentRegistryCacheForTests();
  });

  it("loads registry once and reuses cache", async () => {
    const fhirApi = vi.fn(async () => ({ data: mkCountyBundle(collisionFixtureNames()) }));

    const first = await getCountySegmentRegistry(fhirApi);
    const second = await getCountySegmentRegistry(fhirApi);

    expect(first.get("KISUMU")).toBe("KISU");
    expect(second.get("KISUMU")).toBe("KISU");
    expect(fhirApi).toHaveBeenCalledTimes(1);
  });
});

describe("resolveCountyLocationSegment", () => {
  beforeEach(() => {
    resetCountySegmentRegistryCacheForTests();
  });

  it("resolves disambiguated segment from FHIR counties", async () => {
    const fhirApi = vi.fn(async () => ({ data: mkCountyBundle(collisionFixtureNames()) }));
    const segment = await resolveCountyLocationSegment(fhirApi, "KISUMU");
    expect(segment).toBe("KISU");
  });

  it("falls back to 3-char rule when county is absent from FHIR", async () => {
    const fhirApi = vi.fn(async () => ({ data: mkCountyBundle(["NAIROBI"]) }));
    const segment = await resolveCountyLocationSegment(fhirApi, "UNKNOWN");
    expect(segment).toBe(locationSegment("UNKNOWN"));
  });

  it("buildEpidFormattedId uses resolved county segment", async () => {
    const fhirApi = vi.fn(async () => ({ data: mkCountyBundle(collisionFixtureNames()) }));
    const countySegment = await resolveCountyLocationSegment(fhirApi, "KISUMU");
    const epid = buildEpidFormattedId(
      "KENYA",
      countySegment,
      "KISUMU CENTRAL",
      2024,
      "AFP",
      1,
    );
    expect(epid).toBe("KEN-KISU-KIC-2024-AFP-001");
  });
});

import { describe, expect, it } from "vitest";
import {
  resolveLocationHierarchy,
  resolveSubCountyLocationByName,
} from "./epid-location";

function mkLocation(id: string, name: string, typeCode: string, partOf?: string) {
  return {
    resourceType: "Location",
    id,
    name,
    type: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-RoleCode",
            code: typeCode,
          },
        ],
      },
    ],
    ...(partOf ? { partOf: { reference: `Location/${partOf}` } } : {}),
  };
}

describe("resolveSubCountyLocationByName", () => {
  it("picks SUB-COUNTY via type-filtered query for VIHIGA", async () => {
    const fhirApi = async ({ url }: { url: string }) => {
      if (url.includes("type=")) {
        return {
          data: {
            entry: [{ resource: mkLocation("VIHIGA", "VIHIGA", "SUB-COUNTY", "38") }],
          },
        };
      }
      return { data: { entry: [{ resource: mkLocation("38", "VIHIGA", "COUNTY", "0") }] } };
    };

    const subCounty = await resolveSubCountyLocationByName(fhirApi, "VIHIGA");
    expect(subCounty?.id).toBe("VIHIGA");
    expect(subCounty?.type?.[0]?.coding?.[0]?.code).toBe("SUB-COUNTY");
  });

  it("falls back to by-name list when typed search is empty", async () => {
    const fhirApi = async ({ url }: { url: string }) => {
      if (url.includes("type=")) return { data: { entry: [] } };
      return {
        data: {
          entry: [
            { resource: mkLocation("38", "GARISSA", "COUNTY", "0") },
            { resource: mkLocation("GARISSA", "GARISSA", "SUB-COUNTY", "38") },
          ],
        },
      };
    };

    const subCounty = await resolveSubCountyLocationByName(fhirApi, "GARISSA");
    expect(subCounty?.id).toBe("GARISSA");
  });

  it("returns undefined when location cannot be resolved", async () => {
    const fhirApi = async () => ({ data: { entry: [] } });
    const subCounty = await resolveSubCountyLocationByName(fhirApi, "UNKNOWN");
    expect(subCounty).toBeUndefined();
  });
});

describe("resolveLocationHierarchy", () => {
  it("resolves sub-county -> county -> country names", async () => {
    const fhirApi = async ({ url }: { url: string }) => {
      if (url.includes("type=")) {
        return {
          data: {
            entry: [{ resource: mkLocation("VIHIGA", "VIHIGA", "SUB-COUNTY", "38") }],
          },
        };
      }
      if (url === "/Location/38") return { data: mkLocation("38", "VIHIGA", "COUNTY", "0") };
      if (url === "/Location/0") return { data: mkLocation("0", "KENYA", "COUNTRY") };
      return { data: { entry: [] } };
    };

    const hierarchy = await resolveLocationHierarchy(fhirApi, "VIHIGA");
    expect(hierarchy.subCounty?.id).toBe("VIHIGA");
    expect(hierarchy.county?.id).toBe("38");
    expect(hierarchy.country?.id).toBe("0");
  });

  it("throws a clear error when sub-county is missing", async () => {
    const fhirApi = async () => ({ data: { entry: [] } });
    await expect(resolveLocationHierarchy(fhirApi, "MISSING")).rejects.toThrow(
      "Ambiguous or missing SUB-COUNTY Location for name MISSING",
    );
  });
});

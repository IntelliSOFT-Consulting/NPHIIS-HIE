import { describe, expect, it } from "vitest";
import { buildDatasetRlsClauses, buildRlsClauses } from "./superset-rls";
import type { LocationInfo } from "@/types/user";

const loc = (over: Partial<LocationInfo> = {}): LocationInfo => ({
  facility: "17824", facilityName: "Kibra HC", ward: "", wardName: "",
  subCounty: "EMBAKASI-WEST", subCountyName: "Embakasi  West",
  county: "47", countyName: "Nairobi", country: "0", countryName: "Kenya",
  ...over,
});
const CODES = { id: 96, columns: ["county_code", "sub_county_code", "facility_id", "report_type", "x"] };
const NAMES = { id: 128, columns: ["county_rls", "subcounty_rls", "EPID"] };
const NONE = { id: 130, columns: ["node_id", "parent_id"] };

describe("buildDatasetRlsClauses", () => {
  it("keeps the code clauses on datasets that have the code columns", () => {
    const roles = ["COUNTY_DISEASE_SURVEILLANCE_OFFICER"];
    expect(buildDatasetRlsClauses(roles, loc(), [CODES])).toEqual([{ dataset: 96, clause: "county_code = '47'" }]);
    expect(buildDatasetRlsClauses(roles, loc(), null)).toEqual(buildRlsClauses(roles, loc()));
  });

  it("filters name-only datasets by normalised county and sub-county names", () => {
    expect(buildDatasetRlsClauses(["COUNTY_DISEASE_SURVEILLANCE_OFFICER"], loc(), [NAMES])).toEqual([
      { dataset: 128, clause: "county_rls = 'NAIROBI'" },
    ]);
    expect(buildDatasetRlsClauses(["SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER"], loc(), [NAMES])).toEqual([
      { dataset: 128, clause: "county_rls = 'NAIROBI' AND subcounty_rls = 'EMBAKASI WEST'" },
    ]);
  });

  it("hides datasets it cannot filter from area-limited users", () => {
    expect(buildDatasetRlsClauses(["SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER"], loc(), [NONE])).toEqual([
      { dataset: 130, clause: "1 = 0" },
    ]);
    expect(buildDatasetRlsClauses(["FACILITY_SURVEILLANCE_FOCAL_PERSON"], loc(), [NAMES])).toEqual([
      { dataset: 128, clause: "1 = 0" },
    ]);
  });

  it("leaves national users unfiltered and escapes names", () => {
    expect(buildDatasetRlsClauses(["NATIONAL_FOCAL_PERSON"], loc(), [NAMES, NONE])).toEqual([]);
    expect(buildDatasetRlsClauses(["COUNTY_DISEASE_SURVEILLANCE_OFFICER"], loc({ countyName: "Murang'a" }), [NAMES])).toEqual([
      { dataset: 128, clause: "county_rls = 'MURANG''A'" },
    ]);
  });
});

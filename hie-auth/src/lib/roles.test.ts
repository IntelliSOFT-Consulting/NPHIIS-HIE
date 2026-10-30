import { describe, expect, it } from "vitest";
import { isLocationFreeRole } from "./roles";

describe("isLocationFreeRole", () => {
  it("lets administrators and call-centre agents register without a location", () => {
    expect(isLocationFreeRole("ADMINISTRATOR")).toBe(true);
    expect(isLocationFreeRole("NATIONAL_CALL_CENTER_AGENTS")).toBe(true);
    expect(isLocationFreeRole(" national_call_center_agents ")).toBe(true);
  });

  it("needs no location for any national role", () => {
    for (const role of ["SUPERUSER", "NATIONAL_FOCAL_PERSON", "NATIONAL_VIEWER", "NATIONAL_LAB"]) {
      expect(isLocationFreeRole(role)).toBe(true);
    }
  });

  it("still requires a location for county, sub-county and facility roles", () => {
    expect(isLocationFreeRole("COUNTY_DISEASE_SURVEILLANCE_OFFICER")).toBe(false);
    expect(isLocationFreeRole("SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER")).toBe(false);
    expect(isLocationFreeRole("FACILITY_SURVEILLANCE_FOCAL_PERSON")).toBe(false);
    expect(isLocationFreeRole("LAB_TECHNICIAN")).toBe(false);
    expect(isLocationFreeRole("")).toBe(false);
  });
});

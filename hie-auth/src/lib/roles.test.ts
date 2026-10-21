import { describe, expect, it } from "vitest";
import { isLocationFreeRole } from "./roles";

describe("isLocationFreeRole", () => {
  it("lets administrators and call-centre agents register without a location", () => {
    expect(isLocationFreeRole("ADMINISTRATOR")).toBe(true);
    expect(isLocationFreeRole("NATIONAL_CALL_CENTER_AGENTS")).toBe(true);
    expect(isLocationFreeRole(" national_call_center_agents ")).toBe(true);
  });

  it("still requires a location for every other role", () => {
    expect(isLocationFreeRole("COUNTY_DISEASE_SURVEILLANCE_OFFICER")).toBe(false);
    expect(isLocationFreeRole("NATIONAL_FOCAL_PERSON")).toBe(false);
    expect(isLocationFreeRole("")).toBe(false);
  });
});

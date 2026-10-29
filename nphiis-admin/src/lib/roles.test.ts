import { describe, expect, it } from "vitest";
import { canAccess, homePath, isCallCentreOnly, FEATURES, FEATURE_PERMISSION, canUseLabForm, isApplicationRole, withPermissions, type Feature } from "./roles";

describe("call-centre agents", () => {
  it("see the Call Centre module and nothing else", () => {
    const roles = ["NATIONAL_CALL_CENTER_AGENTS", "default-roles-nphiis", "offline_access"];
    expect(isCallCentreOnly(roles)).toBe(true);
    expect(homePath(roles)).toBe("/call-centre");
    expect(canAccess(roles, "CALL_CENTRE")).toBe(true);
    expect(canAccess(roles, "RUMOURS_TRIAGE")).toBe(false);
    expect(canAccess(roles, "VHF_REPORTS")).toBe(false);
    expect(canAccess(roles, "USERS_MANAGE")).toBe(false);
  });

  it("match the role in any letter case", () => {
    expect(isCallCentreOnly(["national_call_center_agents"])).toBe(true);
  });

  it("are not call-centre-only when they hold another role too", () => {
    const roles = ["NATIONAL_CALL_CENTER_AGENTS", "NATIONAL_FOCAL_PERSON"];
    expect(isCallCentreOnly(roles)).toBe(false);
    expect(homePath(roles)).toBe("/dashboard");
  });

  it("leave everyone else on the dashboard", () => {
    expect(isCallCentreOnly([])).toBe(false);
    expect(isCallCentreOnly(undefined)).toBe(false);
    expect(homePath(["COUNTY_DISEASE_SURVEILLANCE_OFFICER"])).toBe("/dashboard");
  });

  it("is open to administrators as well", () => {
    expect(canAccess(["ADMINISTRATOR"], "CALL_CENTRE")).toBe(true);
    expect(canAccess(["SUPERUSER"], "CALL_CENTRE")).toBe(true);
    expect(canAccess(["NATIONAL_VIEWER"], "CALL_CENTRE")).toBe(false);
  });
});

describe("permissions", () => {
  const county = ["COUNTY_DISEASE_SURVEILLANCE_OFFICER"];

  it("maps every feature to a permission", () => {
    for (const feature of Object.keys(FEATURES) as Feature[]) {
      expect(FEATURE_PERMISSION[feature]).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    }
    expect(new Set(Object.values(FEATURE_PERMISSION)).size).toBe(Object.keys(FEATURES).length);
  });

  it("decides features by role name until the user has permissions", () => {
    expect(canAccess(county, "RUMOURS_TRIAGE")).toBe(true);
    expect(canAccess(county, "USERS_MANAGE")).toBe(false);
    expect(withPermissions(county, undefined)).toEqual(county);
    // hie-auth does not know the role: no level, so no permission mode.
    expect(withPermissions(county, { level: null, permissions: [] })).toEqual(county);
  });

  it("decides features by permission once they are sent, whatever the role name", () => {
    const epiLogistician = withPermissions(county, { level: "COUNTY", permissions: ["reports.idsr.view"] });
    expect(canAccess(epiLogistician, "REPORTS_VIEW_IDSR")).toBe(true);
    // The role alone would have allowed this; the profile does not.
    expect(canAccess(epiLogistician, "RUMOURS_TRIAGE")).toBe(false);
    expect(canAccess(epiLogistician, "VHF_CONTACTS")).toBe(false);
  });

  it("treats a profile with no permissions as having no features", () => {
    const none = withPermissions(county, { level: "COUNTY", permissions: [] });
    for (const feature of Object.keys(FEATURES) as Feature[]) expect(canAccess(none, feature)).toBe(false);
  });

  it("lets a lab permission use any lab form and keeps the permission entries out of the role list", () => {
    const lab = withPermissions(["FACILITY_SURVEILLANCE_FOCAL_PERSON"], { level: "FACILITY", permissions: ["lab.enter_results"] });
    expect(canUseLabForm(lab, ["NATIONAL_LAB"])).toBe(true);
    expect(canUseLabForm(["FACILITY_SURVEILLANCE_FOCAL_PERSON"], ["NATIONAL_LAB"])).toBe(false);
    expect(lab.filter(isApplicationRole)).toEqual(["FACILITY_SURVEILLANCE_FOCAL_PERSON"]);
  });
});

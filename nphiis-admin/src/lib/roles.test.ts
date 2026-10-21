import { describe, expect, it } from "vitest";
import { canAccess, homePath, isCallCentreOnly } from "./roles";

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

import { describe, expect, it } from "vitest";
import {
    ALL_PERMISSIONS,
    BUILT_IN_PROFILES,
    COMPAT_ROLE_FOR_LEVEL,
    LEVELS,
    hasPermission,
    resolveAccess,
} from "./permissions";

describe("resolveAccess", () => {
    it("gives administrators every permission at national level", () => {
        const a = resolveAccess("ADMINISTRATOR");
        expect(a.level).toBe("NATIONAL");
        expect(a.permissions).toEqual(ALL_PERMISSIONS);
    });

    it("matches what the admin portal allows each role to do today", () => {
        expect(hasPermission("NATIONAL_CALL_CENTER_AGENTS", "callcentre.use")).toBe(true);
        expect(hasPermission("NATIONAL_CALL_CENTER_AGENTS", "screenings.view")).toBe(false);
        expect(hasPermission("NATIONAL_VIEWER", "screenings.view")).toBe(true);
        expect(hasPermission("NATIONAL_VIEWER", "vhf.contacts.manage")).toBe(false);
        expect(hasPermission("COUNTY_DISEASE_SURVEILLANCE_OFFICER", "vhf.contacts.manage")).toBe(true);
        expect(hasPermission("FACILITY_SURVEILLANCE_FOCAL_PERSON", "rumours.triage")).toBe(false);
        expect(hasPermission("LAB_TECHNICIAN", "lab.enter_results")).toBe(true);
        expect(hasPermission("LAB_TECHNICIAN", "lab.national_scope")).toBe(false);
        expect(hasPermission("NATIONAL_LAB", "lab.national_scope")).toBe(true);
        expect(hasPermission("VACCINATOR", "reports.idsr.view")).toBe(false);
    });

    it("is case-insensitive and returns nothing for an unknown role", () => {
        expect(resolveAccess(" county_disease_surveillance_officer ").level).toBe("COUNTY");
        expect(resolveAccess("SOMETHING_NEW")).toEqual({ level: null, profile: null, permissions: [] });
        expect(resolveAccess(null).level).toBeNull();
    });

    it("returns a copy so callers cannot change the built-in profile", () => {
        resolveAccess("NATIONAL_VIEWER").permissions.push("users.manage");
        expect(hasPermission("NATIONAL_VIEWER", "users.manage")).toBe(false);
    });
});

describe("profiles", () => {
    it("only use known levels and permissions", () => {
        for (const p of Object.values(BUILT_IN_PROFILES)) {
            expect(LEVELS).toContain(p.level);
            for (const perm of p.permissions) expect(ALL_PERMISSIONS).toContain(perm);
        }
    });

    it("map every level to an existing role of that level", () => {
        for (const level of LEVELS) expect(BUILT_IN_PROFILES[COMPAT_ROLE_FOR_LEVEL[level]].level).toBe(level);
    });
});

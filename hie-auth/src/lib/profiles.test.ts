import { describe, expect, it, vi } from "vitest";
vi.mock("./keycloak", () => ({ getKeycloakAdminToken: async () => ({ access_token: "t" }) }));
import { compatRole, fromKeycloakRole, parseMigrationTarget, runForEach, slugify, toKeycloakRole, validateProfileInput } from "./profiles";

describe("slugify", () => {
    it("makes an upper-case key from a display name", () => {
        expect(slugify("County Epi Logistician (CEPI)")).toBe("COUNTY_EPI_LOGISTICIAN_CEPI");
        expect(slugify("  Sub-County  Director ")).toBe("SUB_COUNTY_DIRECTOR");
        expect(slugify("!!!")).toBe("");
    });
});

describe("validateProfileInput", () => {
    const ok = { name: "County Director", level: "COUNTY", profile: "builtin:VIEWER" };
    it("accepts a role built on a built-in or a custom profile", () => {
        expect(validateProfileInput(ok).ok).toBe(true);
        expect(validateProfileInput({ ...ok, profile: "custom:EPI_LOGISTICIAN" }).ok).toBe(true);
    });
    it("rejects a bad level, a bad profile reference, an empty name and a built-in role name", () => {
        expect(validateProfileInput({ ...ok, level: "WARD" }).ok).toBe(false);
        expect(validateProfileInput({ ...ok, profile: "VIEWER" }).ok).toBe(false);
        expect(validateProfileInput({ ...ok, profile: undefined }).ok).toBe(false);
        expect(validateProfileInput({ ...ok, name: " " }).ok).toBe(false);
        expect(validateProfileInput({ ...ok, name: "administrator" }).ok).toBe(false);
    });
});

describe("keycloak role round trip", () => {
    const role = toKeycloakRole("COUNTY_DIRECTOR", { name: "County Director", level: "COUNTY", profile: "builtin:VIEWER" });
    it("stores name, level and the profile reference, and reads permissions from the profile", () => {
        expect(role.name).toBe("PROFILE_COUNTY_DIRECTOR");
        expect(fromKeycloakRole(role)).toEqual({
            slug: "COUNTY_DIRECTOR",
            name: "County Director",
            level: "COUNTY",
            profile: "builtin:VIEWER",
            permissions: ["reports.idsr.view", "specimens.view", "screenings.view"],
        });
    });
    it("follows a custom profile, and has no permissions when the profile is gone", () => {
        const onCustom = toKeycloakRole("CEPI", { name: "CEPI", level: "COUNTY", profile: "custom:EPI" });
        const custom = [{ slug: "EPI", name: "Epi", permissions: ["rumours.triage" as const] }];
        expect(fromKeycloakRole(onCustom, custom)?.permissions).toEqual(["rumours.triage"]);
        expect(fromKeycloakRole(onCustom, [])?.permissions).toEqual([]);
    });
    it("ignores other roles", () => {
        expect(fromKeycloakRole({ name: "ADMINISTRATOR" })).toBeNull();
        expect(fromKeycloakRole({ name: "PROFILE_X", attributes: { nphiis_level: ["WARD"] } })).toBeNull();
    });
});

describe("compatRole", () => {
    it("presents each level as an existing role", () => {
        expect(compatRole("COUNTY")).toBe("COUNTY_DISEASE_SURVEILLANCE_OFFICER");
        expect(compatRole("FACILITY")).toBe("FACILITY_SURVEILLANCE_FOCAL_PERSON");
    });
});

describe("runForEach", () => {
    it("applies to every item, reports progress and keeps going after a failure", async () => {
        const seen: number[] = [];
        const progress: Array<[number, number]> = [];
        const result = await runForEach(
            [1, 2, 3, 4, 5],
            async (n) => {
                if (n === 3) throw new Error("boom");
                seen.push(n);
            },
            (done, failed) => progress.push([done, failed]),
            2,
        );
        expect(seen.sort()).toEqual([1, 2, 4, 5]);
        expect(result).toEqual({ done: 4, failed: [3] });
        expect(progress[progress.length - 1]).toEqual([4, 1]);
    });

    it("handles an empty list", async () => {
        expect(await runForEach([], async () => {})).toEqual({ done: 0, failed: [] });
    });
});

describe("parseMigrationTarget", () => {
    it("reads a profile or a built-in role", () => {
        expect(parseMigrationTarget("profile:county_director")).toEqual({ kind: "profile", slug: "COUNTY_DIRECTOR" });
        expect(parseMigrationTarget("role:administrator")).toEqual({ kind: "role", role: "ADMINISTRATOR" });
    });
    it("rejects anything else", () => {
        for (const bad of [undefined, "", "COUNTY", "user:x", "profile:"]) expect(parseMigrationTarget(bad)).toBeNull();
    });
});

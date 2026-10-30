import { describe, expect, it, vi } from "vitest";
vi.mock("./keycloak", () => ({ getKeycloakAdminToken: async () => ({ access_token: "t" }) }));
import {
    fromKeycloakPermissionProfile,
    resolveProfileRef,
    toKeycloakPermissionProfile,
    validatePermissionProfileInput,
} from "./permission-profiles";
import { BUILT_IN_PERMISSION_PROFILES, BUILT_IN_PROFILES } from "./permissions";

describe("validatePermissionProfileInput", () => {
    const ok = { name: "Epi Logistician", permissions: ["reports.idsr.view", "reports.idsr.view", "rumours.triage"] };
    it("accepts a profile and de-duplicates permissions", () => {
        const r = validatePermissionProfileInput(ok);
        expect(r.ok && r.value.permissions).toEqual(["reports.idsr.view", "rumours.triage"]);
    });
    it("rejects unknown permissions, an empty name and built-in names", () => {
        expect(validatePermissionProfileInput({ ...ok, permissions: ["nope"] }).ok).toBe(false);
        expect(validatePermissionProfileInput({ ...ok, permissions: "x" }).ok).toBe(false);
        expect(validatePermissionProfileInput({ ...ok, name: "" }).ok).toBe(false);
        expect(validatePermissionProfileInput({ ...ok, name: "Focal Person" }).ok).toBe(false);
        expect(validatePermissionProfileInput({ ...ok, name: "administrator" }).ok).toBe(false);
    });
});

describe("keycloak round trip and references", () => {
    it("stores name and permissions and reads them back", () => {
        const role = toKeycloakPermissionProfile("EPI", { name: "Epi", permissions: ["rumours.triage", "screenings.view"] });
        expect(role.name).toBe("PERM_EPI");
        expect(fromKeycloakPermissionProfile(role)).toEqual({ slug: "EPI", name: "Epi", permissions: ["rumours.triage", "screenings.view"] });
        expect(fromKeycloakPermissionProfile({ name: "PROFILE_X" })).toBeNull();
    });
    it("resolves builtin: and custom: references", () => {
        const custom = [{ slug: "EPI", name: "Epi", permissions: ["rumours.triage" as const] }];
        expect(resolveProfileRef("builtin:VIEWER", custom)?.name).toBe("Viewer");
        expect(resolveProfileRef("custom:epi", custom)?.permissions).toEqual(["rumours.triage"]);
        expect(resolveProfileRef("custom:NOPE", custom)).toBeUndefined();
        expect(resolveProfileRef("builtin:NOPE", custom)).toBeUndefined();
        expect(resolveProfileRef("garbage", custom)).toBeUndefined();
    });
    it("every built-in role inherits a built-in profile", () => {
        for (const r of Object.values(BUILT_IN_PROFILES)) {
            expect(r.profile && BUILT_IN_PERMISSION_PROFILES[r.profile]).toBeTruthy();
            expect(r.permissions).toEqual(BUILT_IN_PERMISSION_PROFILES[r.profile!].permissions);
        }
    });
});

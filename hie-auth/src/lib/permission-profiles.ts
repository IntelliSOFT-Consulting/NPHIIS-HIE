import fetch from "cross-fetch";
import { getKeycloakAdminToken } from "./keycloak";
import { ALL_PERMISSIONS, BUILT_IN_PERMISSION_PROFILES, BUILT_IN_PROFILES, Permission, PermissionProfile } from "./permissions";
import { slugify } from "./profiles-util";

const KC_BASE_URL = String(process.env.KC_BASE_URL);
const KC_REALM = String(process.env.KC_REALM);

/**
 * Permission profiles created in the admin portal are Keycloak realm roles named
 * PERM_<SLUG>, with the display name and the permissions as role attributes. A role (see
 * profiles.ts) points at one by reference: "builtin:<KEY>" or "custom:<SLUG>".
 */
export const PERMISSION_PROFILE_PREFIX = "PERM_";

export interface StoredPermissionProfile extends PermissionProfile {
    slug: string;
}

export function validatePermissionProfileInput(
    body: { name?: unknown; permissions?: unknown },
): { ok: true; value: PermissionProfile } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = slugify(name);
    if (!name) errors.push("name is required");
    else if (!slug) errors.push("name must contain letters or digits");
    else if (Object.values(BUILT_IN_PERMISSION_PROFILES).some((p) => slugify(p.name) === slug) || slug in BUILT_IN_PROFILES) {
        errors.push(`"${name}" is a built-in name`);
    }
    const perms = body.permissions;
    if (!Array.isArray(perms)) errors.push("permissions must be an array");
    else {
        const unknown = perms.filter((p) => !(ALL_PERMISSIONS as string[]).includes(String(p)));
        if (unknown.length) errors.push(`unknown permissions: ${unknown.join(", ")}`);
    }
    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { name, permissions: Array.from(new Set(perms as Permission[])) } };
}

export function toKeycloakPermissionProfile(slug: string, p: PermissionProfile) {
    return {
        name: PERMISSION_PROFILE_PREFIX + slug,
        description: `NPHIIS permission profile: ${p.name}`,
        attributes: { nphiis_profile_name: [p.name], nphiis_permissions: [p.permissions.join(",")] },
    };
}

export function fromKeycloakPermissionProfile(role: any): StoredPermissionProfile | null {
    if (!String(role?.name ?? "").startsWith(PERMISSION_PROFILE_PREFIX)) return null;
    const a = role.attributes ?? {};
    const slug = role.name.slice(PERMISSION_PROFILE_PREFIX.length);
    return {
        slug,
        name: a.nphiis_profile_name?.[0] ?? slug,
        permissions: String(a.nphiis_permissions?.[0] ?? "")
            .split(",")
            .filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p)),
    };
}

/** "builtin:<KEY>" or "custom:<SLUG>" -> the permission profile it names, if it exists. */
export function resolveProfileRef(ref: string, custom: StoredPermissionProfile[]): PermissionProfile | undefined {
    const i = ref.indexOf(":");
    const [kind, key] = [ref.slice(0, i), ref.slice(i + 1).toUpperCase()];
    if (kind === "builtin") return BUILT_IN_PERMISSION_PROFILES[key];
    if (kind === "custom") return custom.find((p) => p.slug === key);
    return undefined;
}

async function kc(path: string, init: any = {}) {
    const token = (await getKeycloakAdminToken()).access_token;
    return fetch(`${KC_BASE_URL}/admin/realms/${KC_REALM}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
}

let cache: { at: number; list: StoredPermissionProfile[] } | null = null;
const TTL_MS = 30_000;
export const clearPermissionProfileCache = () => (cache = null);

export async function listPermissionProfiles(): Promise<StoredPermissionProfile[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
    const res = await kc(`/roles?search=${PERMISSION_PROFILE_PREFIX}&briefRepresentation=false&max=500`);
    if (!res.ok) throw new Error(`Keycloak roles lookup failed: ${res.status}`);
    const list = ((await res.json()) as any[])
        .map(fromKeycloakPermissionProfile)
        .filter((p): p is StoredPermissionProfile => !!p)
        .sort((a, b) => a.name.localeCompare(b.name));
    cache = { at: Date.now(), list };
    return list;
}

export async function getPermissionProfile(slug: string): Promise<StoredPermissionProfile | null> {
    return (await listPermissionProfiles()).find((p) => p.slug === slug.toUpperCase()) ?? null;
}

export async function savePermissionProfile(slug: string, p: PermissionProfile, create: boolean): Promise<void> {
    const body = JSON.stringify(toKeycloakPermissionProfile(slug, p));
    const res = create
        ? await kc("/roles", { method: "POST", body })
        : await kc(`/roles/${encodeURIComponent(PERMISSION_PROFILE_PREFIX + slug)}`, { method: "PUT", body });
    if (res.status === 409) throw new Error("A profile with this name already exists");
    if (!res.ok) throw new Error(`Keycloak profile save failed: ${res.status}`);
    clearPermissionProfileCache();
}

export async function deletePermissionProfile(slug: string): Promise<void> {
    const res = await kc(`/roles/${encodeURIComponent(PERMISSION_PROFILE_PREFIX + slug)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Keycloak profile delete failed: ${res.status}`);
    clearPermissionProfileCache();
}

import fetch from "cross-fetch";
import { getKeycloakAdminToken } from "./keycloak";
import { StoredPermissionProfile, listPermissionProfiles, resolveProfileRef } from "./permission-profiles";
import { slugify } from "./profiles-util";
import { ALL_PERMISSIONS, BUILT_IN_PROFILES, COMPAT_ROLE_FOR_LEVEL, LEVELS, Level, Permission } from "./permissions";

const KC_BASE_URL = String(process.env.KC_BASE_URL);
const KC_REALM = String(process.env.KC_REALM);

/**
 * Roles created in the admin portal (a permission profile at a level) are stored in Keycloak as
 * realm roles named PROFILE_<SLUG>; display name, level and the profile reference are attributes. A user carries the
 * slug in the `nphiis_profile` attribute. Their assigned role (what the gateway, Superset and
 * the mobile app read) stays the existing role for the profile's level, see compatRole().
 */
export const PROFILE_ROLE_PREFIX = "PROFILE_";
export const PROFILE_USER_ATTRIBUTE = "nphiis_profile";

/** A role created in the portal: a permission profile (by reference) at a level. */
export interface StoredProfile {
    slug: string;
    name: string;
    level: Level;
    /** "builtin:<KEY>" or "custom:<SLUG>": the permission profile the role inherits. */
    profile: string;
    /** The profile's permissions, resolved. */
    permissions: Permission[];
}

export { slugify };

/** What is saved for a role (permissions come from its profile). */
export interface RoleDefinition {
    name: string;
    level: Level;
    profile: string;
}

export interface ProfileInput {
    name?: unknown;
    level?: unknown;
    profile?: unknown;
}

const PROFILE_REF_RE = /^(builtin|custom):[A-Za-z0-9_]+$/;

export function validateProfileInput(
    body: ProfileInput,
): { ok: true; value: RoleDefinition } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.push("name is required");
    else if (!slugify(name)) errors.push("name must contain letters or digits");
    else if (slugify(name) in BUILT_IN_PROFILES) errors.push(`"${name}" is an existing built-in role name`);
    if (!(LEVELS as readonly string[]).includes(String(body.level))) errors.push(`level must be one of ${LEVELS.join(", ")}`);
    if (!PROFILE_REF_RE.test(String(body.profile ?? ""))) errors.push('profile is required ("builtin:<KEY>" or "custom:<SLUG>")');
    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { name, level: body.level as Level, profile: String(body.profile) } };
}

/** The existing role a role of this level is presented as to clients that only know role names. */
export function compatRole(level: Level): string {
    return COMPAT_ROLE_FOR_LEVEL[level];
}

export function toKeycloakRole(slug: string, r: RoleDefinition) {
    return {
        name: PROFILE_ROLE_PREFIX + slug,
        description: `NPHIIS role: ${r.name}`,
        attributes: {
            nphiis_profile_name: [r.name],
            nphiis_level: [r.level],
            nphiis_permission_profile: [r.profile],
        },
    };
}

/** The role a Keycloak realm role holds; permissions come from its profile (none if it is gone). */
export function fromKeycloakRole(role: any, custom: StoredPermissionProfile[] = []): StoredProfile | null {
    if (!String(role?.name ?? "").startsWith(PROFILE_ROLE_PREFIX)) return null;
    const a = role.attributes ?? {};
    const level = a.nphiis_level?.[0];
    if (!(LEVELS as readonly string[]).includes(level)) return null;
    const profile = String(a.nphiis_permission_profile?.[0] ?? "");
    return {
        slug: role.name.slice(PROFILE_ROLE_PREFIX.length),
        name: a.nphiis_profile_name?.[0] ?? role.name.slice(PROFILE_ROLE_PREFIX.length),
        level,
        profile,
        permissions: [...(resolveProfileRef(profile, custom)?.permissions ?? [])],
    };
}

async function kc(path: string, init: any = {}) {
    const token = (await getKeycloakAdminToken()).access_token;
    return fetch(`${KC_BASE_URL}/admin/realms/${KC_REALM}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
}

let cache: { at: number; profiles: StoredProfile[] } | null = null;
const TTL_MS = 30_000;
export const clearProfileCache = () => (cache = null);

export async function listProfiles(): Promise<StoredProfile[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.profiles;
    const [res, custom] = await Promise.all([
        kc(`/roles?search=${PROFILE_ROLE_PREFIX}&briefRepresentation=false&max=500`),
        listPermissionProfiles(),
    ]);
    if (!res.ok) throw new Error(`Keycloak roles lookup failed: ${res.status}`);
    const profiles = ((await res.json()) as any[])
        .map((r) => fromKeycloakRole(r, custom))
        .filter((p): p is StoredProfile => !!p)
        .sort((a, b) => a.name.localeCompare(b.name));
    cache = { at: Date.now(), profiles };
    return profiles;
}

export async function getProfile(slug: string): Promise<StoredProfile | null> {
    return (await listProfiles()).find((p) => p.slug === slug.toUpperCase()) ?? null;
}

export async function saveProfile(slug: string, p: RoleDefinition, create: boolean): Promise<void> {
    const body = JSON.stringify(toKeycloakRole(slug, p));
    const res = create
        ? await kc("/roles", { method: "POST", body })
        : await kc(`/roles/${encodeURIComponent(PROFILE_ROLE_PREFIX + slug)}`, { method: "PUT", body });
    if (res.status === 409) throw new Error("A profile with this name already exists");
    if (!res.ok) throw new Error(`Keycloak profile save failed: ${res.status}`);
    clearProfileCache();
}

/** Deleting the realm role also removes it from every user it was mapped to. */
export async function deleteProfile(slug: string): Promise<void> {
    const res = await kc(`/roles/${encodeURIComponent(PROFILE_ROLE_PREFIX + slug)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Keycloak profile delete failed: ${res.status}`);
    clearProfileCache();
}

/**
 * Keeps a user's Keycloak role mapping in step with their profile: removes PROFILE_<old> and
 * adds PROFILE_<new> (either may be empty), so Keycloak itself shows who holds each profile.
 */
export async function setUserProfileRole(userId: string, oldSlug: string | undefined, newSlug: string | undefined): Promise<void> {
    const roleRep = async (slug: string) => {
        const res = await kc(`/roles/${encodeURIComponent(PROFILE_ROLE_PREFIX + slug)}`);
        if (!res.ok) throw new Error(`Keycloak role PROFILE_${slug} not found: ${res.status}`);
        const r = await res.json();
        return { id: r.id, name: r.name };
    };
    if (oldSlug && oldSlug !== newSlug) {
        const res = await kc(`/users/${userId}/role-mappings/realm`, { method: "DELETE", body: JSON.stringify([await roleRep(oldSlug)]) });
        if (!res.ok && res.status !== 404) throw new Error(`Keycloak role unmapping failed: ${res.status}`);
    }
    if (newSlug && oldSlug !== newSlug) {
        const res = await kc(`/users/${userId}/role-mappings/realm`, { method: "POST", body: JSON.stringify([await roleRep(newSlug)]) });
        if (!res.ok) throw new Error(`Keycloak role mapping failed: ${res.status}`);
    }
}

/** Keycloak users whose profile attribute is this slug. */
export async function listProfileUsers(slug: string): Promise<Array<{ id: string; username: string }>> {
    const res = await kc(`/users?q=${PROFILE_USER_ATTRIBUTE}:${encodeURIComponent(slug)}&max=5000&briefRepresentation=true`);
    if (!res.ok) throw new Error(`Keycloak user lookup failed: ${res.status}`);
    return ((await res.json()) as any[]).map((u) => ({ id: u.id, username: u.username }));
}

/**
 * Runs `apply` for each item, a few at a time, and reports progress. A failure is recorded and
 * the rest still run, so one bad user does not strand the others.
 */
export async function runForEach<T>(
    items: T[],
    apply: (item: T) => Promise<void>,
    onProgress: (done: number, failed: number) => void = () => {},
    concurrency = 3,
): Promise<{ done: number; failed: T[] }> {
    const failed: T[] = [];
    let done = 0;
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const item = items[next++];
            try {
                await apply(item);
                done++;
            } catch {
                failed.push(item);
            }
            onProgress(done, failed.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return { done, failed };
}

export type MigrationTarget = { kind: "profile"; slug: string } | { kind: "role"; role: string };

/** Parses "profile:<SLUG>" or "role:<ROLE>". */
export function parseMigrationTarget(value: unknown): MigrationTarget | null {
    const m = /^(profile|role):(.+)$/.exec(String(value ?? "").trim());
    if (!m) return null;
    return m[1] === "profile" ? { kind: "profile", slug: m[2].toUpperCase() } : { kind: "role", role: m[2].toUpperCase() };
}
export async function countProfileUsers(slug: string): Promise<number> {
    const res = await kc(`/users?q=${PROFILE_USER_ATTRIBUTE}:${encodeURIComponent(slug)}&max=1000&briefRepresentation=true`);
    if (!res.ok) throw new Error(`Keycloak user lookup failed: ${res.status}`);
    return ((await res.json()) as any[]).length;
}

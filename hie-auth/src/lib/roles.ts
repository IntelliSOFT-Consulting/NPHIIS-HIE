/**
 * Application roles — loaded from `USER_ROLES` in hie-auth `.env`.
 * Synced to Keycloak on startup via checkUserRoles(); exposed via GET /provider/roles.
 */
export type Role = string;

/** Parse `USER_ROLES` (comma-separated, uppercased). */
export function getApplicationRoles(): Role[] {
  const raw = process.env.USER_ROLES;
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean);
}

export function isValidApplicationRole(role: string): boolean {
  const normalized = String(role).trim().toUpperCase();
  return getApplicationRoles().includes(normalized);
}

/** 719 call-centre agents: national, and the admin portal's Call Centre module only. */
export const CALL_CENTRE_ROLE: Role = "NATIONAL_CALL_CENTER_AGENTS";

/**
 * National roles work across the whole country, so they are registered without a location of
 * their own and get the root (country) location. Their scope never came from a county: the
 * portal, line lists and Superset treat them as country-wide.
 */
const LOCATION_FREE_ROLES = new Set<Role>([
  "ADMINISTRATOR",
  "SUPERUSER",
  "NATIONAL_FOCAL_PERSON",
  "NATIONAL_VIEWER",
  "NATIONAL_LAB",
  CALL_CENTRE_ROLE,
]);

export function isLocationFreeRole(role: string): boolean {
  return LOCATION_FREE_ROLES.has(String(role).trim().toUpperCase());
}

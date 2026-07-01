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

export const ROLES = {
  ADMINISTRATOR: "ADMINISTRATOR",
  SUPERUSER: "SUPERUSER",
  NATIONAL_FOCAL_PERSON: "NATIONAL_FOCAL_PERSON",
  NATIONAL_VIEWER: "NATIONAL_VIEWER",
  COUNTY_DISEASE_SURVEILLANCE_OFFICER: "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
  SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER:
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
  FACILITY_SURVEILLANCE_FOCAL_PERSON: "FACILITY_SURVEILLANCE_FOCAL_PERSON",
  LAB_TECHNICIAN: "LAB_TECHNICIAN",
  NATIONAL_LAB: "NATIONAL_LAB",
  VACCINATOR: "VACCINATOR",
  NURSE: "NURSE",
  SUPERVISORS: "SUPERVISORS",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ADMIN_ROLES: Role[] = [ROLES.ADMINISTRATOR, ROLES.SUPERUSER];

export const NATIONAL_ROLES: Role[] = [
  ROLES.ADMINISTRATOR,
  ROLES.SUPERUSER,
  ROLES.NATIONAL_FOCAL_PERSON,
  ROLES.NATIONAL_VIEWER,
  ROLES.NATIONAL_LAB,
];

export const LAB_ROLES: Role[] = [
  ROLES.LAB_TECHNICIAN,
  ROLES.NATIONAL_LAB,
  ROLES.ADMINISTRATOR,
  ROLES.SUPERUSER,
];

export const FEATURES = {
  USERS_MANAGE: [ROLES.ADMINISTRATOR, ROLES.SUPERUSER],
  LOCATIONS_MANAGE: [ROLES.ADMINISTRATOR, ROLES.SUPERUSER],
  // IDSR Case-Based Surveillance dashboard (covers MOH 503 + MOH 502
  // forms internally). Open to anyone with a surveillance role plus
  // admins/superusers; lab-only and vaccinator roles stay scoped to
  // their own data.
  REPORTS_VIEW_IDSR: [
    ROLES.ADMINISTRATOR,
    ROLES.SUPERUSER,
    ROLES.NATIONAL_FOCAL_PERSON,
    ROLES.NATIONAL_VIEWER,
    ROLES.COUNTY_DISEASE_SURVEILLANCE_OFFICER,
    ROLES.SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER,
    ROLES.FACILITY_SURVEILLANCE_FOCAL_PERSON,
  ],
  LAB_ACCESS: LAB_ROLES,
  LAB_NATIONAL_SCOPE: [
    ROLES.NATIONAL_LAB,
    ROLES.ADMINISTRATOR,
    ROLES.SUPERUSER,
  ],
  SUBSCRIPTION_LOGS_VIEW: [ROLES.ADMINISTRATOR, ROLES.SUPERUSER],
} as const;

export type Feature = keyof typeof FEATURES;

/**
 * Case-insensitive role membership check. Some identity sources store roles
 * lowercase, others uppercase — normalising here means role constants stay
 * canonical (UPPER_SNAKE) without breaking on casing drift.
 */
export function hasAnyRole(
  userRoles: string[] | undefined,
  allowed: readonly string[],
): boolean {
  if (!userRoles?.length) return false;
  const allowedLower = allowed.map((r) => r.toLowerCase());
  return userRoles.some((r) => allowedLower.includes(r.toLowerCase()));
}

export function canAccess(
  userRoles: string[] | undefined,
  feature: Feature,
): boolean {
  return hasAnyRole(userRoles, FEATURES[feature]);
}

// Keycloak's realm_access.roles includes built-ins (default-roles-<realm>,
// offline_access, uma_authorization, account-related roles). These are
// plumbing, not NPHIIS roles - filter them out of anything user-facing.
const KEYCLOAK_NOISE = new Set([
  "offline_access",
  "uma_authorization",
  "admin",
  "create-realm",
  "view-profile",
  "manage-account",
  "manage-account-links",
]);

export function isApplicationRole(role: string): boolean {
  if (!role) return false;
  if (KEYCLOAK_NOISE.has(role)) return false;
  if (role.startsWith("default-roles-")) return false;
  return true;
}

// "COUNTY_DISEASE_SURVEILLANCE_OFFICER" → "County Disease Surveillance Officer"
export function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

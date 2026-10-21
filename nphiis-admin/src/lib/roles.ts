/**
 * UI feature gating and helpers. The canonical role list lives in hie-auth
 * (`USER_ROLES` in hie-auth `.env`, via GET /provider/roles).
 */
export type Role = string;

/** Admin level prefix used when scoping Mpox CSV job titles to a location. */
export const LOCATION_ROLE_PREFIX = {
  county: "COUNTY",
  subcounty: "SUBCOUNTY",
  ward: "WARD",
  facility: "FACILITY",
} as const;

export type LocationLevel = keyof typeof LOCATION_ROLE_PREFIX;

export type MpoxJobRole =
  | "HEALTH_RECORDS_INFORMATION_OFFICER"
  | "HEALTH_PROMOTION_OFFICER"
  | "VACCINATOR";

/** Build e.g. SUBCOUNTY_HEALTH_RECORDS_INFORMATION_OFFICER from job + location level. */
export function scopeMpoxRole(
  jobRole: MpoxJobRole,
  locationType: LocationLevel,
): string {
  return `${LOCATION_ROLE_PREFIX[locationType]}_${jobRole}`;
}

export const ADMIN_ROLES: Role[] = ["ADMINISTRATOR", "SUPERUSER"];

/** 719 call-centre agents: the Call Centre module and nothing else. */
export const CALL_CENTRE_ROLE: Role = "NATIONAL_CALL_CENTER_AGENTS";

/** Roles with no location of their own: they work across the whole country. */
export const LOCATION_FREE_ROLES: Role[] = ["ADMINISTRATOR", "SUPERUSER", CALL_CENTRE_ROLE];

export const NATIONAL_ROLES: Role[] = [
  "ADMINISTRATOR",
  "SUPERUSER",
  "NATIONAL_FOCAL_PERSON",
  "NATIONAL_VIEWER",
  "NATIONAL_LAB",
  CALL_CENTRE_ROLE,
];

export const LAB_ROLES: Role[] = [
  "LAB_TECHNICIAN",
  "NATIONAL_LAB",
  "ADMINISTRATOR",
  "SUPERUSER",
];

export const FEATURES = {
  USERS_MANAGE: ["ADMINISTRATOR", "SUPERUSER"],
  LOCATIONS_MANAGE: ["ADMINISTRATOR", "SUPERUSER"],
  // IDSR Case-Based Surveillance dashboard (covers MOH 503 + MOH 502
  // forms internally). Open to anyone with a surveillance role plus
  // admins/superusers; lab-only and vaccinator roles stay scoped to
  // their own data.
  REPORTS_VIEW_IDSR: [
    "ADMINISTRATOR",
    "SUPERUSER",
    "NATIONAL_FOCAL_PERSON",
    "NATIONAL_VIEWER",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
    "FACILITY_SURVEILLANCE_FOCAL_PERSON",
  ],
  // Setting High/Medium/Low priority on mobile rumour reports. County and
  // sub-county officers only see reports from their own area.
  RUMOURS_TRIAGE: [
    "ADMINISTRATOR",
    "SUPERUSER",
    "NATIONAL_FOCAL_PERSON",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
  ],
  // Embedded VHF / Ebola dashboards. National viewers are limited to MOH 505 reports.
  VHF_REPORTS: [
    "ADMINISTRATOR",
    "SUPERUSER",
    "NATIONAL_FOCAL_PERSON",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
    "FACILITY_SURVEILLANCE_FOCAL_PERSON",
  ],
  // VHF contact tracing: contact lists, daily follow up, line-list upload.
  // County and sub-county officers only see contacts living in their area.
  VHF_CONTACTS: [
    "ADMINISTRATOR",
    "SUPERUSER",
    "NATIONAL_FOCAL_PERSON",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
  ],
  LAB_ACCESS: LAB_ROLES,
  // Specimens hie-auth submitted to NPHL, with their status and results.
  // Not location-scoped, so only lab and national roles see it.
  SPECIMENS_VIEW: [...LAB_ROLES, "NATIONAL_FOCAL_PERSON", "NATIONAL_VIEWER"],
  // Screened travellers and their follow-up. Not location-scoped either.
  SCREENINGS_VIEW: ["ADMINISTRATOR", "SUPERUSER", "NATIONAL_FOCAL_PERSON", "NATIONAL_VIEWER"],
  // 719 call log (alert / rumour log): capture, edit, delete and view calls
  // from the whole country.
  CALL_CENTRE: ["ADMINISTRATOR", "SUPERUSER", CALL_CENTRE_ROLE],
  LAB_NATIONAL_SCOPE: ["NATIONAL_LAB", "ADMINISTRATOR", "SUPERUSER"],
  SUBSCRIPTION_LOGS_VIEW: ["ADMINISTRATOR", "SUPERUSER"],
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

/** True when the user's only role is call-centre agent: they see the Call Centre module alone. */
export function isCallCentreOnly(userRoles: string[] | undefined): boolean {
  const roles = (userRoles ?? []).filter(isApplicationRole);
  return (
    roles.length > 0 &&
    roles.every((r) => r.toUpperCase() === CALL_CENTRE_ROLE)
  );
}

/** Where a user lands after signing in. */
export function homePath(userRoles: string[] | undefined): string {
  return isCallCentreOnly(userRoles) ? "/call-centre" : "/dashboard";
}

// "COUNTY_DISEASE_SURVEILLANCE_OFFICER" → "County Disease Surveillance Officer"
export function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

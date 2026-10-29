/**
 * Access model: a user has one level (how much of the country they see, together with their
 * assigned location) and a profile (a named set of permissions). The built-in profiles below
 * reproduce what each existing role could already do; profiles created in the admin portal
 * will use the same shape.
 */
export const LEVELS = ["NATIONAL", "COUNTY", "SUB_COUNTY", "FACILITY"] as const;
export type Level = (typeof LEVELS)[number];

/** What a permission lets a user do. The admin portal and hie-auth check these by key. */
export const PERMISSIONS = {
    "users.manage": "Create and manage users",
    "locations.manage": "Manage locations",
    "reports.idsr.view": "View IDSR case-based surveillance reports",
    "reports.vhf.view": "View VHF / Ebola dashboards",
    "rumours.triage": "Set priority on rumour reports",
    "vhf.contacts.manage": "Manage VHF contact tracing",
    "lab.enter_results": "Enter lab results",
    "lab.national_scope": "See lab work from every location",
    "specimens.view": "View specimens submitted to NPHL",
    "screenings.view": "View screened travellers (entry and exit)",
    "callcentre.use": "Use the 719 Call Centre (alert log)",
    "subscriptions.logs.view": "View subscription logs",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export interface Profile {
    /** Display name. */
    name: string;
    level: Level;
    permissions: Permission[];
}

const SURVEILLANCE_OFFICER: Permission[] = [
    "reports.idsr.view",
    "reports.vhf.view",
    "rumours.triage",
    "vhf.contacts.manage",
];

/** Existing Keycloak roles as profiles, keyed by role name. */
export const BUILT_IN_PROFILES: Record<string, Profile> = {
    ADMINISTRATOR: { name: "Administrator", level: "NATIONAL", permissions: ALL_PERMISSIONS },
    SUPERUSER: { name: "Superuser", level: "NATIONAL", permissions: ALL_PERMISSIONS },
    NATIONAL_FOCAL_PERSON: {
        name: "National Focal Person",
        level: "NATIONAL",
        permissions: [...SURVEILLANCE_OFFICER, "specimens.view", "screenings.view"],
    },
    NATIONAL_VIEWER: {
        name: "National Viewer",
        level: "NATIONAL",
        permissions: ["reports.idsr.view", "specimens.view", "screenings.view"],
    },
    NATIONAL_LAB: {
        name: "National Lab",
        level: "NATIONAL",
        permissions: ["lab.enter_results", "lab.national_scope", "specimens.view"],
    },
    NATIONAL_CALL_CENTER_AGENTS: { name: "Call Centre Agent", level: "NATIONAL", permissions: ["callcentre.use"] },
    COUNTY_DISEASE_SURVEILLANCE_OFFICER: {
        name: "County Disease Surveillance Officer",
        level: "COUNTY",
        permissions: SURVEILLANCE_OFFICER,
    },
    SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER: {
        name: "Sub-County Disease Surveillance Officer",
        level: "SUB_COUNTY",
        permissions: SURVEILLANCE_OFFICER,
    },
    FACILITY_SURVEILLANCE_FOCAL_PERSON: {
        name: "Facility Surveillance Focal Person",
        level: "FACILITY",
        permissions: ["reports.idsr.view", "reports.vhf.view"],
    },
    LAB_TECHNICIAN: {
        name: "Lab Technician",
        level: "FACILITY",
        permissions: ["lab.enter_results", "specimens.view"],
    },
    SUPERVISORS: { name: "Supervisor", level: "FACILITY", permissions: [] },
    VACCINATOR: { name: "Vaccinator", level: "FACILITY", permissions: [] },
};

/**
 * The existing role closest to a level. Clients that only know the old role names (the mobile
 * app) are sent this as `practitionerRole` for a profile they do not recognise.
 */
export const COMPAT_ROLE_FOR_LEVEL: Record<Level, string> = {
    NATIONAL: "NATIONAL_FOCAL_PERSON",
    COUNTY: "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
    SUB_COUNTY: "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
    FACILITY: "FACILITY_SURVEILLANCE_FOCAL_PERSON",
};

export interface ResolvedAccess {
    level: Level | null;
    profile: string | null;
    permissions: Permission[];
}

/** The level, profile and permissions of a user's assigned role; empty for a role this model does not know. */
export function resolveAccess(role: string | null | undefined): ResolvedAccess {
    const profile = BUILT_IN_PROFILES[String(role ?? "").trim().toUpperCase()];
    return profile
        ? { level: profile.level, profile: profile.name, permissions: [...profile.permissions] }
        : { level: null, profile: null, permissions: [] };
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
    return resolveAccess(role).permissions.includes(permission);
}

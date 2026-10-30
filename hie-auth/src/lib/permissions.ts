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

const SURVEILLANCE_OFFICER: Permission[] = [
    "reports.idsr.view",
    "reports.vhf.view",
    "rumours.triage",
    "vhf.contacts.manage",
];

/** A permission profile: what a job function can do, whatever level it works at. */
export interface PermissionProfile {
    name: string;
    permissions: Permission[];
}

/** Built-in permission profiles, by key. */
export const BUILT_IN_PERMISSION_PROFILES: Record<string, PermissionProfile> = {
    ADMINISTRATOR: { name: "Administrator", permissions: ALL_PERMISSIONS },
    FOCAL_PERSON: { name: "Focal Person", permissions: [...SURVEILLANCE_OFFICER, "specimens.view", "screenings.view"] },
    VIEWER: { name: "Viewer", permissions: ["reports.idsr.view", "specimens.view", "screenings.view"] },
    LAB: { name: "Lab", permissions: ["lab.enter_results", "specimens.view"] },
    NATIONAL_LAB: { name: "National Lab", permissions: ["lab.enter_results", "lab.national_scope", "specimens.view"] },
    SURVEILLANCE_OFFICER: { name: "Surveillance Officer", permissions: SURVEILLANCE_OFFICER },
    FACILITY_FOCAL_PERSON: { name: "Facility Focal Person", permissions: ["reports.idsr.view", "reports.vhf.view"] },
    CALL_CENTRE: { name: "Call Centre", permissions: ["callcentre.use"] },
    FIELD_WORKER: { name: "Field Worker", permissions: [] },
};

/** A role is a permission profile at a level. */
export interface Profile {
    /** Display name. */
    name: string;
    level: Level;
    permissions: Permission[];
    /** Key of the built-in permission profile the role inherits (built-in roles only). */
    profile?: string;
}

const builtInRole = (name: string, level: Level, profile: string): Profile => ({
    name,
    level,
    profile,
    permissions: BUILT_IN_PERMISSION_PROFILES[profile].permissions,
});

/** Existing Keycloak roles: a built-in permission profile at a level, keyed by role name. */
export const BUILT_IN_PROFILES: Record<string, Profile> = {
    ADMINISTRATOR: builtInRole("Administrator", "NATIONAL", "ADMINISTRATOR"),
    SUPERUSER: builtInRole("Superuser", "NATIONAL", "ADMINISTRATOR"),
    NATIONAL_FOCAL_PERSON: builtInRole("National Focal Person", "NATIONAL", "FOCAL_PERSON"),
    NATIONAL_VIEWER: builtInRole("National Viewer", "NATIONAL", "VIEWER"),
    NATIONAL_LAB: builtInRole("National Lab", "NATIONAL", "NATIONAL_LAB"),
    NATIONAL_CALL_CENTER_AGENTS: builtInRole("Call Centre Agent", "NATIONAL", "CALL_CENTRE"),
    COUNTY_DISEASE_SURVEILLANCE_OFFICER: builtInRole("County Disease Surveillance Officer", "COUNTY", "SURVEILLANCE_OFFICER"),
    SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER: builtInRole("Sub-County Disease Surveillance Officer", "SUB_COUNTY", "SURVEILLANCE_OFFICER"),
    FACILITY_SURVEILLANCE_FOCAL_PERSON: builtInRole("Facility Surveillance Focal Person", "FACILITY", "FACILITY_FOCAL_PERSON"),
    LAB_TECHNICIAN: builtInRole("Lab Technician", "FACILITY", "LAB"),
    SUPERVISORS: builtInRole("Supervisor", "FACILITY", "FIELD_WORKER"),
    VACCINATOR: builtInRole("Vaccinator", "FACILITY", "FIELD_WORKER"),
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

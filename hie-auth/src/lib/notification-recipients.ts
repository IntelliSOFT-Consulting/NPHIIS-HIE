import {
  getKeycloakUserById,
  getKeycloakUsers,
  isNotificationsEnabledForKeycloakUser,
} from "./keycloak";
import { getRoleFromPractitionerRoleResource } from "./practitioner-role";
import { FhirApi } from "./utils";

const FACILITY_SURVEILLANCE_FOCAL_PERSON_ROLE = "FACILITY_SURVEILLANCE_FOCAL_PERSON";

export type CaseSubmissionRecipient = {
  practitionerId: string;
  email: string | null;
  role: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Parses `CASE_SUBMISSION_NOTIFY_ROLES` (comma-separated Keycloak practitionerRole codes).
 */
export function getCaseSubmissionNotifyRolesFromEnv(): string[] {
  const raw = process.env.CASE_SUBMISSION_NOTIFY_ROLES;
  if (!raw?.trim()) {
    return ["NATIONAL_FOCAL_PERSON", "NATIONAL_VIEWER", "NATIONAL_LAB", "LAB_TECHNICIAN"];
  }
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

function roleMatches(userRole: string | null | undefined, allowed: string[]): boolean {
  const u = norm(userRole);
  if (!u) return false;
  return allowed.some((a) => norm(a) === u);
}

/**
 * Returns Keycloak users whose `practitionerRole` attribute matches any of `roles` (case-insensitive).
 * Walks all pages (default page size 100).
 */
export async function getUsersByRoles(roles: string[]): Promise<CaseSubmissionRecipient[]> {
  const allowed = roles.map((r) => r.trim()).filter(Boolean);
  if (allowed.length === 0) return [];

  const byPractitioner = new Map<string, CaseSubmissionRecipient>();
  const pageSize = 100;
  let first = 0;

  for (;;) {
    const chunk = await getKeycloakUsers(first, pageSize);
    const users = chunk?.users ?? [];
    if (!users.length) break;

    for (const user of users) {
      const r = user.role as string | null | undefined;
      if (!roleMatches(r, allowed)) continue;
      if (!user.notificationsEnabled) continue;

      const practitionerId =
        (user.fhirPractitionerId as string | null | undefined) ?? user.id;
      if (!practitionerId) continue;

      if (!byPractitioner.has(practitionerId)) {
        byPractitioner.set(practitionerId, {
          practitionerId,
          email: user.email ?? null,
          role: r ?? null,
        });
      }
    }

    if (users.length < pageSize) break;
    first += pageSize;
  }

  return [...byPractitioner.values()];
}

function extractLocationIdFromReference(reference: string | null | undefined): string | null {
  if (!reference?.trim()) return null;
  const ref = reference.trim();
  if (!ref.startsWith("Location/")) return null;
  const id = ref.split("/")[1]?.trim();
  return id || null;
}

function resolveFacilityLocationIdFromEncounter(encounter: unknown): string | null {
  const enc = encounter as {
    location?: Array<{ location?: { reference?: string } }>;
    serviceProvider?: { reference?: string };
  };

  const fromEncounterLocation = extractLocationIdFromReference(
    enc?.location?.[0]?.location?.reference,
  );
  if (fromEncounterLocation) return fromEncounterLocation;

  return extractLocationIdFromReference(enc?.serviceProvider?.reference);
}

function practitionerIdFromPractitionerRole(resource: Record<string, unknown>): string | null {
  const id = typeof resource.id === "string" ? resource.id.trim() : "";
  if (id) return id;

  const ref = (resource.practitioner as { reference?: string } | undefined)?.reference;
  if (typeof ref === "string" && ref.startsWith("Practitioner/")) {
    const practitionerId = ref.split("/")[1]?.trim();
    return practitionerId || null;
  }

  return null;
}

/**
 * Returns FACILITY_SURVEILLANCE_FOCAL_PERSON users assigned to the Encounter's reporting facility
 * via FHIR PractitionerRole.location.
 */
export async function getFacilityFocalPersonsForEncounter(
  encounter: unknown,
): Promise<CaseSubmissionRecipient[]> {
  const facilityId = resolveFacilityLocationIdFromEncounter(encounter);
  if (!facilityId) {
    console.warn(
      "[CaseSubmissionNotify] Encounter has no facility Location reference; skipping FACILITY_SURVEILLANCE_FOCAL_PERSON recipients",
    );
    return [];
  }

  const search = await FhirApi({
    url: `/PractitionerRole?location=Location/${encodeURIComponent(facilityId)}&_count=100`,
  });

  const bundle = search.data as {
    resourceType?: string;
    entry?: Array<{ resource?: Record<string, unknown> }>;
  };

  if (bundle?.resourceType !== "Bundle" || !Array.isArray(bundle.entry)) {
    return [];
  }

  const practitionerIds = [
    ...new Set(
      bundle.entry
        .map((entry) => entry.resource)
        .filter((resource): resource is Record<string, unknown> => {
          if ((resource?.resourceType as string | undefined) !== "PractitionerRole") {
            return false;
          }
          const role = getRoleFromPractitionerRoleResource(resource);
          return roleMatches(role, [FACILITY_SURVEILLANCE_FOCAL_PERSON_ROLE]);
        })
        .map((resource) => practitionerIdFromPractitionerRole(resource))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const recipients = await Promise.all(
    practitionerIds.map(async (practitionerId): Promise<CaseSubmissionRecipient | null> => {
      const keycloakUser = await getKeycloakUserById(practitionerId);
      if (!isNotificationsEnabledForKeycloakUser(keycloakUser)) {
        return null;
      }

      return {
        practitionerId,
        email: (keycloakUser?.email as string | undefined) ?? null,
        role: FACILITY_SURVEILLANCE_FOCAL_PERSON_ROLE,
      };
    }),
  );

  return recipients.filter((recipient): recipient is CaseSubmissionRecipient => recipient !== null);
}

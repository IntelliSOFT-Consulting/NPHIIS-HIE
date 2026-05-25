import { getKeycloakUsers } from "./keycloak";

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
    return ["ADMINISTRATOR", "SUPERUSER", "LAB_TECHNICIAN"];
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

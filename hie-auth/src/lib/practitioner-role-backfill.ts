import { FhirApi } from "./utils";
import { listKeycloakUsersRaw, setKeycloakUserAttributes } from "./keycloak";
import {
  getRoleFromPractitioner,
  resolvePractitionerIdForKeycloakUser,
  rolesEqual,
} from "./practitioner-role";

export type PractitionerRoleBackfillStats = {
  scanned: number;
  updated: number;
  skipped: number;
  noPractitioner: number;
  noRole: number;
  errors: number;
  skippedBecauseAlreadyRunning?: boolean;
};

let backfillRunning = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sync FHIR Practitioner `role-group` → Keycloak `practitionerRole`, `nphiis_role`, `fhirPractitionerId`.
 */
export async function runPractitionerRoleBackfillJob(): Promise<PractitionerRoleBackfillStats> {
  if (backfillRunning) {
    console.warn("[PractitionerRoleBackfill] Skipped: a run is already in progress");
    return {
      scanned: 0,
      updated: 0,
      skipped: 0,
      noPractitioner: 0,
      noRole: 0,
      errors: 0,
      skippedBecauseAlreadyRunning: true,
    };
  }

  backfillRunning = true;
  const delayMs = Math.max(
    0,
    parseInt(process.env.PRACTITIONER_ROLE_BACKFILL_DELAY_MS || "0", 10) || 0,
  );

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let noPractitioner = 0;
  let noRole = 0;
  let errors = 0;

  const pageSize = 100;
  let first = 0;

  try {
    console.log("[PractitionerRoleBackfill] Starting…");
    for (;;) {
      const page = await listKeycloakUsersRaw(first, pageSize);
      const users = page?.users ?? [];
      if (!users.length) break;

      for (const user of users) {
        scanned++;
        try {
          const practitionerId = resolvePractitionerIdForKeycloakUser(user);
          if (!practitionerId) {
            noPractitioner++;
            continue;
          }

          const fhirResp = await FhirApi({ url: `/Practitioner/${practitionerId}` });
          if (fhirResp.status !== "success") {
            noPractitioner++;
            continue;
          }
          const practitioner = fhirResp.data;
          if (practitioner?.resourceType !== "Practitioner") {
            noPractitioner++;
            continue;
          }

          const role = getRoleFromPractitioner(practitioner);
          if (!role) {
            noRole++;
            continue;
          }

          const currentRole = user.attributes?.practitionerRole?.[0] ?? null;
          const currentFhirId = user.attributes?.fhirPractitionerId?.[0] ?? null;
          const currentNphiisRole = user.attributes?.nphiis_role?.[0] ?? null;

          if (
            rolesEqual(currentRole, role) &&
            rolesEqual(currentNphiisRole, role) &&
            (currentFhirId ?? "") === practitionerId
          ) {
            skipped++;
            continue;
          }

          const ok = await setKeycloakUserAttributes(user.id, {
            practitionerRole: [role],
            nphiis_role: [role],
            fhirPractitionerId: [practitionerId],
          });
          if (ok) {
            updated++;
            console.log(
              `[PractitionerRoleBackfill] Updated ${user.username ?? user.id} → ${role}`,
            );
          } else {
            errors++;
          }
        } catch (e) {
          errors++;
          console.error(
            `[PractitionerRoleBackfill] Error for user ${user.id}:`,
            e,
          );
        }

        if (delayMs > 0) await sleep(delayMs);
      }

      if (users.length < pageSize) break;
      first += pageSize;
    }

    console.log(
      `[PractitionerRoleBackfill] Done. scanned=${scanned} updated=${updated} skipped=${skipped} noPractitioner=${noPractitioner} noRole=${noRole} errors=${errors}`,
    );
    return { scanned, updated, skipped, noPractitioner, noRole, errors };
  } finally {
    backfillRunning = false;
  }
}

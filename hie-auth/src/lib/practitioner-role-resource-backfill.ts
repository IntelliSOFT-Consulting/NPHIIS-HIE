import { FhirApi } from "./utils";
import { listKeycloakUsersRaw } from "./keycloak";
import {
  getLocationFromPractitioner,
  getLocationFromPractitionerRoleResource,
  getPractitionerRole,
  getRoleFromPractitioner,
  getRoleFromPractitionerRoleResource,
  putPractitionerRoleResource,
  resolvePractitionerIdForKeycloakUser,
  rolesEqual,
} from "./practitioner-role";

export type PractitionerRoleResourceBackfillStats = {
  scanned: number;
  created: number;
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

function parseLocationId(reference: string | null): string | null {
  if (!reference) return null;
  const match = reference.match(/^Location\/(.+)$/);
  return match?.[1]?.trim() || null;
}

/**
 * Create or update FHIR PractitionerRole resources from existing Practitioner extensions.
 */
export async function runPractitionerRoleResourceBackfillJob(): Promise<PractitionerRoleResourceBackfillStats> {
  if (backfillRunning) {
    console.warn(
      "[PractitionerRoleResourceBackfill] Skipped: a run is already in progress",
    );
    return {
      scanned: 0,
      created: 0,
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
    parseInt(
      process.env.PRACTITIONER_ROLE_RESOURCE_BACKFILL_DELAY_MS || "0",
      10,
    ) || 0,
  );

  let scanned = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let noPractitioner = 0;
  let noRole = 0;
  let errors = 0;

  const pageSize = 100;
  let first = 0;

  try {
    console.log("[PractitionerRoleResourceBackfill] Starting…");
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

          const locationRef = getLocationFromPractitioner(practitioner);
          const locationId =
            parseLocationId(locationRef.reference) ??
            user.attributes?.nphiis_location?.[0] ??
            "0";
          const locationName = locationRef.display ?? undefined;

          const existing = await getPractitionerRole(practitionerId);
          if (existing) {
            const existingRole = getRoleFromPractitionerRoleResource(existing);
            const existingLocationId = parseLocationId(
              getLocationFromPractitionerRoleResource(existing).reference,
            );

            if (
              rolesEqual(existingRole, role) &&
              (existingLocationId ?? "0") === locationId
            ) {
              skipped++;
              continue;
            }

            await putPractitionerRoleResource(practitionerId, role, {
              id: locationId,
              name: locationName,
            });
            updated++;
            console.log(
              `[PractitionerRoleResourceBackfill] Updated ${user.username ?? user.id}`,
            );
          } else {
            await putPractitionerRoleResource(practitionerId, role, {
              id: locationId,
              name: locationName,
            });
            created++;
            console.log(
              `[PractitionerRoleResourceBackfill] Created ${user.username ?? user.id}`,
            );
          }
        } catch (e) {
          errors++;
          console.error(
            `[PractitionerRoleResourceBackfill] Error for user ${user.id}:`,
            e,
          );
        }

        if (delayMs > 0) await sleep(delayMs);
      }

      if (users.length < pageSize) break;
      first += pageSize;
    }

    console.log(
      `[PractitionerRoleResourceBackfill] Done. scanned=${scanned} created=${created} updated=${updated} skipped=${skipped} noPractitioner=${noPractitioner} noRole=${noRole} errors=${errors}`,
    );
    return {
      scanned,
      created,
      updated,
      skipped,
      noPractitioner,
      noRole,
      errors,
    };
  } finally {
    backfillRunning = false;
  }
}

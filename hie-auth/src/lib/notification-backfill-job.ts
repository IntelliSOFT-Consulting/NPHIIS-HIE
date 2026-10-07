import { NotificationType, NotificationStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { FhirApi } from "./utils";
import { fetchAllEncounterIds } from "./fhir-resource-history";
import { patientHasOfficialEpid, getEpidValueFromEncounter } from "./epid-utils";
import { resolveLocationHierarchy } from "./epid-location";
import { notifyCaseSubmissionIfEnabled } from "./notification";
import { getCaseSubmissionNotifyRolesFromEnv, getUsersByRoles } from "./notification-recipients";
import { conditionCodeForReason } from "./condition-codes";

export type CaseNotificationBackfillStats = {
  scanned: number;
  withEpid: number;
  alreadyFullySent: number;
  notified: number;
  skipped: number;
  errors: number;
  skippedBecauseAlreadyRunning?: boolean;
};

let notificationBackfillRunning = false;

async function resolveLocationNames(
  encounterId: string,
  epidValue: string,
): Promise<{ countyName: string; subCountyName: string }> {
  try {
    const obs = (
      await FhirApi({ url: `/Observation?code=a3-sub-county&encounter=${encounterId}` })
    ).data?.entry?.[0]?.resource;
    const vs = obs?.valueString;
    if (vs) {
      const hier = await resolveLocationHierarchy(FhirApi, String(vs));
      const countyName = hier.county?.name?.toUpperCase()?.trim() ?? "";
      const subCountyName = hier.subCounty?.name?.toUpperCase()?.trim() ?? "";
      if (countyName && subCountyName) {
        return { countyName, subCountyName };
      }
    }
  } catch {
    // fall through to EPID parse fallback
  }

  // Fallback: parse EPID segments (e.g. KEN-NAI-WES-2024-AFP-001 → county=NAI, subCounty=WES)
  const parts = epidValue.split("-");
  return {
    countyName: parts[1] ?? "UNKNOWN",
    subCountyName: parts[2] ?? "UNKNOWN",
  };
}

export async function runCaseNotificationBackfillJob(): Promise<CaseNotificationBackfillStats> {
  if (notificationBackfillRunning) {
    console.warn("[CaseNotificationBackfill] Skipped: a run is already in progress");
    return {
      scanned: 0, withEpid: 0, alreadyFullySent: 0,
      notified: 0, skipped: 0, errors: 0,
      skippedBecauseAlreadyRunning: true,
    };
  }

  notificationBackfillRunning = true;
  const delayMs = Math.max(0, parseInt(process.env.ENCOUNTER_BACKFILL_DELAY_MS || "0", 10) || 0);

  let scanned = 0, withEpid = 0, alreadyFullySent = 0, notified = 0, skipped = 0, errors = 0;

  try {
    const roles = getCaseSubmissionNotifyRolesFromEnv();
    const expectedRecipients = (await getUsersByRoles(roles)).length;
    console.log(
      `[CaseNotificationBackfill] Starting. Expected recipient count: ${expectedRecipients}`,
    );

    const encounterIds = await fetchAllEncounterIds();
    console.log(`[CaseNotificationBackfill] Found ${encounterIds.length} encounters`);

    for (const eid of encounterIds) {
      scanned++;
      try {
        const enc = (await FhirApi({ url: `/Encounter/${eid}` })).data;
        if (!enc?.id || enc.resourceType !== "Encounter") {
          skipped++;
          continue;
        }

        const patientId = enc?.subject?.reference?.split("/")[1];
        if (!patientId) { skipped++; continue; }
        const patient = (await FhirApi({ url: `/Patient/${patientId}` })).data;

        if (!patientHasOfficialEpid(patient)) {
          skipped++;
          continue;
        }
        withEpid++;

        const epid = getEpidValueFromEncounter(enc);
        if (!epid) {
          console.warn(`[CaseNotificationBackfill] Patient has EPID but Encounter/${eid} identifier missing — skipping`);
          skipped++;
          continue;
        }

        if (expectedRecipients > 0) {
          const sentCount = await prisma.notification.count({
            where: {
              encounterId: eid,
              type: NotificationType.CASE_SUBMISSION,
              status: NotificationStatus.SENT,
            },
          });
          if (sentCount >= expectedRecipients) {
            alreadyFullySent++;
            continue;
          }
        }

        const rc = enc?.reasonCode?.[0]?.coding?.[0]?.code
          ? String(enc.reasonCode[0].coding[0].code)
          : "";
        const diseaseCondition = conditionCodeForReason(rc);

        const { countyName, subCountyName } = await resolveLocationNames(eid, epid);

        await notifyCaseSubmissionIfEnabled(enc, { epid, diseaseCondition, countyName, subCountyName });
        notified++;
      } catch (e) {
        console.error(`[CaseNotificationBackfill] Error for Encounter/${eid}:`, e);
        errors++;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    console.log(
      `[CaseNotificationBackfill] Done. scanned=${scanned} withEpid=${withEpid} ` +
      `alreadyFullySent=${alreadyFullySent} notified=${notified} skipped=${skipped} errors=${errors}`,
    );
    return { scanned, withEpid, alreadyFullySent, notified, skipped, errors };
  } finally {
    notificationBackfillRunning = false;
  }
}

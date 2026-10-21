import { FhirApi } from "./utils";
import { assignEpidForEncounter } from "./epid-assignment";
import { processFollowUpObservations } from "./fhir";
import { fetchAllEncounterIds, orderEncounterIdsByV1 } from "./fhir-resource-history";
import { patientHasOfficialEpid } from "./epid-utils";

export type EncounterBackfillStats = {
  totalEncounters: number;
  epidAssignedOrPresent: number;
  epidAssignErrors: number;
  afpFollowUpErrors: number;
  /** True when another run was still in progress (manual or cron). */
  skippedBecauseAlreadyRunning?: boolean;
};

let backfillRunning = false;

/**
 * Fetch all Encounters from FHIR, order by version-1 time, then:
 * - EPID: assign when the subject Patient has no official EPID identifier.
 * - AFP: run `processFollowUpObservations` (Observation code 502488184403) for each encounter.
 */
export async function runEncounterBackfillJob(): Promise<EncounterBackfillStats> {
  if (backfillRunning) {
    console.warn("[EncounterBackfill] Skipped: a run is already in progress");
    return {
      totalEncounters: 0,
      epidAssignedOrPresent: 0,
      epidAssignErrors: 0,
      afpFollowUpErrors: 0,
      skippedBecauseAlreadyRunning: true,
    };
  }

  backfillRunning = true;
  const delayMs = Math.max(0, parseInt(process.env.ENCOUNTER_BACKFILL_DELAY_MS || "0", 10) || 0);

  let epidAssignedOrPresent = 0;
  let epidAssignErrors = 0;
  let afpFollowUpErrors = 0;

  try {
    console.log("[EncounterBackfill] Fetching all Encounter ids…");
    const rawIds = await fetchAllEncounterIds();
    console.log(`[EncounterBackfill] Found ${rawIds.length} encounters; resolving v1 order…`);
    const ordered = await orderEncounterIdsByV1(rawIds);
    console.log(`[EncounterBackfill] Processing ${ordered.length} encounters (EPID then AFP follow-up)…`);

    for (const eid of ordered) {
      try {
        const enc = (await FhirApi({ url: `/Encounter/${eid}` })).data;
        if (!enc?.id || enc.resourceType !== "Encounter") {
          epidAssignErrors++;
          continue;
        }

        const patient = (await FhirApi({ url: `/Patient/${enc?.subject?.reference?.split("/")[1]}` })).data;
        const hasOfficialEpid = patientHasOfficialEpid(patient);

        if (hasOfficialEpid) {
          epidAssignedOrPresent++;
        } else {
          const r = await assignEpidForEncounter(enc);
          if (r.kind === "not_applicable") {
            // Call logs get no EPID.
          } else if (r.kind === "success" || r.kind === "already_official_epid") {
            epidAssignedOrPresent++;
          } else {
            epidAssignErrors++;
          }
        }

        const afp = await processFollowUpObservations(eid);
        if (afp?.status === "error") {
          afpFollowUpErrors++;
        }
      } catch (e) {
        console.error(`[EncounterBackfill] Error for Encounter/${eid}:`, e);
        epidAssignErrors++;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    console.log(
      `[EncounterBackfill] Done. EPID ok/skip: ${epidAssignedOrPresent}, EPID errors: ${epidAssignErrors}, AFP follow-up errors: ${afpFollowUpErrors}`
    );

    return {
      totalEncounters: ordered.length,
      epidAssignedOrPresent,
      epidAssignErrors,
      afpFollowUpErrors,
    };
  } finally {
    backfillRunning = false;
  }
}

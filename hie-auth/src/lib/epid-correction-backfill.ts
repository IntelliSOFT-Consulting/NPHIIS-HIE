import { FhirApi, FhirIdentifier } from "./utils";
import { fetchAllEncounterIds } from "./fhir-resource-history";
import {
  getEpidValueFromEncounter,
  patientHasOfficialEpid,
  identifierIsOfficialEpid,
  EPID_SYSTEM_URI,
} from "./epid-utils";
import {
  buildEpidFormattedId,
  parseEpid,
  resolveLocationNamesForEncounter,
} from "./epid-location-segment";
import { getEncounterVersionOneLastUpdatedInstant } from "./fhir-resource-history";

export type EpidCorrectionExample = {
  encounterId: string;
  patientId: string;
  oldEpid: string;
  newEpid: string;
  subCountyName: string;
};

export type EpidCorrectionBackfillStats = {
  scanned: number;
  mismatched: number;
  corrected: number;
  skipped: number;
  noEpid: number;
  noLocation: number;
  unparseableEpid: number;
  errors: number;
  dryRun: boolean;
  examples: EpidCorrectionExample[];
  skippedBecauseAlreadyRunning?: boolean;
};

export type EpidCorrectionBackfillOptions = {
  /** When true (default), only report mismatches without writing FHIR. */
  dryRun?: boolean;
  limit?: number;
  fromDate?: string;
  toDate?: string;
};

let correctionRunning = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoundary(iso?: string): number | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso.trim());
  return isNaN(t) ? null : t;
}

async function encounterInDateRange(
  encounterId: string,
  fromMs: number | null,
  toMs: number | null,
): Promise<boolean> {
  if (fromMs == null && toMs == null) return true;
  const enc = (await FhirApi({ url: `/Encounter/${encounterId}` })).data;
  let instant = enc?.meta?.lastUpdated ? String(enc.meta.lastUpdated) : null;
  if (!instant) {
    const v1 = await getEncounterVersionOneLastUpdatedInstant(encounterId);
    instant = v1?.instant ?? null;
  }
  if (!instant) return fromMs == null;
  const t = Date.parse(instant);
  if (isNaN(t)) return fromMs == null;
  if (fromMs != null && t < fromMs) return false;
  if (toMs != null && t > toMs) return false;
  return true;
}

function setOfficialEpidValueOnPatient(patient: any, newEpid: string): any {
  const ids = Array.isArray(patient?.identifier) ? [...patient.identifier] : [];
  let found = false;
  const updated = ids.map((id: any) => {
    if (identifierIsOfficialEpid(id)) {
      found = true;
      return { ...id, value: newEpid };
    }
    return id;
  });
  if (!found) {
    updated.push(
      FhirIdentifier(EPID_SYSTEM_URI, "EPID", "Epidemiological ID", newEpid, true),
    );
  }
  return { ...patient, identifier: updated };
}

function setEpidOnEncounter(encounter: any, newEpid: string): any {
  const identifiers = Array.isArray(encounter.identifier) ? encounter.identifier : [];
  const filtered = identifiers.filter((id: any) => id?.system !== EPID_SYSTEM_URI);
  return {
    ...encounter,
    identifier: [{ system: EPID_SYSTEM_URI, value: newEpid }, ...filtered],
  };
}

async function applyEpidCorrection(
  encounterId: string,
  patientId: string,
  newEpid: string,
): Promise<{ ok: boolean; error?: string }> {
  const patientResp = await FhirApi({ url: `/Patient/${patientId}` });
  const patient = patientResp.data;
  if (patientResp.status !== "success" || patient?.resourceType !== "Patient") {
    return { ok: false, error: "Patient not found" };
  }

  const patientBody = setOfficialEpidValueOnPatient(patient, newEpid);
  const patientHeaders: Record<string, string> = {};
  if (patient?.meta?.versionId) {
    patientHeaders["If-Match"] = `W/"${patient.meta.versionId}"`;
  }
  const patientPut = await FhirApi({
    url: `/Patient/${patientId}`,
    method: "PUT",
    data: JSON.stringify(patientBody),
    headers: patientHeaders,
  });
  if (patientPut.status !== "success") {
    const detail =
      patientPut.data?.issue?.[0]?.diagnostics ||
      patientPut.data?.issue?.[0]?.details?.text ||
      JSON.stringify(patientPut.data);
    return { ok: false, error: `Patient PUT failed: ${detail}` };
  }

  const encResp = await FhirApi({ url: `/Encounter/${encounterId}` });
  const enc = encResp.data;
  if (encResp.status !== "success" || enc?.resourceType !== "Encounter") {
    return { ok: false, error: "Encounter not found after Patient update" };
  }

  const encounterBody = setEpidOnEncounter(enc, newEpid);
  const encounterHeaders: Record<string, string> = {};
  if (enc?.meta?.versionId) {
    encounterHeaders["If-Match"] = `W/"${enc.meta.versionId}"`;
  }
  const encPut = await FhirApi({
    url: `/Encounter/${encounterId}`,
    method: "PUT",
    data: JSON.stringify(encounterBody),
    headers: encounterHeaders,
  });
  if (encPut.status !== "success") {
    const detail =
      encPut.data?.issue?.[0]?.diagnostics ||
      encPut.data?.issue?.[0]?.details?.text ||
      JSON.stringify(encPut.data);
    return { ok: false, error: `Encounter PUT failed: ${detail}` };
  }

  return { ok: true };
}

/**
 * Recompute EPID location prefixes for encounters that already have an official EPID.
 * Default: dry-run only. Set `dryRun: false` to apply corrections.
 */
export async function runEpidCorrectionBackfillJob(
  options: EpidCorrectionBackfillOptions = {},
): Promise<EpidCorrectionBackfillStats> {
  if (correctionRunning) {
    console.warn("[EpidCorrectionBackfill] Skipped: a run is already in progress");
    return {
      scanned: 0,
      mismatched: 0,
      corrected: 0,
      skipped: 0,
      noEpid: 0,
      noLocation: 0,
      unparseableEpid: 0,
      errors: 0,
      dryRun: options.dryRun !== false,
      examples: [],
      skippedBecauseAlreadyRunning: true,
    };
  }

  correctionRunning = true;
  const dryRun = options.dryRun !== false;
  const limit = options.limit != null ? Math.max(0, options.limit) : undefined;
  const fromMs = parseBoundary(options.fromDate);
  const toMs = parseBoundary(options.toDate);
  const delayMs = Math.max(
    0,
    parseInt(process.env.EPID_CORRECTION_BACKFILL_DELAY_MS || "0", 10) || 0,
  );
  const maxExamples = 50;

  let scanned = 0;
  let mismatched = 0;
  let corrected = 0;
  let skipped = 0;
  let noEpid = 0;
  let noLocation = 0;
  let unparseableEpid = 0;
  let errors = 0;
  const examples: EpidCorrectionExample[] = [];

  try {
    console.log(
      `[EpidCorrectionBackfill] Starting (dryRun=${dryRun}, limit=${limit ?? "none"})…`,
    );
    const encounterIds = await fetchAllEncounterIds();

    for (const encounterId of encounterIds) {
      if (limit != null && scanned >= limit) break;

      try {
        if (!(await encounterInDateRange(encounterId, fromMs, toMs))) {
          continue;
        }

        const encResp = await FhirApi({ url: `/Encounter/${encounterId}` });
        const enc = encResp.data;
        if (encResp.status !== "success" || enc?.resourceType !== "Encounter") {
          errors++;
          continue;
        }

        const currentEpid = getEpidValueFromEncounter(enc);
        if (!currentEpid) {
          noEpid++;
          continue;
        }

        const patientId = enc?.subject?.reference?.split("/")[1];
        if (!patientId) {
          errors++;
          continue;
        }

        scanned++;

        const parsed = parseEpid(currentEpid);
        if (!parsed) {
          unparseableEpid++;
          continue;
        }

        const location = await resolveLocationNamesForEncounter(encounterId, FhirApi);
        if (!location) {
          noLocation++;
          continue;
        }

        const expectedEpid = buildEpidFormattedId(
          location.countryName,
          location.countyName,
          location.subCountyName,
          parsed.year,
          parsed.condition,
          parsed.seq,
        );

        if (expectedEpid === currentEpid) {
          skipped++;
          continue;
        }

        mismatched++;
        const example: EpidCorrectionExample = {
          encounterId,
          patientId,
          oldEpid: currentEpid,
          newEpid: expectedEpid,
          subCountyName: location.subCountyName,
        };

        if (examples.length < maxExamples) {
          examples.push(example);
        }

        console.log(
          `[EpidCorrectionBackfill] Mismatch Encounter/${encounterId}: ${currentEpid} -> ${expectedEpid}`,
        );

        if (!dryRun) {
          const patientResp = await FhirApi({ url: `/Patient/${patientId}` });
          if (!patientHasOfficialEpid(patientResp.data)) {
            errors++;
            continue;
          }

          const result = await applyEpidCorrection(encounterId, patientId, expectedEpid);
          if (result.ok) {
            corrected++;
            console.log(
              `[EpidCorrectionBackfill] Corrected Encounter/${encounterId} Patient/${patientId}`,
            );
          } else {
            errors++;
            console.error(
              `[EpidCorrectionBackfill] Failed Encounter/${encounterId}:`,
              result.error,
            );
          }
        }
      } catch (e) {
        errors++;
        console.error(`[EpidCorrectionBackfill] Error Encounter/${encounterId}:`, e);
      }

      if (delayMs > 0) await sleep(delayMs);
    }

    console.log(
      `[EpidCorrectionBackfill] Done. scanned=${scanned} mismatched=${mismatched} corrected=${corrected} skipped=${skipped} dryRun=${dryRun}`,
    );

    return {
      scanned,
      mismatched,
      corrected,
      skipped,
      noEpid,
      noLocation,
      unparseableEpid,
      errors,
      dryRun,
      examples,
    };
  } finally {
    correctionRunning = false;
  }
}

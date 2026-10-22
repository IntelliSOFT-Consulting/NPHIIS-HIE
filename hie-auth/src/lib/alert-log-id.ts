import { FhirApi } from "./utils";
import { generateCaseId } from "./caseIdTracker";
import { buildEpidFormattedId, resolveLocationNamesForEncounter } from "./epid-location-segment";
import { resolveCountyLocationSegment } from "./county-segment-registry";

/**
 * 719 call logs (alert / rumour log) get no EPID; they get an Alert Log ID instead, built
 * like an EPID from the caller's reported place: KEN-NAI-EME-2026-ALR-001, numbered per
 * sub-county per year. The server assigns it once, on the log's Patient and Encounter, and
 * it never changes. Its own system keeps it apart from EPIDs everywhere (lists, warehouse).
 */
export const ALERT_LOG_ID_SYSTEM_URI = "http://hie.org/identifiers/ALERT_LOG_ID";
export const ALERT_LOG_CONDITION = "ALR";

export function alertLogIdIdentifier(value: string) {
  return {
    use: "official",
    system: ALERT_LOG_ID_SYSTEM_URI,
    type: { coding: [{ system: ALERT_LOG_ID_SYSTEM_URI, code: "ALERT_LOG_ID", display: "Alert Log ID" }] },
    value,
  };
}

/** Alert Log ID on an Encounter's or Patient's identifiers, if any. */
export function getAlertLogId(resource: any): string | undefined {
  const ids: any[] = Array.isArray(resource?.identifier) ? resource.identifier : [];
  const v = ids.find((i) => i?.system === ALERT_LOG_ID_SYSTEM_URI && typeof i?.value === "string")?.value;
  return v?.trim() || undefined;
}

/** Year of the log: its system-creation stamp ("yyyy-MM-dd HH:mm:ss"), else this year. */
export function alertLogYear(patient: any, encounter: any, now: Date = new Date()): number {
  for (const r of [patient, encounter]) {
    const ids: any[] = Array.isArray(r?.identifier) ? r.identifier : [];
    const stamp = ids.find((i) => i?.system === "system-creation" && typeof i?.value === "string")?.value;
    const year = Number.parseInt(String(stamp ?? "").slice(0, 4), 10);
    if (year >= 2000 && year <= 2100) return year;
  }
  return now.getFullYear();
}

/** Adds the ID to a resource's identifiers (once). */
export function withAlertLogId(resource: any, value: string): any {
  const ids: any[] = Array.isArray(resource?.identifier) ? resource.identifier : [];
  if (ids.some((i) => i?.system === ALERT_LOG_ID_SYSTEM_URI)) return resource;
  return { ...resource, identifier: [...ids, alertLogIdIdentifier(value)] };
}

export type AlertLogIdResult =
  | { kind: "success"; encounter: any; alertLogId: string }
  /** retryable: false when retrying cannot help (no sub-county on the log). */
  | { kind: "error"; error: unknown; retryable?: boolean };

async function putWithVersion(path: string, resource: any): Promise<void> {
  const headers: Record<string, string> = {};
  if (resource?.meta?.versionId) headers["If-Match"] = `W/"${resource.meta.versionId}"`;
  const res = await FhirApi({ url: path, method: "PUT", data: JSON.stringify(resource), headers });
  if (res.status !== "success") {
    const detail = res.data?.issue?.[0]?.diagnostics || JSON.stringify(res.data).slice(0, 300);
    throw new Error(`${path} update failed: ${detail}`);
  }
}

/**
 * Gives a call log its Alert Log ID (Patient first, then Encounter). Re-running is safe: an
 * ID already on the Patient is copied to the Encounter, and nothing else changes. Callers
 * serialise per Patient (see epid-assignment), so one log never gets two numbers.
 */
export async function assignAlertLogId(encounterId: string): Promise<AlertLogIdResult> {
  try {
    const encounter = (await FhirApi({ url: `/Encounter/${encounterId}` })).data;
    if (encounter?.resourceType !== "Encounter") {
      return { kind: "error", error: new Error(`Encounter/${encounterId} not found`) };
    }
    const patientId = encounter?.subject?.reference?.split("/")[1];
    const patient = patientId ? (await FhirApi({ url: `/Patient/${patientId}` })).data : null;
    if (patient?.resourceType !== "Patient") {
      return { kind: "error", error: new Error(`Patient of Encounter/${encounterId} not found`) };
    }

    let id = getAlertLogId(patient) ?? getAlertLogId(encounter);
    if (!id) {
      const place = await resolveLocationNamesForEncounter(encounterId, FhirApi);
      if (!place) {
        return {
          kind: "error",
          error: new Error("Could not resolve the call log's county / sub-county (Observation a3-sub-county)"),
          retryable: false,
        };
      }
      const year = alertLogYear(patient, encounter);
      // The year is part of the counter key, so numbering restarts each year.
      const seq = await generateCaseId(place.countryName, place.countyName, place.subCountyName, `${ALERT_LOG_CONDITION}-${year}`);
      const countySegment = await resolveCountyLocationSegment(FhirApi, place.countyName);
      id = buildEpidFormattedId(place.countryName, countySegment, place.subCountyName, year, ALERT_LOG_CONDITION, seq);
    }

    if (!getAlertLogId(patient)) await putWithVersion(`/Patient/${patient.id}`, withAlertLogId(patient, id));
    let saved = encounter;
    if (!getAlertLogId(encounter)) {
      saved = withAlertLogId(encounter, id);
      await putWithVersion(`/Encounter/${encounter.id}`, saved);
    }
    return { kind: "success", encounter: saved, alertLogId: id };
  } catch (error) {
    return { kind: "error", error };
  }
}

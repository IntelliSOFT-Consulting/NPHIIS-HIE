/**
 * VHF cases carry a national Case ID alongside their EPID: KEN-<year>-<seq>, seq zero-padded
 * to 3 digits and growing past 999 (KEN-2026-001 … KEN-2026-999999). The server assigns it once
 * the case has its EPID, and it is stamped on the case Encounter and the Patient as the EPID is.
 * Phones never number cases themselves, so offline devices cannot collide.
 */
export const CASE_ID_SYSTEM_URI = "http://hie.org/identifiers/CASE_ID";

export const VHF_CASE_ID_PATTERN = /^KEN-\d{4}-\d{3,}$/;

export function formatVhfCaseId(year: number, seq: number): string {
  return `KEN-${year}-${String(seq).padStart(3, "0")}`;
}

export function isVhfCaseId(value: string | undefined): boolean {
  return !!value && VHF_CASE_ID_PATTERN.test(value.trim());
}

export function caseIdIdentifier(value: string) {
  return {
    use: "official",
    system: CASE_ID_SYSTEM_URI,
    type: { coding: [{ system: CASE_ID_SYSTEM_URI, code: "CASE_ID", display: "Case ID" }] },
    value,
  };
}

/** Case ID on an Encounter's or Patient's identifiers, if any. */
export function getCaseId(resource: any): string | undefined {
  const ids = Array.isArray(resource?.identifier) ? resource.identifier : [];
  const found = ids.find((i: any) => i?.system === CASE_ID_SYSTEM_URI && isVhfCaseId(i?.value));
  return found?.value?.trim();
}

/**
 * Case-id tracker key for the national VHF counter. The tracker table is keyed by
 * country/county/sub-county/condition; the year takes the sub-county slot so numbering
 * restarts at 001 each year without a schema change. No real county is NATIONAL, so it never
 * shares a counter with the VHF EPIDs. This is the key the short-lived national VHF EPIDs used,
 * so Case IDs number on from them.
 */
export function vhfCaseIdCounterKey(year: number) {
  return { country: "KEN", county: "NATIONAL", subCounty: String(year), condition: "VHF" };
}

/**
 * The year a case belongs to: when it was created on the phone (system-creation identifier),
 * else when the encounter started, else now. Never the patient's birth date.
 */
export function vhfCaseYear(systemCreation: string | undefined, encounterStart: string | undefined, now = new Date()): number {
  for (const v of [systemCreation?.split(" ")[0], encounterStart]) {
    const t = v ? Date.parse(v) : NaN;
    if (!Number.isNaN(t)) return new Date(t).getUTCFullYear();
  }
  return now.getUTCFullYear();
}

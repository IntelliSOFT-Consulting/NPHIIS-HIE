/** Case-form Encounter.reasonCode → EPID condition segment. Single source of truth. */
export const REASON_CODE_CONDITIONS: Record<string, string> = {
  "Measles Case Information": "MEA",
  "MOH 505 Reporting Form": "MOH505",
  "AFP Case Information": "AFP",
  "VHF Case Information": "VHF",
};

/** Unmapped reasons fall back to their first 3 characters (e.g. "Mpox Register" → "MPO"). */
export function conditionCodeForReason(reason: string | undefined): string {
  const rc = reason ? String(reason) : "";
  return REASON_CODE_CONDITIONS[rc] || (rc ? rc.toUpperCase().slice(0, 3) : "UNK");
}

/**
 * Records that never get an EPID of their own: 719 call logs (alert / rumour log).
 * A call log can be linked to a case instead, which carries the EPID.
 */
export const NO_EPID_REASONS = new Set<string>(["Alert Rumor Log"]);

/** True when the Encounter is a kind of record that gets no EPID (any reasonCode coding matches). */
export function encounterGetsNoEpid(encounter: any): boolean {
  const reasons: any[] = Array.isArray(encounter?.reasonCode) ? encounter.reasonCode : [];
  return reasons.some((r) =>
    (r?.coding ?? []).some((c: any) => typeof c?.code === "string" && NO_EPID_REASONS.has(c.code)),
  );
}

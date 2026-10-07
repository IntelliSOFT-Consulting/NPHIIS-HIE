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

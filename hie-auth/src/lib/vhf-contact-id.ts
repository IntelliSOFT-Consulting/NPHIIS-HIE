/**
 * VHF contacts get a Contact ID, not an EPID: the EPID of the case they were exposed to plus
 * "-C" and a per-case number, zero-padded to 3 digits and growing past 999
 * (KEN-NAI-KIB-2026-VHF-001-C001). The server assigns it once the case has its EPID, on the
 * contact's case Encounter and Patient, and it never changes. A contact converted to a case
 * gets its own EPID and Case ID and keeps the Contact ID as history.
 */
export const CONTACT_ID_SYSTEM_URI = "http://hie.org/identifiers/CONTACT_ID";

export const VHF_CONTACT_ID_PATTERN = /^\S+-C\d{3,}$/;

export function formatVhfContactId(caseEpid: string, seq: number): string {
  return `${caseEpid.trim()}-C${String(seq).padStart(3, "0")}`;
}

export function isVhfContactId(value: string | undefined): boolean {
  return !!value && VHF_CONTACT_ID_PATTERN.test(value.trim());
}

export function contactIdIdentifier(value: string) {
  return {
    use: "official",
    system: CONTACT_ID_SYSTEM_URI,
    type: { coding: [{ system: CONTACT_ID_SYSTEM_URI, code: "CONTACT_ID", display: "Contact ID" }] },
    value,
  };
}

/** Contact ID on an Encounter's or Patient's identifiers, if any. */
export function getContactId(resource: any): string | undefined {
  const ids = Array.isArray(resource?.identifier) ? resource.identifier : [];
  const found = ids.find((i: any) => i?.system === CONTACT_ID_SYSTEM_URI && isVhfContactId(i?.value));
  return found?.value?.trim();
}

/**
 * Counter key for a case's contacts in the case-id tracker table (keyed by
 * country/county/sub-county/condition). No real county is CONTACT, so it never shares a
 * counter with EPIDs or Case IDs; the case's EPID takes the sub-county slot.
 */
export function vhfContactIdCounterKey(caseEpid: string) {
  return { country: "KEN", county: "CONTACT", subCounty: caseEpid.trim(), condition: "VHF" };
}

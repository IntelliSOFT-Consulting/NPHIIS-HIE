import { FhirApi } from "./utils";
import { conditionCodeForReason } from "./condition-codes";
import { observationValues } from "./nphl-lab";
import { VHF_CONTACT_LINK_IDS } from "./vhf-link-ids";
import { normalizeCaseType } from "./vhf-contact-status";

export { normalizeCaseType };

/** The latest "Type of case" among a VHF case Encounter's Observations (they are appended, never edited). */
export function vhfCaseTypeFromObservations(observations: any[]): string | null {
  return normalizeCaseType(observationValues(observations).get(VHF_CONTACT_LINK_IDS.caseType));
}

/** The VHF case Encounter's latest "Type of case", read fresh from HAPI. */
export async function vhfCaseTypeForEncounter(encounterId: string): Promise<string | null> {
  const resp = await FhirApi({
    url: `/Observation?encounter=Encounter/${encounterId}&code=${VHF_CONTACT_LINK_IDS.caseType}&_count=100`,
    headers: { "Cache-Control": "no-cache" },
  });
  const observations = (resp.data?.entry ?? []).map((e: any) => e.resource);
  return vhfCaseTypeFromObservations(observations);
}

export function isVhfEncounter(encounter: any): boolean {
  return conditionCodeForReason(encounter?.reasonCode?.[0]?.coding?.[0]?.code) === "VHF";
}

/**
 * True when the Encounter is a VHF record registered as a contact. Contacts get a Contact ID
 * (their case's EPID + "-C001"...) but no EPID, national Case ID, NPHL sync or case alert until
 * they are converted. Only an explicit "Contact" counts: mobile saves a case's answers with it, so a
 * missing answer is an older or incomplete case, which keeps the alert.
 */
export async function isVhfContactEncounter(encounter: any): Promise<boolean> {
  if (!encounter?.id || !isVhfEncounter(encounter)) return false;
  return (await vhfCaseTypeForEncounter(String(encounter.id))) === "contact";
}

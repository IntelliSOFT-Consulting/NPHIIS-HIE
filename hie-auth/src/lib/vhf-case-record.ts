/**
 * Fills in what a VHF case record needs once it has its EPID, for cases the mobile app saved
 * without its case form (a screened person converted to a case):
 * - the Patient's `vhf-case-information` identifier (the case Encounter id), which the line
 *   lists, contact lists and the Screenings page use to find VHF records;
 * - the EPID Observation, which the app shows and the admin lab lookup searches. The app
 *   saves it as a stub without the sequence number (e.g. "KEN-BUS-BUN-2026-VHF-").
 */
import { FhirApi } from "./utils";
import { getEpidValueFromEncounter, getEpidValueFromPatient } from "./epid-utils";

export const VHF_CASE_SYSTEM = "vhf-case-information";
const EPID_CODE = { system: "http://snomed.info/sct", code: "EPID", display: "EPID No" };

function vhfCaseIdentifier(encounterId: string) {
    return {
        type: { coding: [{ system: VHF_CASE_SYSTEM, code: VHF_CASE_SYSTEM, display: VHF_CASE_SYSTEM }], text: encounterId },
        system: VHF_CASE_SYSTEM,
        value: encounterId,
    };
}

async function save(resource: any): Promise<any> {
    const url = `/${resource.resourceType}${resource.id ? `/${resource.id}` : ""}`;
    const headers: Record<string, string> = resource.meta?.versionId ? { "If-Match": `W/"${resource.meta.versionId}"` } : {};
    const r = await FhirApi({ url, method: resource.id ? "PUT" : "POST", data: JSON.stringify(resource), headers });
    if (r.status !== "success") {
        const detail = r.data?.issue?.[0]?.diagnostics || JSON.stringify(r.data);
        throw new Error(`${url} save failed: ${detail}`);
    }
    return r.data;
}

export type CaseRecordResult = { patientTagged: boolean; epidObservations: number };

/** Idempotent: changes nothing when the record is already complete. */
export async function completeVhfCaseRecord(encounter: any): Promise<CaseRecordResult> {
    const patientId = encounter?.subject?.reference?.split("/")[1];
    const patient = patientId ? (await FhirApi({ url: `/Patient/${patientId}` })).data : undefined;
    if (!encounter?.id || patient?.resourceType !== "Patient") throw new Error(`Patient for Encounter/${encounter?.id} not found`);

    let patientTagged = false;
    if (!(patient.identifier ?? []).some((i: any) => i?.system === VHF_CASE_SYSTEM)) {
        await save({ ...patient, identifier: [...(patient.identifier ?? []), vhfCaseIdentifier(encounter.id)] });
        patientTagged = true;
    }

    const epid = getEpidValueFromEncounter(encounter) ?? getEpidValueFromPatient(patient);
    let epidObservations = 0;
    if (epid) {
        const found = (await FhirApi({ url: `/Observation?code=EPID&encounter=Encounter/${encounter.id}&_count=20` })).data;
        const observations: any[] = (found?.entry ?? []).map((e: any) => e.resource).filter(Boolean);
        for (const obs of observations) {
            if (obs.valueString === epid) continue;
            await save({ ...obs, valueString: epid, code: { ...obs.code, text: epid } });
            epidObservations++;
        }
        if (!observations.length) {
            await save({
                resourceType: "Observation",
                status: "final",
                code: { coding: [EPID_CODE], text: epid },
                subject: { reference: `Patient/${patient.id}` },
                encounter: { reference: `Encounter/${encounter.id}` },
                issued: new Date().toISOString(),
                valueString: epid,
            });
            epidObservations++;
        }
    }
    return { patientTagged, epidObservations };
}

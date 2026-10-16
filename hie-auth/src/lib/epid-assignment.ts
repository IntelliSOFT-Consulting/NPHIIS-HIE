import { FhirApi, FhirIdentifier } from "./utils";
import { processFollowUpObservations } from "./fhir";
import { generateCaseId } from "./caseIdTracker";
import {
  getEpidValueFromEncounter,
  patientHasOfficialEpid,
  EPID_SYSTEM_URI,
} from "./epid-utils";
import { notifyCaseSubmissionIfEnabled } from "./notification";
import {
  buildEpidFormattedId,
  resolveLocationNamesForEncounter,
} from "./epid-location-segment";
import { resolveCountyLocationSegment } from "./county-segment-registry";
import { conditionCodeForReason } from "./condition-codes";
import {
  caseIdIdentifier,
  CASE_ID_SYSTEM_URI,
  formatVhfCaseId,
  getCaseId,
  vhfCaseIdCounterKey,
  vhfCaseYear,
} from "./vhf-case-id";
import { queueCaseSync } from "./nphl-lab-sync";

/** Serialize EPID mutations per Patient to avoid concurrent double-allocation under subscription races. */
const epidQueues = new Map<string, Promise<unknown>>();

function enqueueEpidAssignmentForPatient<T>(
  patientId: string,
  task: () => Promise<T>,
): Promise<T> {
  const prev = epidQueues.get(patientId) ?? Promise.resolve(undefined);
  const chain = prev.then(task);
  epidQueues.set(
    patientId,
    chain.then(
      () => undefined as unknown,
      () => undefined as unknown,
    ),
  );
  return chain;
}

function padStart(str: string, targetLength: number, padChar: string = "0"): string {
  while (str.length < targetLength) {
    str = padChar + str;
  }
  return str;
}

function toThreeDigits(num: number): string {
  return padStart(num.toString(), 3, "0");
}

function getValidYear(dateString: string | undefined, fallbackDate: Date = new Date()): number {
  if (!dateString) {
    return fallbackDate.getFullYear();
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return fallbackDate.getFullYear();
  }
  return date.getFullYear();
}

function getSystemCreationTimestampValue(patient: any): string | undefined {
  const ids = patient?.identifier;
  if (!Array.isArray(ids)) return undefined;

  const withSystem = ids.find(
    (id: any) =>
      id?.system === "system-creation" &&
      typeof id?.value === "string" &&
      id.value.trim() !== "",
  );
  if (withSystem?.value) return String(withSystem.value).trim();

  const withCoding = ids.find(
    (id: any) =>
      id?.type?.coding?.some((c: any) => c.code === "system_creation") &&
      typeof id?.value === "string" &&
      id.value.trim() !== "",
  );
  if (withCoding?.value) return String(withCoding.value).trim();

  return undefined;
}

function stripNonOfficialTypedEpidFromPatientClone(patient: any): any {
  if (!patient?.identifier || !Array.isArray(patient.identifier)) return patient;
  const filtered = patient.identifier.filter((id: any) => {
    if (
      Array.isArray(id?.type?.coding) &&
      id.type.coding.some((coding: any) => coding.system === EPID_SYSTEM_URI)
    ) {
      /** Non-official typed EPID stubs are discarded before assigning the real EPID */
      return id.use === "official";
    }
    return true;
  });
  return { ...patient, identifier: filtered };
}

export type EpidAssignResult =
  | { kind: "success"; encounter: any }
  | { kind: "already_official_epid"; encounterId: string }
  /** retryable: false when retrying cannot help (e.g. the form never captured a sub-county). */
  | { kind: "error"; error: unknown; retryable?: boolean };

export type AssignEpidOptions = { notify?: boolean };

/**
 * Core EPID assignment for an Encounter resource (subscriptions, cron, manual retry).
 */
export async function assignEpidForEncounter(
  encounterDraft: any,
  opts?: AssignEpidOptions,
): Promise<EpidAssignResult> {
  const encounterId = encounterDraft?.id ? String(encounterDraft.id) : "";
  const patientId = encounterDraft?.subject?.reference?.split("/")[1];
  if (!patientId) {
    return { kind: "error", error: new Error("Encounter has no subject Patient reference") };
  }
  if (!encounterId) {
    return { kind: "error", error: new Error("Encounter must include resource id") };
  }

  return enqueueEpidAssignmentForPatient(patientId, async () => {
    const result = await assignEpidForEncounterLocked(encounterId, opts);
    if (result.kind === "error") return result;
    try {
      const encounter = await ensureVhfCaseId(encounterId);
      if (!encounter) return result;
      /** Samples synced before the EPID and Case ID existed are on hold; send them now rather than at the next poll. */
      queueCaseSync(encounterId);
      return result.kind === "success" ? { kind: "success", encounter } : result;
    } catch (error) {
      return { kind: "error", error };
    }
  });
}

async function assignEpidForEncounterLocked(
  encounterId: string,
  opts?: AssignEpidOptions,
): Promise<EpidAssignResult> {
  const encounterCodeSystem = EPID_SYSTEM_URI;

  const encResp = await FhirApi({ url: `/Encounter/${encounterId}` });
  const dataFresh = encResp.data;
  if (!dataFresh?.id || dataFresh.resourceType !== "Encounter") {
    return {
      kind: "error",
      error: new Error(`Encounter/${encounterId} not found or invalid`),
    };
  }

  const patientIdFromEnc = dataFresh?.subject?.reference?.split("/")[1];
  if (!patientIdFromEnc) {
    return { kind: "error", error: new Error("Encounter has no subject Patient reference") };
  }

  let patientResp = await FhirApi({ url: `/Patient/${patientIdFromEnc}` });
  let patient = patientResp.data;

  if (patientHasOfficialEpid(patient)) {
    console.log(
      `Patient ${patientIdFromEnc} already has an official id with ${encounterCodeSystem}`,
    );
    processFollowUpObservations(encounterId);
    return { kind: "already_official_epid", encounterId };
  }

  patient = stripNonOfficialTypedEpidFromPatientClone(patient);

  const encounterEpidValue = getEpidValueFromEncounter(dataFresh);
  if (encounterEpidValue) {
    const syncId = FhirIdentifier(
      encounterCodeSystem,
      "EPID",
      "Epidemiological ID",
      encounterEpidValue,
      true,
    );
    const patientBody = {
      ...patient,
      identifier: [...(patient?.identifier || []), syncId],
    };
    const patientHeaders: Record<string, string> = {};
    if (patient?.meta?.versionId) {
      patientHeaders["If-Match"] = `W/"${patient.meta.versionId}"`;
    }
    const patientPut = await FhirApi({
      url: `/Patient/${patientIdFromEnc}`,
      method: "PUT",
      data: JSON.stringify(patientBody),
      headers: patientHeaders,
    });
    if (patientPut.status !== "success") {
      const detail =
        patientPut.data?.issue?.[0]?.diagnostics ||
        patientPut.data?.issue?.[0]?.details?.text ||
        JSON.stringify(patientPut.data);
      console.error("Patient EPID sync from Encounter failed:", patientPut.statusText, detail);
      return {
        kind: "error",
        error: new Error(
          `Could not copy EPID from Encounter to Patient (${patientPut.statusText}): ${detail}`,
        ),
      };
    }
    console.log("Synced EPID from Encounter to Patient:", encounterEpidValue);
    processFollowUpObservations(encounterId);
    const encRefresh = await FhirApi({ url: `/Encounter/${encounterId}` });
    return { kind: "success", encounter: encRefresh.data ?? dataFresh };
  }

  patientResp = await FhirApi({ url: `/Patient/${patientIdFromEnc}` });
  patient = stripNonOfficialTypedEpidFromPatientClone(patientResp.data);
  if (patientHasOfficialEpid(patient)) {
    processFollowUpObservations(encounterId);
    return { kind: "already_official_epid", encounterId };
  }

  const reasonCode = dataFresh?.reasonCode?.[0]?.coding?.[0]?.code;
  const caseCondition = conditionCodeForReason(reasonCode);

  const location = await resolveLocationNamesForEncounter(encounterId, FhirApi);
  if (!location) {
    return {
      kind: "error",
      error: new Error(
        "Could not resolve country/county/subcounty from Observation a3-sub-county Location chain",
      ),
      retryable: false,
    };
  }
  const { countryName, countyName, subCountyName } = location;

  let onsetDate = getSystemCreationTimestampValue(patient);
  let normalizedOnsetDate = onsetDate;
  if (onsetDate && typeof onsetDate === "string") {
    normalizedOnsetDate = onsetDate.split(" ")[0];
  }

  if (!normalizedOnsetDate && patient?.birthDate) {
    normalizedOnsetDate = patient.birthDate;
    console.log("Using Patient birthDate as fallback for EPID year");
  }

  const yearForId = getValidYear(normalizedOnsetDate);

  if (!onsetDate) {
    console.warn(
      `Patient ${patientIdFromEnc} missing system-creation identifier. Using fallback for EPID year: ${yearForId}`,
    );
  }

  const caseSeq = await generateCaseId(countryName, countyName, subCountyName, caseCondition);

  const countySegment = await resolveCountyLocationSegment(FhirApi, countyName);

  const formattedId = buildEpidFormattedId(
    countryName,
    countySegment,
    subCountyName,
    yearForId,
    caseCondition,
    caseSeq,
  );

  const newId = FhirIdentifier(encounterCodeSystem, "EPID", "Epidemiological ID", formattedId, true);

  patientResp = await FhirApi({ url: `/Patient/${patientIdFromEnc}` });
  patient = stripNonOfficialTypedEpidFromPatientClone(patientResp.data);

  if (patientHasOfficialEpid(patient)) {
    processFollowUpObservations(encounterId);
    return { kind: "already_official_epid", encounterId };
  }

  const patientBody = {
    ...patient,
    identifier: [...(patient?.identifier || []), newId],
  };

  const patientHeaders: Record<string, string> = {};
  if (patient?.meta?.versionId) {
    patientHeaders["If-Match"] = `W/"${patient.meta.versionId}"`;
  }

  const patientPut = await FhirApi({
    url: `/Patient/${patientIdFromEnc}`,
    method: "PUT",
    data: JSON.stringify(patientBody),
    headers: patientHeaders,
  });

  if (patientPut.status !== "success") {
    const detail =
      patientPut.data?.issue?.[0]?.diagnostics ||
      patientPut.data?.issue?.[0]?.details?.text ||
      JSON.stringify(patientPut.data);
    console.error("Patient EPID PUT failed:", patientPut.statusText, detail);
    return {
      kind: "error",
      error: new Error(
        `Patient EPID update failed (${patientPut.statusText}): ${detail}. Encounter was not updated.`,
      ),
    };
  }

  console.log("updatedPatient:", newId);

  /** Fresh Encounter for If-Match and identifier merge */
  const encForPut = await FhirApi({ url: `/Encounter/${encounterId}` });
  let data = encForPut.data;

  const identifiers = Array.isArray(data.identifier) ? data.identifier : [];
  data.identifier = identifiers.filter((id: any) => id.system !== encounterCodeSystem);
  data.identifier.push(newId);

  const encounterBody = {
    ...data,
    identifier: [{ system: encounterCodeSystem, value: formattedId }],
  };
  const encounterHeaders: Record<string, string> = {};
  if (data?.meta?.versionId) {
    encounterHeaders["If-Match"] = `W/"${data.meta.versionId}"`;
  }

  const encounterPut = await FhirApi({
    url: `/Encounter/${encounterId}`,
    method: "PUT",
    data: JSON.stringify(encounterBody),
    headers: encounterHeaders,
  });

  if (encounterPut.status !== "success") {
    const detail =
      encounterPut.data?.issue?.[0]?.diagnostics ||
      encounterPut.data?.issue?.[0]?.details?.text ||
      JSON.stringify(encounterPut.data);
    console.error(
      "Encounter EPID PUT failed after Patient was updated:",
      encounterPut.statusText,
      detail,
    );
    return {
      kind: "error",
      error: new Error(
        `Encounter EPID update failed (${encounterPut.statusText}): ${detail}. Patient may already have EPID identifier.`,
      ),
    };
  }

  processFollowUpObservations(encounterId);

  if (opts?.notify) {
    void notifyCaseSubmissionIfEnabled(encounterPut.data, {
      epid: formattedId,
      diseaseCondition: caseCondition,
      countyName,
      subCountyName,
    }).catch((e) =>
      console.error("[CaseSubmissionNotify] Background notification failed:", e),
    );
  }

  return { kind: "success", encounter: encounterPut.data };
}

/** Case ID an Encounter held in an earlier version, e.g. before a mobile re-sync overwrote its identifiers. */
async function previousCaseId(encounterId: string): Promise<string | undefined> {
  const history = await FhirApi({ url: `/Encounter/${encounterId}/_history?_count=100` });
  for (const entry of history.data?.entry ?? []) {
    const caseId = getCaseId(entry?.resource);
    if (caseId) return caseId;
  }
  return undefined;
}

/** Adds the Case ID to a resource that lacks one; returns the saved resource. */
async function putCaseId(resource: any, caseId: string): Promise<any> {
  const url = `/${resource.resourceType}/${resource.id}`;
  const identifiers = Array.isArray(resource.identifier) ? resource.identifier : [];
  const body = {
    ...resource,
    identifier: [...identifiers.filter((id: any) => id?.system !== CASE_ID_SYSTEM_URI), caseIdIdentifier(caseId)],
  };
  const headers: Record<string, string> = {};
  if (resource?.meta?.versionId) {
    headers["If-Match"] = `W/"${resource.meta.versionId}"`;
  }

  const put = await FhirApi({ url, method: "PUT", data: JSON.stringify(body), headers });
  if (put.status !== "success") {
    const detail =
      put.data?.issue?.[0]?.diagnostics || put.data?.issue?.[0]?.details?.text || JSON.stringify(put.data);
    throw new Error(`${resource.resourceType} Case ID update failed (${put.statusText}): ${detail}`);
  }
  return put.data;
}

/**
 * Gives a VHF case its national Case ID, once, on the case Encounter and the Patient; the EPID
 * is unchanged. Returns the Encounter when it is a VHF case, else undefined.
 */
async function ensureVhfCaseId(encounterId: string): Promise<any | undefined> {
  const encResp = await FhirApi({ url: `/Encounter/${encounterId}` });
  let encounter = encResp.data;
  if (conditionCodeForReason(encounter?.reasonCode?.[0]?.coding?.[0]?.code) !== "VHF") return undefined;

  const patientId = encounter?.subject?.reference?.split("/")[1];
  const patientResp = await FhirApi({ url: `/Patient/${patientId}` });
  const patient = patientResp.data;
  if (!patient?.id) throw new Error(`Patient/${patientId} not found for Case ID`);

  let caseId = getCaseId(encounter) ?? (await previousCaseId(encounterId));
  if (!caseId) {
    const year = vhfCaseYear(getSystemCreationTimestampValue(patient), encounter?.period?.start);
    const key = vhfCaseIdCounterKey(year);
    const seq = await generateCaseId(key.country, key.county, key.subCounty, key.condition);
    caseId = formatVhfCaseId(year, seq);
    console.log(`Assigned VHF Case ID ${caseId} to Encounter/${encounterId}`);
  }

  if (getCaseId(encounter) !== caseId) encounter = await putCaseId(encounter, caseId);
  if (!getCaseId(patient)) await putCaseId(patient, caseId);
  return encounter;
}

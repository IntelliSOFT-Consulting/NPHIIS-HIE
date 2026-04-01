import { FhirApi, FhirIdentifier } from "./utils";
import { processFollowUpObservations } from "./fhir";
import { generateCaseId } from "./caseIdTracker";

const POSSIBLE_REASON_CODES: Record<string, string> = {
  "Measles Case Information": "MEA",
  "MOH 505 Reporting Form": "MOH505",
  "AFP Case Information": "AFP",
};

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

/**
 * Authoritative "case creation" time for EPID year: the `value` on the system-creation identifier
 * (not meta.lastUpdated). Matches by identifier.system and/or type coding code system_creation.
 */
function getSystemCreationTimestampValue(patient: any): string | undefined {
  const ids = patient?.identifier;
  if (!Array.isArray(ids)) return undefined;

  const withSystem = ids.find(
    (id: any) =>
      id?.system === "system-creation" &&
      typeof id?.value === "string" &&
      id.value.trim() !== ""
  );
  if (withSystem?.value) return String(withSystem.value).trim();

  const withCoding = ids.find(
    (id: any) =>
      id?.type?.coding?.some((c: any) => c.code === "system_creation") &&
      typeof id?.value === "string" &&
      id.value.trim() !== ""
  );
  if (withCoding?.value) return String(withCoding.value).trim();

  return undefined;
}

/** EPID string carried on Encounter.identifier (simple or typed). */
function getEpidValueFromEncounter(encounter: any): string | undefined {
  const ids = encounter?.identifier;
  if (!Array.isArray(ids)) return undefined;
  for (const id of ids) {
    if (id?.system === "http://hie.org/identifiers/EPID" && typeof id?.value === "string" && id.value.trim()) {
      return String(id.value).trim();
    }
    if (
      Array.isArray(id?.type?.coding) &&
      id.type.coding.some((c: any) => c.system === "http://hie.org/identifiers/EPID") &&
      typeof id?.value === "string" &&
      id.value.trim()
    ) {
      return String(id.value).trim();
    }
  }
  return undefined;
}

export type EpidAssignResult =
  | { kind: "success"; encounter: any }
  | { kind: "already_official_epid"; encounterId: string }
  | { kind: "error"; error: unknown };

/**
 * Core EPID assignment for an Encounter resource (same rules as subscription /assign-ids).
 */
export async function assignEpidForEncounter(data: any): Promise<EpidAssignResult> {
  const encounterCodeSystem = "http://hie.org/identifiers/EPID";
  const reasonCode = data?.reasonCode?.[0]?.coding?.[0]?.code;

  const patientId = data?.subject?.reference?.split("/")[1];
  if (!patientId) {
    return { kind: "error", error: new Error("Encounter has no subject Patient reference") };
  }

  let patient = (await FhirApi({ url: `/Patient/${patientId}` })).data;

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
      `Patient ${patientId} missing system-creation identifier. Using fallback for EPID year: ${yearForId}`
    );
  }

  const epidIdentifier = patient?.identifier?.find((id: any) =>
    id.type?.coding?.some((coding: any) => coding.system === "http://hie.org/identifiers/EPID")
  );

  if (epidIdentifier?.use === "official") {
    console.log("Patient already has an official id with the system http://hie.org/identifiers/EPID");
    processFollowUpObservations(data?.id);
    return { kind: "already_official_epid", encounterId: String(data?.id) };
  }

  if (epidIdentifier) {
    patient.identifier = patient.identifier.filter(
      (id: any) =>
        !(
          Array.isArray(id?.type?.coding) &&
          id.type.coding.some((coding: any) => coding.system === "http://hie.org/identifiers/EPID")
        )
    );
  }

  const encounterEpidValue = getEpidValueFromEncounter(data);
  if (encounterEpidValue) {
    const syncId = FhirIdentifier(
      encounterCodeSystem,
      "EPID",
      "Epidemiological ID",
      encounterEpidValue,
      true
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
      console.error("Patient EPID sync from Encounter failed:", patientPut.statusText, detail);
      return {
        kind: "error",
        error: new Error(
          `Could not copy EPID from Encounter to Patient (${patientPut.statusText}): ${detail}`
        ),
      };
    }
    console.log("Synced EPID from Encounter to Patient:", encounterEpidValue);
    processFollowUpObservations(data?.id);
    const encRefresh = await FhirApi({ url: `/Encounter/${data?.id}` });
    return { kind: "success", encounter: encRefresh.data ?? data };
  }

  const rc = reasonCode ? String(reasonCode) : "";
  const caseCondition =
    POSSIBLE_REASON_CODES[rc] || (rc ? rc.toUpperCase().slice(0, 3) : "UNK");

  const subCountyCode = "a3-sub-county";
  const subCountyObservation = (
    await FhirApi({ url: `/Observation?code=${subCountyCode}&encounter=${data?.id}` })
  ).data?.entry?.[0]?.resource;
  const subCounty = (
    await FhirApi({ url: `/Location?name=${subCountyObservation?.valueString}` })
  ).data?.entry?.[0]?.resource;
  const county = (await FhirApi({ url: `/Location/${subCounty?.partOf?.reference?.split("/")[1]}` }))
    .data;
  const country = (await FhirApi({ url: `/Location/${county?.partOf?.reference?.split("/")[1]}` }))
    .data;

  const subCountyName = subCounty?.name?.toUpperCase()?.trim();
  const countyName = county?.name?.toUpperCase()?.trim();
  const countryName = country?.name?.toUpperCase()?.trim();

  const caseId = await generateCaseId(countryName, countyName, subCountyName, caseCondition);

  const formattedId = `${countryName.substring(0, 3)}-${countyName.substring(0, 3)}-${subCountyName.substring(0, 3)}-${yearForId}-${caseCondition}-${toThreeDigits(caseId)}`;

  const newId = FhirIdentifier(encounterCodeSystem, "EPID", "Epidemiological ID", formattedId, true);

  const patientBody = {
    ...patient,
    identifier: [...(patient?.identifier || []), newId],
  };

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
    console.error("Patient EPID PUT failed:", patientPut.statusText, detail);
    return {
      kind: "error",
      error: new Error(
        `Patient EPID update failed (${patientPut.statusText}): ${detail}. Encounter was not updated.`
      ),
    };
  }

  console.log("updatedPatient:", newId);

  const identifiers = Array.isArray(data.identifier) ? data.identifier : [];
  data.identifier = identifiers.filter((id: any) => id.system !== encounterCodeSystem);
  data.identifier.push(newId);

  const encounterBody = { ...data, identifier: [{ system: encounterCodeSystem, value: formattedId }] };
  const encounterHeaders: Record<string, string> = {};
  if (data?.meta?.versionId) {
    encounterHeaders["If-Match"] = `W/"${data.meta.versionId}"`;
  }

  const encounterPut = await FhirApi({
    url: `/Encounter/${data?.id}`,
    method: "PUT",
    data: JSON.stringify(encounterBody),
    headers: encounterHeaders,
  });

  if (encounterPut.status !== "success") {
    const detail =
      encounterPut.data?.issue?.[0]?.diagnostics ||
      encounterPut.data?.issue?.[0]?.details?.text ||
      JSON.stringify(encounterPut.data);
    console.error("Encounter EPID PUT failed after Patient was updated:", encounterPut.statusText, detail);
    return {
      kind: "error",
      error: new Error(
        `Encounter EPID update failed (${encounterPut.statusText}): ${detail}. Patient may already have EPID identifier.`
      ),
    };
  }

  processFollowUpObservations(data?.id);
  return { kind: "success", encounter: encounterPut.data };
}

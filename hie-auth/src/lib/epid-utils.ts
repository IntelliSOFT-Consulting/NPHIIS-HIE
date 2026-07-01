/** Canonical EPID identifier system URIs — matches FhirIdentifier in utils.ts */
export const EPID_SYSTEM_URI = "http://hie.org/identifiers/EPID";

/**
 * Whether a Patient or Encounter Identifier entry is an EPID stamped as official use.
 */
export function identifierIsOfficialEpid(ident: any): boolean {
  if (!ident || ident.use !== "official") return false;
  if (
    typeof ident.system === "string" &&
    ident.system === EPID_SYSTEM_URI &&
    typeof ident.value === "string" &&
    ident.value.trim()
  ) {
    return true;
  }
  if (
    Array.isArray(ident.type?.coding) &&
    typeof ident.value === "string" &&
    ident.value.trim() &&
    ident.type.coding.some((c: any) => c.system === EPID_SYSTEM_URI)
  ) {
    return true;
  }
  return false;
}

/** True if Patient already has an official EPID (simple or typed identifier). */
export function patientHasOfficialEpid(patient: any): boolean {
  const ids = patient?.identifier;
  if (!Array.isArray(ids)) return false;
  return ids.some(identifierIsOfficialEpid);
}

/** Official EPID value on Patient.identifier (FHIR Simple or Typed identifier variants). */
export function getEpidValueFromPatient(patient: any): string | undefined {
  const ids = patient?.identifier;
  if (!Array.isArray(ids)) return undefined;
  for (const id of ids) {
    if (!identifierIsOfficialEpid(id)) continue;
    if (typeof id?.value === "string" && id.value.trim()) {
      return String(id.value).trim();
    }
  }
  return undefined;
}

/**
 * EPID value on Encounter.identifier (FHIR Simple or Typed identifier variants).
 */
export function getEpidValueFromEncounter(encounter: any): string | undefined {
  const ids = encounter?.identifier;
  if (!Array.isArray(ids)) return undefined;
  for (const id of ids) {
    if (
      id?.system === EPID_SYSTEM_URI &&
      typeof id?.value === "string" &&
      id.value.trim()
    ) {
      return String(id.value).trim();
    }
    if (
      Array.isArray(id?.type?.coding) &&
      id.type.coding.some((c: any) => c.system === EPID_SYSTEM_URI) &&
      typeof id?.value === "string" &&
      id.value.trim()
    ) {
      return String(id.value).trim();
    }
  }
  return undefined;
}

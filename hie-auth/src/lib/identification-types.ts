/** CR/IPRS identification_type values accepted by GET /provider/patients/validate */
export const IDENTIFICATION_TYPES = [
    "Temporary ID",
    "Alien ID",
    "Refugee ID",
    "Mandate Number",
    "Birth Certificate",
    "National ID",
    "Birth Notification",
    "ClientRegistry ID",
    "Passport",
] as const;

export type IdentificationType = (typeof IDENTIFICATION_TYPES)[number];

export const IDENTIFICATION_TYPE_SYSTEM =
    "http://nphiis.health.go.ke/fhir/CodeSystem/identification-type";

/** CodeSystem codes aligned with packages/fhir-ig IdentificationTypeCS */
const TYPE_TO_CODE: Record<IdentificationType, string> = {
    "Temporary ID": "TemporaryID",
    "Alien ID": "AlienID",
    "Refugee ID": "RefugeeID",
    "Mandate Number": "MandateNumber",
    "Birth Certificate": "BirthCertificate",
    "National ID": "NationalID",
    "Birth Notification": "BirthNotification",
    "ClientRegistry ID": "ClientRegistryID",
    Passport: "Passport",
};

export const CLIENT_REGISTRY_PATIENT_PROFILE =
    "http://nphiis.health.go.ke/fhir/StructureDefinition/client-registry-patient";

export const IPRS_PATIENT_PROFILE =
    "http://nphiis.health.go.ke/fhir/StructureDefinition/iprs-patient";

export const CLIENT_REGISTRY_IDENTIFIER_SYSTEM =
    "http://nphiis.health.go.ke/fhir/identifier/client-registry";

export const IPRS_IDENTIFIER_SYSTEM =
    "http://nphiis.health.go.ke/fhir/identifier/iprs";

export function isIdentificationType(value: string): value is IdentificationType {
    return (IDENTIFICATION_TYPES as readonly string[]).includes(value);
}

export function identificationTypeCode(type: IdentificationType): string {
    return TYPE_TO_CODE[type];
}

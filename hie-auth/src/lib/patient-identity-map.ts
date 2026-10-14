import {
    CLIENT_REGISTRY_IDENTIFIER_SYSTEM,
    CLIENT_REGISTRY_PATIENT_PROFILE,
    IdentificationType,
    IDENTIFICATION_TYPE_SYSTEM,
    identificationTypeCode,
    IPRS_IDENTIFIER_SYSTEM,
    IPRS_PATIENT_PROFILE,
} from "./identification-types";

export type PatientIdentitySource = "client-registry" | "iprs";

export const PATIENT_IDENTITY_SOURCE_SYSTEM =
    "http://nphiis.health.go.ke/fhir/CodeSystem/patient-identity-source";

export type FhirPatient = {
    resourceType: "Patient";
    id?: string;
    meta: {
        profile: string[];
        source?: string;
        tag?: Array<{ system: string; code: string; display: string }>;
    };
    identifier: Array<{
        system: string;
        value: string;
        type?: {
            text: string;
            coding: Array<{ system: string; code: string; display: string }>;
        };
    }>;
    name?: Array<{ use?: string; family?: string; given?: string[]; text?: string }>;
    gender?: string;
    birthDate?: string;
    telecom?: Array<{ system?: string; value?: string; use?: string }>;
    address?: Array<{
        use?: string;
        line?: string[];
        city?: string;
        district?: string;
        state?: string;
        postalCode?: string;
        country?: string;
        text?: string;
    }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

/** Unwrap common list/envelope shapes from CR/IPRS JSON. */
export function unwrapPatientPayload(raw: unknown): Record<string, unknown> {
    if (Array.isArray(raw) && raw.length > 0) {
        return asRecord(raw[0]) ?? { value: raw[0] };
    }
    const root = asRecord(raw);
    if (!root) return {};

    for (const key of ["patient", "result", "data", "person"] as const) {
        const nested = root[key];
        if (Array.isArray(nested) && nested.length > 0) {
            return asRecord(nested[0]) ?? root;
        }
        const nestedObj = asRecord(nested);
        if (nestedObj) return nestedObj;
    }

    for (const key of ["results", "patients", "items"] as const) {
        const list = root[key];
        if (Array.isArray(list) && list.length > 0) {
            return asRecord(list[0]) ?? root;
        }
    }

    return root;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const v = obj[key];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
    return undefined;
}

function normalizeGender(raw?: string): string | undefined {
    if (!raw) return undefined;
    const g = raw.trim().toLowerCase();
    if (g === "m" || g === "male") return "male";
    if (g === "f" || g === "female") return "female";
    if (g === "other") return "other";
    if (g === "unknown" || g === "u") return "unknown";
    return undefined;
}

function normalizeBirthDate(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    // DD/MM/YYYY or DD-MM-YYYY
    const m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const [, d, mo, y] = m;
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return trimmed;
}

function buildName(obj: Record<string, unknown>) {
    const text = pickString(obj, ["full_name", "fullName", "name", "client_name"]);
    const family = pickString(obj, ["last_name", "lastName", "surname", "family_name", "familyName"]);
    const first = pickString(obj, ["first_name", "firstName", "given_name", "givenName"]);
    const middle = pickString(obj, ["middle_name", "middleName", "other_name", "otherName", "other_names", "otherNames"]);

    const given = [first, middle].filter(Boolean) as string[];
    if (!family && given.length === 0 && !text) return undefined;

    return [
        {
            use: "official" as const,
            ...(family ? { family } : {}),
            ...(given.length ? { given } : {}),
            ...(text ? { text } : !family && given.length ? { text: given.join(" ") } : {}),
        },
    ];
}

function buildTelecom(obj: Record<string, unknown>) {
    const telecom: FhirPatient["telecom"] = [];
    const phone = pickString(obj, ["phone", "phone_number", "phoneNumber", "mobile", "msisdn"]);
    const email = pickString(obj, ["email", "email_address", "emailAddress"]);
    if (phone) telecom.push({ system: "phone", value: phone });
    if (email) telecom.push({ system: "email", value: email });
    return telecom.length ? telecom : undefined;
}

function buildAddress(obj: Record<string, unknown>) {
    const line = pickString(obj, ["address", "address_line", "addressLine", "physical_address"]);
    const city = pickString(obj, ["city", "town", "ward"]);
    const district = pickString(obj, ["district", "sub_county", "subCounty"]);
    const state = pickString(obj, ["county", "state", "province"]);
    const postalCode = pickString(obj, ["postal_code", "postalCode"]);
    const country = pickString(obj, ["country"]) || "KE";

    if (!line && !city && !district && !state && !postalCode) return undefined;

    return [
        {
            use: "home" as const,
            ...(line ? { line: [line], text: line } : {}),
            ...(city ? { city } : {}),
            ...(district ? { district } : {}),
            ...(state ? { state } : {}),
            ...(postalCode ? { postalCode } : {}),
            country,
        },
    ];
}

function buildIdentifier(
    identificationNumber: string,
    identificationType: IdentificationType,
    system: string,
) {
    const code = identificationTypeCode(identificationType);
    return {
        system,
        value: identificationNumber,
        type: {
            text: identificationType,
            coding: [
                {
                    system: IDENTIFICATION_TYPE_SYSTEM,
                    code,
                    display: identificationType,
                },
            ],
        },
    };
}

const SOURCE_DISPLAY: Record<PatientIdentitySource, string> = {
    "client-registry": "Client Registry",
    iprs: "IPRS",
};

function mapToPatient(
    raw: unknown,
    params: {
        identificationNumber: string;
        identificationType: IdentificationType;
        profileUrl: string;
        identifierSystem: string;
        source: PatientIdentitySource;
    },
): FhirPatient {
    const obj = unwrapPatientPayload(raw);
    const idValue =
        pickString(obj, [
            "identification_number",
            "identificationNumber",
            "id_number",
            "idNumber",
            "national_id",
            "nationalId",
            "document_number",
            "documentNumber",
        ]) || params.identificationNumber;

    const upstreamId = pickString(obj, ["id", "uuid", "client_id", "clientId", "patient_id", "patientId"]);

    const patient: FhirPatient = {
        resourceType: "Patient",
        ...(upstreamId ? { id: upstreamId } : {}),
        meta: {
            profile: [params.profileUrl],
            source: params.source,
            tag: [
                {
                    system: PATIENT_IDENTITY_SOURCE_SYSTEM,
                    code: params.source,
                    display: SOURCE_DISPLAY[params.source],
                },
            ],
        },
        identifier: [
            buildIdentifier(idValue, params.identificationType, params.identifierSystem),
        ],
    };

    const name = buildName(obj);
    if (name) patient.name = name;

    const gender = normalizeGender(
        pickString(obj, ["gender", "sex", "Sex", "Gender"]),
    );
    if (gender) patient.gender = gender;

    const birthDate = normalizeBirthDate(
        pickString(obj, ["birth_date", "birthDate", "date_of_birth", "dateOfBirth", "dob", "DOB"]),
    );
    if (birthDate) patient.birthDate = birthDate;

    const telecom = buildTelecom(obj);
    if (telecom) patient.telecom = telecom;

    const address = buildAddress(obj);
    if (address) patient.address = address;

    return patient;
}

export function mapCrResponseToPatient(
    raw: unknown,
    identificationNumber: string,
    identificationType: IdentificationType,
): FhirPatient {
    return mapToPatient(raw, {
        identificationNumber,
        identificationType,
        profileUrl: CLIENT_REGISTRY_PATIENT_PROFILE,
        identifierSystem: CLIENT_REGISTRY_IDENTIFIER_SYSTEM,
        source: "client-registry",
    });
}

export function mapIprsResponseToPatient(
    raw: unknown,
    identificationNumber: string,
    identificationType: IdentificationType,
): FhirPatient {
    return mapToPatient(raw, {
        identificationNumber,
        identificationType,
        profileUrl: IPRS_PATIENT_PROFILE,
        identifierSystem: IPRS_IDENTIFIER_SYSTEM,
        source: "iprs",
    });
}

import {
    IDENTIFICATION_TYPE_SYSTEM,
    IdentificationType,
    identificationTypeCode,
    isIdentificationType,
} from "./identification-types";

const BASE = "http://nphiis.health.go.ke/fhir";

/** Tag added to every Patient/QuestionnaireResponse that came through screening. */
export const SCREENING_TAG_SYSTEM = `${BASE}/CodeSystem/record-origin`;
export const SCREENING_TAG_CODE = "screened";
export const SCREENING_TAG = {
    system: SCREENING_TAG_SYSTEM,
    code: SCREENING_TAG_CODE,
    display: "Screened",
};

export const SCREENED_PATIENT_PROFILE = `${BASE}/StructureDefinition/screened-patient`;
export const SCREENING_RESPONSE_PROFILE = `${BASE}/StructureDefinition/traveller-screening-response`;
export const SCREENING_QUESTIONNAIRE_URL = `${BASE}/Questionnaire/traveller-screening`;
export const SCREENING_ID_SYSTEM = `${BASE}/identifier/screening-id`;
export const SCREENING_IDENTIFIER_SYSTEM = `${BASE}/identifier/screening-patient`;
export const SCREENING_OUTCOME_SYSTEM = `${BASE}/CodeSystem/screening-outcome`;
export const SYMPTOM_SYSTEM = `${BASE}/CodeSystem/screening-symptom`;

export const SCREENING_OUTCOMES = ["cleared", "referred", "suspected"] as const;
export const POINT_OF_ENTRY_TYPES = ["airport", "seaport", "border", "facility", "community"] as const;

export const SYMPTOM_CODES = [
    "fever",
    "cough",
    "sore-throat",
    "difficulty-breathing",
    "headache",
    "fatigue",
    "muscle-pain",
    "vomiting",
    "diarrhoea",
    "abdominal-pain",
    "rash",
    "bleeding",
    "jaundice",
    "confusion",
    "other",
] as const;

export type ScreeningPayload = {
    screeningId: string;
    screenedAt?: string;
    outcome?: (typeof SCREENING_OUTCOMES)[number];
    pointOfEntry?: { name: string; type?: (typeof POINT_OF_ENTRY_TYPES)[number]; locationId?: string };
    patient: {
        identifiers: Array<{ type: IdentificationType; value: string }>;
        givenNames?: string[];
        familyName?: string;
        gender?: "male" | "female" | "other" | "unknown";
        birthDate?: string;
        phone?: string;
        email?: string;
        nationality?: string;
        address?: { county?: string; subCounty?: string; ward?: string; village?: string; text?: string };
    };
    travelHistory?: {
        hasTravelled: boolean;
        trips?: Array<{
            country: string;
            city?: string;
            departureDate?: string;
            arrivalDate?: string;
            purpose?: string;
        }>;
    };
    signsAndSymptoms?: {
        temperatureCelsius?: number;
        symptoms?: Array<{
            code: (typeof SYMPTOM_CODES)[number];
            present: boolean;
            onsetDate?: string;
            note?: string;
        }>;
    };
};

const isObj = (v: unknown): v is Record<string, any> =>
    v != null && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

export function validateScreeningPayload(
    body: unknown,
): { ok: true; value: ScreeningPayload } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    if (!isObj(body)) return { ok: false, errors: ["body must be a JSON object"] };

    if (!isStr(body.screeningId)) errors.push("screeningId is required (client-generated unique id, used for idempotency)");
    if (body.screenedAt != null && !(isStr(body.screenedAt) && DATETIME_RE.test(body.screenedAt)))
        errors.push("screenedAt must be an ISO 8601 date/datetime");
    if (body.outcome != null && !(SCREENING_OUTCOMES as readonly string[]).includes(body.outcome))
        errors.push(`outcome must be one of ${SCREENING_OUTCOMES.join(", ")}`);

    if (body.pointOfEntry != null) {
        const p = body.pointOfEntry;
        if (!isObj(p) || !isStr(p.name)) errors.push("pointOfEntry.name is required when pointOfEntry is given");
        else if (p.type != null && !(POINT_OF_ENTRY_TYPES as readonly string[]).includes(p.type))
            errors.push(`pointOfEntry.type must be one of ${POINT_OF_ENTRY_TYPES.join(", ")}`);
    }

    const patient = body.patient;
    if (!isObj(patient)) {
        errors.push("patient is required");
    } else {
        if (!Array.isArray(patient.identifiers) || patient.identifiers.length === 0) {
            errors.push("patient.identifiers must contain at least one { type, value }");
        } else {
            patient.identifiers.forEach((id: any, i: number) => {
                if (!isObj(id) || !isStr(id.value)) errors.push(`patient.identifiers[${i}].value is required`);
                else if (!isStr(id.type) || !isIdentificationType(id.type))
                    errors.push(`patient.identifiers[${i}].type must be a valid identification type`);
            });
        }
        if (patient.birthDate != null && !(isStr(patient.birthDate) && DATE_RE.test(patient.birthDate)))
            errors.push("patient.birthDate must be YYYY-MM-DD");
        if (patient.gender != null && !["male", "female", "other", "unknown"].includes(patient.gender))
            errors.push("patient.gender must be male, female, other or unknown");
        if (patient.givenNames != null && !(Array.isArray(patient.givenNames) && patient.givenNames.every(isStr)))
            errors.push("patient.givenNames must be an array of strings");
    }

    const travel = body.travelHistory;
    if (travel != null) {
        if (!isObj(travel) || typeof travel.hasTravelled !== "boolean") {
            errors.push("travelHistory.hasTravelled (boolean) is required when travelHistory is given");
        } else if (travel.trips != null) {
            if (!Array.isArray(travel.trips)) errors.push("travelHistory.trips must be an array");
            else
                travel.trips.forEach((t: any, i: number) => {
                    if (!isObj(t) || !isStr(t.country)) errors.push(`travelHistory.trips[${i}].country is required`);
                    else
                        for (const k of ["departureDate", "arrivalDate"])
                            if (t[k] != null && !(isStr(t[k]) && DATE_RE.test(t[k])))
                                errors.push(`travelHistory.trips[${i}].${k} must be YYYY-MM-DD`);
                });
        }
    }

    const ss = body.signsAndSymptoms;
    if (ss != null) {
        if (!isObj(ss)) errors.push("signsAndSymptoms must be an object");
        else {
            if (ss.temperatureCelsius != null && !(typeof ss.temperatureCelsius === "number" && ss.temperatureCelsius >= 25 && ss.temperatureCelsius <= 45))
                errors.push("signsAndSymptoms.temperatureCelsius must be a number between 25 and 45");
            if (ss.symptoms != null) {
                if (!Array.isArray(ss.symptoms)) errors.push("signsAndSymptoms.symptoms must be an array");
                else
                    ss.symptoms.forEach((s: any, i: number) => {
                        if (!isObj(s) || !(SYMPTOM_CODES as readonly string[]).includes(s.code))
                            errors.push(`signsAndSymptoms.symptoms[${i}].code must be one of ${SYMPTOM_CODES.join(", ")}`);
                        else {
                            if (typeof s.present !== "boolean") errors.push(`signsAndSymptoms.symptoms[${i}].present (boolean) is required`);
                            if (s.onsetDate != null && !(isStr(s.onsetDate) && DATE_RE.test(s.onsetDate)))
                                errors.push(`signsAndSymptoms.symptoms[${i}].onsetDate must be YYYY-MM-DD`);
                        }
                    });
            }
        }
    }

    return errors.length ? { ok: false, errors } : { ok: true, value: body as unknown as ScreeningPayload };
}

export function buildScreeningIdentifier(type: IdentificationType, value: string) {
    const code = identificationTypeCode(type);
    return {
        system: SCREENING_IDENTIFIER_SYSTEM,
        value: value.trim(),
        type: {
            text: type,
            coding: [{ system: IDENTIFICATION_TYPE_SYSTEM, code, display: type }],
        },
    };
}

/** True when the Patient already carries this identification type + number (on any system). */
export function patientHasIdentifier(patient: any, type: IdentificationType, value: string): boolean {
    const code = identificationTypeCode(type);
    return (patient?.identifier ?? []).some((id: any) => {
        if (String(id?.value ?? "").trim() !== value.trim()) return false;
        const codes: string[] = (id?.type?.coding ?? []).map((c: any) => c?.code);
        // Identifiers with no type coding (e.g. legacy records) match on value alone.
        return codes.length === 0 || codes.includes(code);
    });
}

export function buildScreenedPatient(p: ScreeningPayload["patient"]) {
    const patient: Record<string, any> = {
        resourceType: "Patient",
        meta: { profile: [SCREENED_PATIENT_PROFILE], tag: [SCREENING_TAG] },
        identifier: p.identifiers.map((i) => buildScreeningIdentifier(i.type, i.value)),
    };
    if (p.givenNames?.length || p.familyName) {
        patient.name = [
            {
                use: "official",
                ...(p.familyName ? { family: p.familyName } : {}),
                ...(p.givenNames?.length ? { given: p.givenNames } : {}),
            },
        ];
    }
    if (p.gender) patient.gender = p.gender;
    if (p.birthDate) patient.birthDate = p.birthDate;
    const telecom = [
        ...(p.phone ? [{ system: "phone", value: p.phone }] : []),
        ...(p.email ? [{ system: "email", value: p.email }] : []),
    ];
    if (telecom.length) patient.telecom = telecom;
    if (p.address && Object.values(p.address).some(Boolean)) {
        const a = p.address;
        patient.address = [
            {
                use: "home",
                ...(a.village ? { line: [a.village] } : {}),
                ...(a.ward ? { city: a.ward } : {}),
                ...(a.subCounty ? { district: a.subCounty } : {}),
                ...(a.county ? { state: a.county } : {}),
                ...(a.text ? { text: a.text } : {}),
            },
        ];
    }
    if (p.nationality) {
        patient.extension = [
            {
                url: "http://hl7.org/fhir/StructureDefinition/patient-nationality",
                extension: [{ url: "code", valueCodeableConcept: { text: p.nationality } }],
            },
        ];
    }
    return patient;
}

/** Add the screened tag, and any identifiers/demographics the record is missing, without overwriting existing data. */
export function mergeIntoExistingPatient(existing: any, incoming: Record<string, any>) {
    const merged = { ...existing };
    const tags = existing?.meta?.tag ?? [];
    const hasTag = tags.some((t: any) => t.system === SCREENING_TAG_SYSTEM && t.code === SCREENING_TAG_CODE);
    const profiles: string[] = existing?.meta?.profile ?? [];
    merged.meta = {
        ...(existing.meta ?? {}),
        profile: profiles.includes(SCREENED_PATIENT_PROFILE) ? profiles : [...profiles, SCREENED_PATIENT_PROFILE],
        tag: hasTag ? tags : [...tags, SCREENING_TAG],
    };
    for (const key of ["name", "gender", "birthDate", "telecom", "address"]) {
        if (merged[key] == null && incoming[key] != null) merged[key] = incoming[key];
    }
    const missing = (incoming.identifier ?? []).filter(
        (inc: any) =>
            !(existing.identifier ?? []).some(
                (ex: any) => ex.value === inc.value && (ex.type?.coding ?? []).some((c: any) => c.code === inc.type.coding[0].code),
            ),
    );
    if (missing.length) merged.identifier = [...(existing.identifier ?? []), ...missing];
    return merged;
}

export function buildScreeningQuestionnaireResponse(payload: ScreeningPayload, patientId: string) {
    const items: any[] = [];

    if (payload.pointOfEntry) {
        items.push({
            linkId: "point-of-entry",
            text: "Point of entry",
            item: [
                { linkId: "point-of-entry.name", answer: [{ valueString: payload.pointOfEntry.name }] },
                ...(payload.pointOfEntry.type
                    ? [{ linkId: "point-of-entry.type", answer: [{ valueString: payload.pointOfEntry.type }] }]
                    : []),
            ],
        });
    }

    if (payload.travelHistory) {
        const th = payload.travelHistory;
        items.push({
            linkId: "travel-history",
            text: "Travel history",
            item: [
                { linkId: "travel-history.has-travelled", answer: [{ valueBoolean: th.hasTravelled }] },
                ...(th.trips ?? []).map((t) => ({
                    linkId: "travel-history.trip",
                    text: "Trip",
                    item: [
                        { linkId: "travel-history.trip.country", answer: [{ valueString: t.country }] },
                        ...(t.city ? [{ linkId: "travel-history.trip.city", answer: [{ valueString: t.city }] }] : []),
                        ...(t.departureDate ? [{ linkId: "travel-history.trip.departure-date", answer: [{ valueDate: t.departureDate }] }] : []),
                        ...(t.arrivalDate ? [{ linkId: "travel-history.trip.arrival-date", answer: [{ valueDate: t.arrivalDate }] }] : []),
                        ...(t.purpose ? [{ linkId: "travel-history.trip.purpose", answer: [{ valueString: t.purpose }] }] : []),
                    ],
                })),
            ],
        });
    }

    if (payload.signsAndSymptoms) {
        const ss = payload.signsAndSymptoms;
        items.push({
            linkId: "signs-symptoms",
            text: "Signs and symptoms",
            item: [
                ...(ss.temperatureCelsius != null
                    ? [{ linkId: "signs-symptoms.temperature", answer: [{ valueDecimal: ss.temperatureCelsius }] }]
                    : []),
                ...(ss.symptoms ?? []).map((s) => ({
                    linkId: "signs-symptoms.symptom",
                    text: s.code,
                    answer: [
                        {
                            valueCoding: { system: SYMPTOM_SYSTEM, code: s.code, display: s.code },
                            // present=false is kept so "asked and denied" is distinguishable from "not asked"
                            item: [
                                { linkId: "signs-symptoms.symptom.present", answer: [{ valueBoolean: s.present }] },
                                ...(s.onsetDate ? [{ linkId: "signs-symptoms.symptom.onset-date", answer: [{ valueDate: s.onsetDate }] }] : []),
                                ...(s.note ? [{ linkId: "signs-symptoms.symptom.note", answer: [{ valueString: s.note }] }] : []),
                            ],
                        },
                    ],
                })),
            ],
        });
    }

    const authored = payload.screenedAt ?? new Date().toISOString();
    return {
        resourceType: "QuestionnaireResponse",
        meta: {
            profile: [SCREENING_RESPONSE_PROFILE],
            tag: [
                SCREENING_TAG,
                ...(payload.outcome
                    ? [{ system: SCREENING_OUTCOME_SYSTEM, code: payload.outcome, display: payload.outcome }]
                    : []),
            ],
        },
        identifier: { system: SCREENING_ID_SYSTEM, value: payload.screeningId },
        questionnaire: SCREENING_QUESTIONNAIRE_URL,
        status: "completed",
        subject: { reference: `Patient/${patientId}` },
        authored,
        item: items,
    };
}

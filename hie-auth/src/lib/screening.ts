import {
    IDENTIFICATION_TYPE_SYSTEM,
    IdentificationType,
    identificationTypeCode,
    isIdentificationType,
} from "./identification-types";
import { countryCoding } from "./vhf-countries";

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

/**
 * Screening No. on the Patient. The mobile app writes and searches on the vhf-screening-number
 * system; the same number is also written under the vhf-screened system.
 */
export const SCREENING_NUMBER_SYSTEM = "vhf-screening-number";
export const SCREENING_NUMBER_TYPE_SYSTEM = "vhf-screened";
export const SCREENING_NUMBER_SYSTEMS = [SCREENING_NUMBER_SYSTEM, SCREENING_NUMBER_TYPE_SYSTEM];

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
    /** Human-readable Screening No. (e.g. SCR-2026-40560); defaults to screeningId. */
    screeningNumber?: string;
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
    if (body.screeningNumber != null && !isStr(body.screeningNumber))
        errors.push("screeningNumber must be a non-empty string when given");
    if (body.screenedAt != null && !(isStr(body.screenedAt) && DATETIME_RE.test(body.screenedAt)))
        errors.push("screenedAt must be an ISO 8601 date/datetime");
    if (body.outcome != null && !(SCREENING_OUTCOMES as readonly string[]).includes(body.outcome))
        errors.push(`outcome must be one of ${SCREENING_OUTCOMES.join(", ")}`);

    if (body.pointOfEntry != null) {
        const p = body.pointOfEntry;
        if (!isObj(p) || !isStr(p.name)) errors.push("pointOfEntry.name is required when pointOfEntry is given");
        else if (p.locationId != null && !isStr(p.locationId))
            errors.push("pointOfEntry.locationId must be a non-empty string when given");
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

export function buildScreeningNumberIdentifiers(screeningNumber: string) {
    return SCREENING_NUMBER_SYSTEMS.map((system) => ({
        type: {
            coding: [{ system: SCREENING_NUMBER_TYPE_SYSTEM, code: SCREENING_NUMBER_TYPE_SYSTEM, display: "VHF Screening" }],
            text: "Screening No.",
        },
        system,
        value: screeningNumber.trim(),
    }));
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

export function buildScreenedPatient(p: ScreeningPayload["patient"], screeningNumber?: string) {
    const patient: Record<string, any> = {
        resourceType: "Patient",
        meta: { profile: [SCREENED_PATIENT_PROFILE], tag: [SCREENING_TAG] },
        active: true,
        identifier: [
            ...(screeningNumber?.trim() ? buildScreeningNumberIdentifiers(screeningNumber) : []),
            ...p.identifiers.map((i) => buildScreeningIdentifier(i.type, i.value)),
        ],
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
    for (const key of ["active", "name", "gender", "birthDate", "telecom", "address"]) {
        if (merged[key] == null && incoming[key] != null) merged[key] = incoming[key];
    }
    // A patient screened again keeps each earlier Screening No. and gains the new one.
    const missing = (incoming.identifier ?? []).filter(
        (inc: any) =>
            !(existing.identifier ?? []).some(
                (ex: any) =>
                    ex.value === inc.value &&
                    // Both Screening No. identifiers share type and value; only the system tells them apart.
                    (!SCREENING_NUMBER_SYSTEMS.includes(inc.system) || ex.system === inc.system) &&
                    (ex.type?.coding ?? []).some((c: any) => c.code === inc.type.coding[0].code),
            ),
    );
    if (missing.length) merged.identifier = [...(existing.identifier ?? []), ...missing];
    return merged;
}

type QrItem = { linkId: string; text?: string; answer?: any[]; item?: QrItem[] };

/**
 * linkIds of the mobile VHF case form (android-fhir nphiis/src/main/assets/vhf-case.json),
 * so a screening response lines up with, and can prefill, a vhf-case response.
 */
export const VHF_CASE_LINK_IDS = {
    demographics: "vhf-demographics",
    familyName: "486402457213",
    givenNames: "873240407472",
    sex: "929966324957",
    birthDateKnown: "442636360588",
    birthDate: "257830485990",
    idType: "vhf-id-type",
    idTypeMinor: "vhf-id-type-minor",
    idNumber: "vhf-national-id",
    phone: "vhf-phone",
    currentResidence: "vhf-current-residence",
    village: "vhf-village",
    clinical: "vhf-clinical",
    symptoms: "vhf-symptoms",
    bleedingSite: "vhf-bleeding-site",
    symptomsOther: "vhf-symptoms-other",
    firstOnset: "728034137219",
    onsetPrefix: "vhf-onset-",
    travel: "vhf-travel",
    travelled: "vhf-travelled",
    originCountry: "vhf-travel-origin-country",
    originPlace: "vhf-travel-origin-place",
    departureDate: "vhf-travel-departure-date",
    stopovers: "vhf-travel-stopovers",
    destinationCountry: "vhf-travel-destination-country",
    destinationPlace: "vhf-travel-destination-place",
    arrivalDate: "vhf-travel-arrival-date",
} as const;

/** Screening answers with no vhf-case question. */
export const SCREENING_LINK_IDS = {
    pointOfEntry: "point-of-entry",
    temperature: "screening-temperature",
    travelPurpose: "screening-travel-purpose",
} as const;

/** vhf-symptoms options, in form order; the codes vhf-onset-<code> is built from. */
export const VHF_SYMPTOMS: Record<string, string> = {
    fever: "Fever",
    headache: "Headache",
    fatigue: "Fatigue",
    vomiting: "Vomiting",
    diarrhea: "Diarrhea",
    "unexplained-bleeding": "Unexplained bleeding",
    "muscle-pain": "Muscle pain",
    other: "Other (specify)",
};

const SCREENING_TO_VHF_SYMPTOM: Partial<Record<(typeof SYMPTOM_CODES)[number], string>> = {
    fever: "fever",
    headache: "headache",
    fatigue: "fatigue",
    vomiting: "vomiting",
    diarrhoea: "diarrhea",
    bleeding: "unexplained-bleeding",
    "muscle-pain": "muscle-pain",
};

/** The vhf-symptoms code a screening symptom is recorded under; anything without its own option is "other". */
export function vhfSymptomCode(code: (typeof SYMPTOM_CODES)[number]): string {
    return SCREENING_TO_VHF_SYMPTOM[code] ?? "other";
}

const SEX_OPTIONS: Record<string, string> = { male: "Male", female: "Female", other: "Other (specify)" };
const ID_TYPE_OPTIONS: Partial<Record<IdentificationType, { code: string; display: string }>> = {
    "National ID": { code: "national-id", display: "National ID" },
    "Birth Certificate": { code: "birth-certificate", display: "Birth certificate" },
};
const KENYA = "KE";

const choice = (code: string, display: string) => ({ valueCoding: { code, display } });
const humanize = (code: string) => code.charAt(0).toUpperCase() + code.slice(1).replace(/-/g, " ");
const earliest = (dates: Array<string | undefined>) => dates.filter((d): d is string => !!d).sort()[0];

function answered(linkId: string, answer: any | undefined): QrItem[] {
    return answer == null ? [] : [{ linkId, answer: Array.isArray(answer) ? answer : [answer] }];
}

function group(linkId: string, items: QrItem[]): QrItem[] {
    return items.length ? [{ linkId, item: items }] : [];
}

/** Under 18 on the reference date (vhf-case asks minors for vhf-id-type-minor). */
function isMinor(birthDate: string, onDate: string): boolean {
    const [y, rest] = [Number(birthDate.slice(0, 4)), birthDate.slice(4)];
    return `${y + 18}${rest}` > onDate.slice(0, 10);
}

function demographicsItems(p: ScreeningPayload["patient"], onDate: string): QrItem[] {
    const L = VHF_CASE_LINK_IDS;
    const id = p.identifiers.find((i) => ID_TYPE_OPTIONS[i.type]);
    const idOption = id && ID_TYPE_OPTIONS[id.type]!;
    const minor = !!p.birthDate && isMinor(p.birthDate, onDate);
    return [
        ...answered(L.familyName, p.familyName ? { valueString: p.familyName } : undefined),
        ...answered(L.givenNames, p.givenNames?.length ? { valueString: p.givenNames.join(" ") } : undefined),
        ...answered(L.sex, p.gender && SEX_OPTIONS[p.gender] ? choice(p.gender, SEX_OPTIONS[p.gender]) : undefined),
        ...answered(L.birthDateKnown, p.birthDate ? choice("known", "Known") : undefined),
        ...answered(L.birthDate, p.birthDate ? { valueDate: p.birthDate } : undefined),
        ...answered(minor ? L.idTypeMinor : L.idType, idOption ? choice(idOption.code, idOption.display) : undefined),
        ...answered(L.idNumber, id ? { valueString: id.value.trim() } : undefined),
        ...answered(L.phone, p.phone ? { valueString: p.phone } : undefined),
        ...answered(L.currentResidence, p.address?.text ? { valueString: p.address.text } : undefined),
        ...answered(L.village, p.address?.village ? { valueString: p.address.village } : undefined),
    ];
}

function clinicalItems(ss: NonNullable<ScreeningPayload["signsAndSymptoms"]>): QrItem[] {
    const L = VHF_CASE_LINK_IDS;
    // vhf-case has no "asked and denied"; only present symptoms are recorded.
    const present = (ss.symptoms ?? []).filter((s) => s.present).map((s) => ({ ...s, vhf: vhfSymptomCode(s.code) }));
    if (!present.length) return [];
    const codes = Object.keys(VHF_SYMPTOMS).filter((c) => present.some((s) => s.vhf === c));
    const others = present.filter((s) => s.vhf === "other");
    const bleedingNote = present.find((s) => s.vhf === "unexplained-bleeding" && s.note)?.note;
    const otherText = others
        .map((s) => (s.code === "other" ? s.note ?? "" : `${humanize(s.code)}${s.note ? ` (${s.note})` : ""}`))
        .filter(Boolean)
        .join("; ");
    const firstOnset = earliest(present.map((s) => s.onsetDate));
    return [
        ...answered(L.symptoms, codes.map((c) => choice(c, VHF_SYMPTOMS[c]))),
        ...answered(L.bleedingSite, bleedingNote ? { valueString: bleedingNote } : undefined),
        ...answered(L.symptomsOther, otherText ? { valueString: otherText } : undefined),
        ...answered(L.firstOnset, firstOnset ? { valueDate: firstOnset } : undefined),
        ...codes.flatMap((c) => {
            const onset = earliest(present.filter((s) => s.vhf === c).map((s) => s.onsetDate));
            return answered(`${L.onsetPrefix}${c}`, onset ? { valueDate: onset } : undefined);
        }),
    ];
}

type Trip = NonNullable<NonNullable<ScreeningPayload["travelHistory"]>["trips"]>[number];

/** vhf-case holds one trip: the latest arrival (or the last one given); earlier trips go to stopovers. */
export function mainTrip(trips: Trip[]): { main?: Trip; rest: Trip[] } {
    if (!trips.length) return { rest: [] };
    let idx = trips.length - 1;
    trips.forEach((t, i) => {
        if (t.arrivalDate && (!trips[idx].arrivalDate || t.arrivalDate > trips[idx].arrivalDate!)) idx = i;
    });
    return { main: trips[idx], rest: trips.filter((_, i) => i !== idx) };
}

function describeTrip(t: Trip): string {
    const where = [countryCoding(t.country).display, t.city].filter(Boolean).join(", ");
    const when = [t.departureDate, t.arrivalDate].filter(Boolean).join("–");
    return when ? `${where} ${when}` : where;
}

function travelItems(th: NonNullable<ScreeningPayload["travelHistory"]>, pointOfEntry?: string): QrItem[] {
    const L = VHF_CASE_LINK_IDS;
    const items = answered(L.travelled, th.hasTravelled ? choice("yes", "Yes") : choice("no", "No"));
    const { main, rest } = th.hasTravelled ? mainTrip(th.trips ?? []) : { rest: [] };
    if (!main) return items;
    const stopovers = rest.map(describeTrip).join("; ");
    return [
        ...items,
        ...answered(L.originCountry, { valueCoding: countryCoding(main.country) }),
        ...answered(L.originPlace, main.city ? { valueString: main.city } : undefined),
        ...answered(L.departureDate, main.departureDate ? { valueDate: main.departureDate } : undefined),
        ...answered(L.stopovers, stopovers ? { valueString: stopovers } : undefined),
        ...answered(L.destinationCountry, { valueCoding: countryCoding(KENYA) }),
        ...answered(L.destinationPlace, pointOfEntry ? { valueString: pointOfEntry } : undefined),
        ...answered(L.arrivalDate, main.arrivalDate ? { valueDate: main.arrivalDate } : undefined),
    ];
}

export function buildScreeningQuestionnaireResponse(payload: ScreeningPayload, patientId: string) {
    const L = VHF_CASE_LINK_IDS;
    const authored = payload.screenedAt ?? new Date().toISOString();
    const poe = payload.pointOfEntry;
    const purpose = payload.travelHistory?.hasTravelled ? mainTrip(payload.travelHistory.trips ?? []).main?.purpose : undefined;

    const items: QrItem[] = [
        ...group(L.demographics, demographicsItems(payload.patient, authored)),
        ...group(L.clinical, payload.signsAndSymptoms ? clinicalItems(payload.signsAndSymptoms) : []),
        ...group(L.travel, payload.travelHistory ? travelItems(payload.travelHistory, poe?.name) : []),
        ...(poe
            ? [
                  {
                      linkId: SCREENING_LINK_IDS.pointOfEntry,
                      text: "Point of entry",
                      item: [
                          { linkId: "point-of-entry.name", answer: [{ valueString: poe.name }] },
                          ...(poe.type ? [{ linkId: "point-of-entry.type", answer: [{ valueString: poe.type }] }] : []),
                          ...(poe.locationId
                              ? [
                                    {
                                        linkId: "point-of-entry.location",
                                        answer: [{ valueReference: { reference: `Location/${poe.locationId}`, display: poe.name } }],
                                    },
                                ]
                              : []),
                      ],
                  },
              ]
            : []),
        ...answered(
            SCREENING_LINK_IDS.temperature,
            payload.signsAndSymptoms?.temperatureCelsius != null ? { valueDecimal: payload.signsAndSymptoms.temperatureCelsius } : undefined,
        ),
        ...answered(SCREENING_LINK_IDS.travelPurpose, purpose ? { valueString: purpose } : undefined),
    ];

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

/** Demographics for a screening payload, read back from the Patient it created or matched. */
export function screeningPatientFromResource(patient: any): ScreeningPayload["patient"] {
    const name = patient?.name?.[0];
    const address = patient?.address?.[0];
    const phone = patient?.telecom?.find((t: any) => t?.system === "phone")?.value;
    const identifiers = (patient?.identifier ?? [])
        .filter((i: any) => i?.system === SCREENING_IDENTIFIER_SYSTEM && i?.value?.trim())
        .map((i: any) => ({ type: i.type?.text ?? i.type?.coding?.[0]?.display, value: i.value.trim() }))
        .filter((i: any) => isIdentificationType(i.type));
    return {
        identifiers,
        ...(name?.family ? { familyName: name.family } : {}),
        ...(name?.given?.length ? { givenNames: name.given } : {}),
        ...(patient?.gender ? { gender: patient.gender } : {}),
        ...(patient?.birthDate ? { birthDate: patient.birthDate } : {}),
        ...(phone ? { phone } : {}),
        ...(address?.line?.[0] || address?.text
            ? { address: { ...(address.line?.[0] ? { village: address.line[0] } : {}), ...(address.text ? { text: address.text } : {}) } }
            : {}),
    };
}

/** Top-level linkIds the screening response used before it followed vhf-case.json. */
const LEGACY_GROUPS = ["travel-history", "signs-symptoms"];

/** True for a screening response still in the pre-vhf-case shape. */
export function isLegacyScreeningResponse(qr: any): boolean {
    const ids: string[] = (qr?.item ?? []).map((i: any) => String(i?.linkId ?? ""));
    if (ids.some((id) => LEGACY_GROUPS.includes(id))) return true;
    return !ids.some((id) => id.startsWith("vhf-") || id.startsWith("screening-"));
}

/** Rebuild the payload a pre-vhf-case screening response was made from; demographics come from the Patient. */
export function screeningPayloadFromLegacyResponse(qr: any, patient: any): ScreeningPayload {
    const sub = (linkId: string): any[] => (qr?.item ?? []).find((i: any) => i?.linkId === linkId)?.item ?? [];
    const val = (items: any[] | undefined, linkId: string): any => {
        const a = items?.find((i) => i?.linkId === linkId)?.answer?.[0];
        return a?.valueString ?? a?.valueDate ?? a?.valueDecimal ?? a?.valueBoolean ?? a?.valueReference?.reference;
    };

    const poe = sub("point-of-entry");
    const poeName = val(poe, "point-of-entry.name");
    const poeType = val(poe, "point-of-entry.type");
    const poeLocation = val(poe, "point-of-entry.location");
    const travel = sub("travel-history");
    const ss = sub("signs-symptoms");
    const hasTravelled = val(travel, "travel-history.has-travelled");
    const temperature = val(ss, "signs-symptoms.temperature");
    const outcome = qr?.meta?.tag?.find((t: any) => t?.system === SCREENING_OUTCOME_SYSTEM)?.code;

    const symptoms = ss
        .filter((i) => i?.linkId === "signs-symptoms.symptom")
        .map((i) => {
            const a = i.answer?.[0];
            const onsetDate = val(a?.item, "signs-symptoms.symptom.onset-date");
            const note = val(a?.item, "signs-symptoms.symptom.note");
            return {
                code: a?.valueCoding?.code ?? i.text,
                present: val(a?.item, "signs-symptoms.symptom.present") === true,
                ...(onsetDate ? { onsetDate } : {}),
                ...(note ? { note } : {}),
            };
        })
        .filter((s) => (SYMPTOM_CODES as readonly string[]).includes(s.code));

    const trips = travel
        .filter((i) => i?.linkId === "travel-history.trip")
        .map((t) => {
            const field = (k: string) => val(t.item, `travel-history.trip.${k}`);
            return {
                country: field("country") ?? "",
                ...(field("city") ? { city: field("city") } : {}),
                ...(field("departure-date") ? { departureDate: field("departure-date") } : {}),
                ...(field("arrival-date") ? { arrivalDate: field("arrival-date") } : {}),
                ...(field("purpose") ? { purpose: field("purpose") } : {}),
            };
        })
        .filter((t) => t.country);

    return {
        screeningId: qr?.identifier?.value ?? qr?.id,
        ...(qr?.authored ? { screenedAt: qr.authored } : {}),
        ...((SCREENING_OUTCOMES as readonly string[]).includes(outcome) ? { outcome } : {}),
        ...(poeName
            ? {
                  pointOfEntry: {
                      name: poeName,
                      ...(poeType ? { type: poeType } : {}),
                      ...(typeof poeLocation === "string" && poeLocation.startsWith("Location/")
                          ? { locationId: poeLocation.slice("Location/".length) }
                          : {}),
                  },
              }
            : {}),
        patient: screeningPatientFromResource(patient),
        ...(typeof hasTravelled === "boolean" ? { travelHistory: { hasTravelled, ...(trips.length ? { trips } : {}) } } : {}),
        ...(ss.length
            ? { signsAndSymptoms: { ...(typeof temperature === "number" ? { temperatureCelsius: temperature } : {}), symptoms } }
            : {}),
    };
}

/**
 * A pre-vhf-case screening response rewritten with the vhf-case linkIds, keeping its id,
 * identifier, tags, subject and authored date. Null when there is nothing to change.
 */
export function migrateLegacyScreeningResponse(qr: any, patient: any): any | null {
    if (!isLegacyScreeningResponse(qr)) return null;
    const patientId = String(qr?.subject?.reference ?? "").replace(/^Patient\//, "");
    const rebuilt = buildScreeningQuestionnaireResponse(screeningPayloadFromLegacyResponse(qr, patient), patientId);
    if (JSON.stringify(rebuilt.item) === JSON.stringify(qr?.item ?? [])) return null;
    return { ...qr, item: rebuilt.item };
}

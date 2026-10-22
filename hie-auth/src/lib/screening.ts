import {
    IDENTIFICATION_TYPE_SYSTEM,
    IdentificationType,
    identificationTypeCode,
    isIdentificationType,
} from "./identification-types";
import { countryCoding } from "./vhf-countries";
import { VHF_CASE_LINK_IDS } from "./vhf-link-ids";

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
/** vhf-travelled answers. */
export const TRAVELLED_ANSWERS = ["yes", "no", "unknown"] as const;
/** vhf-travel-means answers. */
export const TRAVEL_MEANS = ["land", "air", "water"] as const;
const TRAVEL_MEANS_DISPLAY: Record<(typeof TRAVEL_MEANS)[number], string> = { land: "Land", air: "Air", water: "Water" };

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
        /** Yes / No; use `travelled` to answer Unknown. One of the two is required. */
        hasTravelled?: boolean;
        travelled?: (typeof TRAVELLED_ANSWERS)[number];
        /** Countries are ISO 3166 alpha-2 codes (GET /provider/screenings/countries); names are mapped. */
        trips?: Array<{
            country: string;
            city?: string;
            departureDate?: string;
            arrivalDate?: string;
            means?: (typeof TRAVEL_MEANS)[number];
            purpose?: string;
        }>;
        /** Free-text stopovers; defaults to the trips other than the main one. */
        stopovers?: string;
        /** Defaults to Kenya and the point of entry name. */
        destination?: { country?: string; place?: string };
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
    if (travel != null) errors.push(...travelErrors(travel));

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

/** Today's date in Kenya (UTC+3), so a date entered just after local midnight is not "in the future". */
function todayInKenya(now = Date.now()): string {
    return new Date(now + 3 * 3600_000).toISOString().slice(0, 10);
}

const COUNTRY_HINT = "an ISO 3166 alpha-2 code (see GET /provider/screenings/countries)";

function travelErrors(travel: unknown): string[] {
    const errors: string[] = [];
    if (!isObj(travel)) return ["travelHistory must be an object"];
    const hasBool = typeof travel.hasTravelled === "boolean";
    if (travel.hasTravelled != null && !hasBool) errors.push("travelHistory.hasTravelled must be a boolean");
    if (travel.travelled != null && !(TRAVELLED_ANSWERS as readonly string[]).includes(travel.travelled))
        errors.push(`travelHistory.travelled must be one of ${TRAVELLED_ANSWERS.join(", ")}`);
    if (travel.hasTravelled == null && travel.travelled == null)
        errors.push("travelHistory.hasTravelled (boolean) or travelHistory.travelled (yes|no|unknown) is required");
    if (hasBool && travel.travelled != null && travel.travelled !== (travel.hasTravelled ? "yes" : "no"))
        errors.push("travelHistory.hasTravelled and travelHistory.travelled disagree");

    const today = todayInKenya();
    if (travel.trips != null) {
        if (!Array.isArray(travel.trips)) errors.push("travelHistory.trips must be an array");
        else
            travel.trips.forEach((t: any, i: number) => {
                const at = `travelHistory.trips[${i}]`;
                if (!isObj(t) || !isStr(t.country)) return errors.push(`${at}.country is required`);
                if (!countryCoding(t.country).code) errors.push(`${at}.country "${t.country}" is not a known country; send ${COUNTRY_HINT}`);
                for (const k of ["departureDate", "arrivalDate"]) {
                    if (t[k] == null) continue;
                    if (!(isStr(t[k]) && DATE_RE.test(t[k]))) errors.push(`${at}.${k} must be YYYY-MM-DD`);
                    else if (t[k] > today) errors.push(`${at}.${k} cannot be in the future`);
                }
                if (isStr(t.departureDate) && isStr(t.arrivalDate) && t.arrivalDate < t.departureDate)
                    errors.push(`${at}.arrivalDate cannot be before departureDate`);
                if (t.means != null && !(TRAVEL_MEANS as readonly string[]).includes(t.means))
                    errors.push(`${at}.means must be one of ${TRAVEL_MEANS.join(", ")}`);
                if (t.city != null && typeof t.city !== "string") errors.push(`${at}.city must be a string`);
            });
    }
    if (travel.stopovers != null && typeof travel.stopovers !== "string") errors.push("travelHistory.stopovers must be a string");
    const dest = travel.destination;
    if (dest != null) {
        if (!isObj(dest)) errors.push("travelHistory.destination must be an object");
        else {
            if (dest.country != null && !(isStr(dest.country) && countryCoding(dest.country).code))
                errors.push(`travelHistory.destination.country must be ${COUNTRY_HINT}`);
            if (dest.place != null && typeof dest.place !== "string") errors.push("travelHistory.destination.place must be a string");
        }
    }
    return errors;
}

/** The vhf-travelled answer of a travel history. */
export function travelledAnswer(th: NonNullable<ScreeningPayload["travelHistory"]>): (typeof TRAVELLED_ANSWERS)[number] {
    if (th.travelled) return th.travelled;
    return th.hasTravelled ? "yes" : "no";
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

export { VHF_CASE_LINK_IDS };

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
    const travelled = travelledAnswer(th);
    const items = answered(L.travelled, choice(travelled, humanize(travelled)));
    const { main, rest } = travelled === "yes" ? mainTrip(th.trips ?? []) : { rest: [] };
    if (!main) return items;
    const stopovers = th.stopovers?.trim() || rest.map(describeTrip).join("; ");
    const destinationPlace = th.destination?.place?.trim() || pointOfEntry;
    return [
        ...items,
        ...answered(L.originCountry, { valueCoding: countryCoding(main.country) }),
        ...answered(L.originPlace, main.city?.trim() ? { valueString: main.city.trim() } : undefined),
        ...answered(L.departureDate, main.departureDate ? { valueDate: main.departureDate } : undefined),
        ...answered(L.means, main.means ? choice(main.means, TRAVEL_MEANS_DISPLAY[main.means]) : undefined),
        ...answered(L.stopovers, stopovers ? { valueString: stopovers } : undefined),
        ...answered(L.destinationCountry, { valueCoding: countryCoding(th.destination?.country ?? KENYA) }),
        ...answered(L.destinationPlace, destinationPlace ? { valueString: destinationPlace } : undefined),
        ...answered(L.arrivalDate, main.arrivalDate ? { valueDate: main.arrivalDate } : undefined),
    ];
}

/* ── Reporting site ──────────────────────────────────────────────────────── */

export const FACILITY_TYPES = ["Public", "Private", "Faith Based"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export type Place = { id: string; name: string };

/** Where a screening was reported from: the screener's role and assigned location. */
export interface ReportingSite {
    role?: string;
    county?: Place;
    subCounty?: Place;
    ward?: Place;
    facility?: Place;
    facilityType?: FacilityType;
}

/** vhf-case.json "Reporting Site" group, filled the way mobile prefills it from the user. */
export const REPORTING_LINK_IDS = {
    group: "151479012557",
    userRole: "user_role",
    userFacility: "user_facility",
    userWard: "user_ward",
    userSubCounty: "user_sub_county",
    userCounty: "user_county",
    county: "294367770999",
    subCounty: "819946803642",
    ward: "819943434",
    facility: "819946803677",
    facilityType: "438862163919",
    investigationDate: "vhf-investigation-date",
    investigationLocation: "vhf-investigation-location",
    investigationLocationOther: "vhf-investigation-location-other",
} as const;

/** The level group the form shows for each role (its enableWhen on user_role), and its linkId suffix. */
const REPORTING_LEVELS: Record<string, { group: string; suffix: string }> = {
    VACCINATOR: { group: "facility_level", suffix: "" },
    SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER: { group: "sub_county_level", suffix: "_sub_county" },
    COUNTY_DISEASE_SURVEILLANCE_OFFICER: { group: "county_level", suffix: "_county" },
    ADMINISTRATOR: { group: "national_level", suffix: "_national" },
};

/** vhf-investigation-location for a point-of-entry type. */
const INVESTIGATION_LOCATION: Record<string, [string, string]> = {
    facility: ["health-facility", "Health facility"],
    community: ["community", "Community"],
};

/** The Reporting Site group: screener role and location, date and place of the screening. */
export function reportingSiteItems(
    site: ReportingSite | undefined,
    screenedAt: string,
    poe?: ScreeningPayload["pointOfEntry"],
): QrItem[] {
    const R = REPORTING_LINK_IDS;
    const ref = (p?: Place) => (p ? { valueReference: { reference: `Location/${p.id}`, display: p.name } } : undefined);
    const str = (v?: string) => (v ? { valueString: v } : undefined);
    // Other roles have no group of their own; the national one takes any location.
    const level = REPORTING_LEVELS[site?.role ?? ""] ?? REPORTING_LEVELS.ADMINISTRATOR;
    const where = poe?.type ? INVESTIGATION_LOCATION[poe.type] : undefined;
    return group(R.group, [
        ...answered(R.userRole, str(site?.role)),
        ...answered(R.userFacility, str(site?.facility?.id)),
        ...answered(R.userWard, str(site?.ward?.id)),
        ...answered(R.userSubCounty, str(site?.subCounty?.id)),
        ...answered(R.userCounty, str(site?.county?.id)),
        ...group(level.group, [
            ...answered(R.county + level.suffix, ref(site?.county)),
            ...answered(R.subCounty + level.suffix, ref(site?.subCounty)),
            ...answered(R.ward + level.suffix, ref(site?.ward)),
            ...answered(R.facility + level.suffix, ref(site?.facility)),
            ...answered(R.facilityType + level.suffix, site?.facilityType ? choice(site.facilityType, site.facilityType) : undefined),
        ]),
        ...answered(R.investigationDate, { valueDate: screenedAt.slice(0, 10) }),
        ...(poe
            ? [
                  ...answered(R.investigationLocation, where ? choice(...where) : choice("other", "Other (specify)")),
                  ...answered(R.investigationLocationOther, where ? undefined : { valueString: poe.name }),
              ]
            : []),
    ]);
}

/** "Public" / "Private" / "Faith Based" when a facility Location says so (its type or an extension). */
export function facilityTypeOf(location: any): FacilityType | undefined {
    const key = (w: unknown) => String(w ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
    const words = [
        ...(location?.type ?? []).flatMap((t: any) => [t?.text, ...(t?.coding ?? []).flatMap((c: any) => [c?.code, c?.display])]),
        ...(location?.extension ?? []).flatMap((e: any) => [
            e?.valueString,
            e?.valueCoding?.code,
            e?.valueCoding?.display,
            e?.valueCodeableConcept?.text,
        ]),
    ].map(key);
    return FACILITY_TYPES.find((t) => words.includes(key(t)));
}

/** The screener's reporting site from their role and location info (hie-auth buildLocationInfo). */
export function reportingSiteFromLocationInfo(
    role: string | undefined,
    info: Partial<Record<"county" | "countyName" | "subCounty" | "subCountyName" | "ward" | "wardName" | "facility" | "facilityName", string>> | undefined,
    facilityType?: FacilityType,
): ReportingSite {
    const place = (id?: string, name?: string): Place | undefined => (id ? { id, name: name || id } : undefined);
    const facility = place(info?.facility, info?.facilityName);
    return {
        ...(role ? { role } : {}),
        ...(info?.county ? { county: place(info.county, info.countyName) } : {}),
        ...(info?.subCounty ? { subCounty: place(info.subCounty, info.subCountyName) } : {}),
        ...(info?.ward ? { ward: place(info.ward, info.wardName) } : {}),
        ...(facility ? { facility } : {}),
        ...(facility && facilityType ? { facilityType } : {}),
    };
}

export function buildScreeningQuestionnaireResponse(payload: ScreeningPayload, patientId: string, site?: ReportingSite) {
    const L = VHF_CASE_LINK_IDS;
    const authored = payload.screenedAt ?? new Date().toISOString();
    const poe = payload.pointOfEntry;
    const purpose = payload.travelHistory && travelledAnswer(payload.travelHistory) === "yes" ? mainTrip(payload.travelHistory.trips ?? []).main?.purpose : undefined;

    const items: QrItem[] = [
        ...(site ? reportingSiteItems(site, authored, poe) : []),
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
    return !ids.some((id) => id.startsWith("vhf-") || id.startsWith("screening-") || id === REPORTING_LINK_IDS.group);
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
    // Keep a Reporting Site the response already has (legacy ones have none to rebuild from).
    const site = (qr?.item ?? []).filter((i: any) => i?.linkId === REPORTING_LINK_IDS.group);
    const item = [...site, ...rebuilt.item];
    if (JSON.stringify(item) === JSON.stringify(qr?.item ?? [])) return null;
    return { ...qr, item };
}

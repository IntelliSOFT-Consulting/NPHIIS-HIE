import { describe, expect, it } from "vitest";
import {
    SCREENING_TAG_CODE,
    buildScreenedPatient,
    buildScreeningQuestionnaireResponse,
    isLegacyScreeningResponse,
    mergeIntoExistingPatient,
    migrateLegacyScreeningResponse,
    patientHasIdentifier,
    validateScreeningPayload,
} from "./screening";
import { countryCoding } from "./vhf-countries";

const valid = {
    screeningId: "scr-1",
    outcome: "referred",
    patient: {
        identifiers: [{ type: "National ID", value: "12345678" }],
        givenNames: ["Jane"],
        familyName: "Doe",
        gender: "female",
        birthDate: "1990-02-01",
    },
    travelHistory: { hasTravelled: true, trips: [{ country: "UG", departureDate: "2026-10-01" }] },
    signsAndSymptoms: {
        temperatureCelsius: 38.6,
        symptoms: [
            { code: "fever", present: true, onsetDate: "2026-10-10" },
            { code: "cough", present: false },
        ],
    },
};

describe("validateScreeningPayload", () => {
    it("accepts a valid payload", () => {
        expect(validateScreeningPayload(valid).ok).toBe(true);
    });

    it("reports every problem", () => {
        const r = validateScreeningPayload({
            patient: { identifiers: [{ type: "Passport", value: "" }], birthDate: "01/02/1990" },
            signsAndSymptoms: { symptoms: [{ code: "nope", present: true }] },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(4);
    });
});

describe("patient mapping", () => {
    it("tags new patients as screened and matches by type + value", () => {
        const p = buildScreenedPatient(valid.patient as any);
        expect(p.meta.tag[0].code).toBe(SCREENING_TAG_CODE);
        expect(patientHasIdentifier(p, "National ID", "12345678")).toBe(true);
        expect(patientHasIdentifier(p, "Alien ID", "12345678")).toBe(false);
    });

    it("creates the patient as active", () => {
        expect(buildScreenedPatient(valid.patient as any).active).toBe(true);
        const inactive = mergeIntoExistingPatient(
            { resourceType: "Patient", id: "9", active: false, identifier: [] },
            buildScreenedPatient(valid.patient as any),
        );
        expect(inactive.active).toBe(false);
        expect(mergeIntoExistingPatient({ resourceType: "Patient", id: "9" }, buildScreenedPatient(valid.patient as any)).active).toBe(true);
    });

    it("gives the patient a Screening No. under both the vhf-screening-number and vhf-screened systems", () => {
        const p = buildScreenedPatient(valid.patient as any, "SCR-2026-40560");
        const type = {
            coding: [{ system: "vhf-screened", code: "vhf-screened", display: "VHF Screening" }],
            text: "Screening No.",
        };
        expect(p.identifier.slice(0, 2)).toEqual([
            { type, system: "vhf-screening-number", value: "SCR-2026-40560" },
            { type, system: "vhf-screened", value: "SCR-2026-40560" },
        ]);
        expect(buildScreenedPatient(valid.patient as any).identifier.some((i: any) => i.type?.text === "Screening No.")).toBe(false);
    });

    it("adds the vhf-screened identifier to a patient that only has the mobile one", () => {
        const mobile = buildScreenedPatient(valid.patient as any, "SCR-1").identifier[0];
        const merged = mergeIntoExistingPatient(
            { resourceType: "Patient", id: "9", identifier: [mobile] },
            buildScreenedPatient(valid.patient as any, "SCR-1"),
        );
        expect(merged.identifier.filter((i: any) => i.value === "SCR-1").map((i: any) => i.system)).toEqual([
            "vhf-screening-number",
            "vhf-screened",
        ]);
    });

    it("adds a new Screening No. to an existing patient once, keeping earlier ones", () => {
        const first = mergeIntoExistingPatient(
            { resourceType: "Patient", id: "9", identifier: [] },
            buildScreenedPatient(valid.patient as any, "SCR-1"),
        );
        const again = mergeIntoExistingPatient(first, buildScreenedPatient(valid.patient as any, "SCR-1"));
        const second = mergeIntoExistingPatient(again, buildScreenedPatient(valid.patient as any, "SCR-2"));
        const numbers = (p: any, system: string) => p.identifier.filter((i: any) => i.system === system).map((i: any) => i.value);
        for (const system of ["vhf-screening-number", "vhf-screened"]) {
            expect(numbers(again, system)).toEqual(["SCR-1"]);
            expect(numbers(second, system)).toEqual(["SCR-1", "SCR-2"]);
        }
    });

    it("merges into an existing patient without overwriting", () => {
        const existing = { resourceType: "Patient", id: "9", gender: "male", identifier: [{ system: "x", value: "12345678" }] };
        const merged = mergeIntoExistingPatient(existing, buildScreenedPatient(valid.patient as any));
        expect(merged.gender).toBe("male");
        expect(merged.birthDate).toBe("1990-02-01");
        expect(merged.meta.tag.some((t: any) => t.code === SCREENING_TAG_CODE)).toBe(true);
    });
});

const items = (qr: any, linkId: string): any[] => qr.item.find((i: any) => i.linkId === linkId)?.item ?? [];
const answerOf = (list: any[], linkId: string) => list.find((i) => i.linkId === linkId)?.answer;

describe("buildScreeningQuestionnaireResponse", () => {
    it("links the patient, identifies the screening and tags the outcome", () => {
        const qr = buildScreeningQuestionnaireResponse(valid as any, "42");
        expect(qr.subject.reference).toBe("Patient/42");
        expect(qr.identifier.value).toBe("scr-1");
        expect(qr.meta.tag.map((t: any) => t.code)).toEqual(["screened", "referred"]);
    });

    it("uses the vhf-case groups in form order, then the screening-only items", () => {
        const qr = buildScreeningQuestionnaireResponse({ ...valid, pointOfEntry: { name: "Busia OSBP" } } as any, "42");
        expect(qr.item.map((i: any) => i.linkId)).toEqual([
            "vhf-demographics",
            "vhf-clinical",
            "vhf-travel",
            "point-of-entry",
            "screening-temperature",
        ]);
        expect(answerOf(qr.item, "screening-temperature")).toEqual([{ valueDecimal: 38.6 }]);
    });

    it("writes demographics under the vhf-case linkIds", () => {
        const qr = buildScreeningQuestionnaireResponse(
            { ...valid, screenedAt: "2026-10-14", patient: { ...valid.patient, phone: "0712345678", address: { village: "Kona" } } } as any,
            "42",
        );
        const demo = items(qr, "vhf-demographics");
        expect(demo.map((i) => i.linkId)).toEqual([
            "486402457213",
            "873240407472",
            "929966324957",
            "442636360588",
            "257830485990",
            "vhf-id-type",
            "vhf-national-id",
            "vhf-phone",
            "vhf-village",
        ]);
        expect(answerOf(demo, "929966324957")).toEqual([{ valueCoding: { code: "female", display: "Female" } }]);
        expect(answerOf(demo, "vhf-id-type")).toEqual([{ valueCoding: { code: "national-id", display: "National ID" } }]);
        expect(answerOf(demo, "vhf-national-id")).toEqual([{ valueString: "12345678" }]);
    });

    it("asks minors for vhf-id-type-minor and skips ID types vhf-case has no option for", () => {
        const minor = buildScreeningQuestionnaireResponse(
            {
                ...valid,
                screenedAt: "2026-10-14",
                patient: { ...valid.patient, birthDate: "2010-01-01", identifiers: [{ type: "Birth Certificate", value: "BC1" }] },
            } as any,
            "42",
        );
        expect(answerOf(items(minor, "vhf-demographics"), "vhf-id-type-minor")).toEqual([
            { valueCoding: { code: "birth-certificate", display: "Birth certificate" } },
        ]);
        const alien = buildScreeningQuestionnaireResponse(
            { ...valid, patient: { identifiers: [{ type: "Alien ID", value: "A1" }], gender: "unknown" } } as any,
            "42",
        );
        expect(alien.item.some((i: any) => i.linkId === "vhf-demographics")).toBe(false);
    });

    it("maps present symptoms to vhf-symptoms options with onset dates", () => {
        const qr = buildScreeningQuestionnaireResponse(
            {
                ...valid,
                signsAndSymptoms: {
                    symptoms: [
                        { code: "diarrhoea", present: true, onsetDate: "2026-10-11" },
                        { code: "fever", present: true, onsetDate: "2026-10-10" },
                        { code: "bleeding", present: true, note: "gums" },
                        { code: "cough", present: true, onsetDate: "2026-10-12" },
                        { code: "rash", present: true, note: "trunk", onsetDate: "2026-10-09" },
                        { code: "headache", present: false },
                    ],
                },
            } as any,
            "42",
        );
        const clinical = items(qr, "vhf-clinical");
        expect(answerOf(clinical, "vhf-symptoms").map((a: any) => a.valueCoding.code)).toEqual([
            "fever",
            "diarrhea",
            "unexplained-bleeding",
            "other",
        ]);
        expect(answerOf(clinical, "vhf-bleeding-site")).toEqual([{ valueString: "gums" }]);
        expect(answerOf(clinical, "vhf-symptoms-other")).toEqual([{ valueString: "Cough; Rash (trunk)" }]);
        expect(answerOf(clinical, "728034137219")).toEqual([{ valueDate: "2026-10-09" }]);
        expect(answerOf(clinical, "vhf-onset-fever")).toEqual([{ valueDate: "2026-10-10" }]);
        expect(answerOf(clinical, "vhf-onset-diarrhea")).toEqual([{ valueDate: "2026-10-11" }]);
        expect(answerOf(clinical, "vhf-onset-other")).toEqual([{ valueDate: "2026-10-09" }]);
        expect(answerOf(clinical, "vhf-onset-unexplained-bleeding")).toBeUndefined();
    });

    it("leaves the clinical group out when no symptom is present", () => {
        const qr = buildScreeningQuestionnaireResponse(
            { ...valid, signsAndSymptoms: { temperatureCelsius: 36.8, symptoms: [{ code: "cough", present: false }] } } as any,
            "42",
        );
        expect(qr.item.some((i: any) => i.linkId === "vhf-clinical")).toBe(false);
        expect(answerOf(qr.item, "screening-temperature")).toEqual([{ valueDecimal: 36.8 }]);
    });

    it("records the latest trip as the vhf-case trip into Kenya and earlier ones as stopovers", () => {
        const qr = buildScreeningQuestionnaireResponse(
            {
                ...valid,
                pointOfEntry: { name: "Busia OSBP" },
                travelHistory: {
                    hasTravelled: true,
                    trips: [
                        { country: "Uganda", city: "Kampala", departureDate: "2026-10-01", arrivalDate: "2026-10-05", purpose: "work" },
                        { country: "cd", city: "Goma", departureDate: "2026-10-08", arrivalDate: "2026-10-12", purpose: "trade" },
                    ],
                },
            } as any,
            "42",
        );
        const travel = items(qr, "vhf-travel");
        expect(travel.map((i) => i.linkId)).toEqual([
            "vhf-travelled",
            "vhf-travel-origin-country",
            "vhf-travel-origin-place",
            "vhf-travel-departure-date",
            "vhf-travel-stopovers",
            "vhf-travel-destination-country",
            "vhf-travel-destination-place",
            "vhf-travel-arrival-date",
        ]);
        expect(answerOf(travel, "vhf-travelled")).toEqual([{ valueCoding: { code: "yes", display: "Yes" } }]);
        expect(answerOf(travel, "vhf-travel-origin-country")).toEqual([
            { valueCoding: { system: "urn:iso:std:iso:3166", code: "CD", display: "Congo (Democratic Republic)" } },
        ]);
        expect(answerOf(travel, "vhf-travel-stopovers")).toEqual([{ valueString: "Uganda, Kampala 2026-10-01–2026-10-05" }]);
        expect(answerOf(travel, "vhf-travel-destination-country")[0].valueCoding.code).toBe("KE");
        expect(answerOf(travel, "vhf-travel-destination-place")).toEqual([{ valueString: "Busia OSBP" }]);
        expect(answerOf(qr.item, "screening-travel-purpose")).toEqual([{ valueString: "trade" }]);
    });

    it("answers vhf-travelled no without trip details", () => {
        const qr = buildScreeningQuestionnaireResponse({ ...valid, travelHistory: { hasTravelled: false } } as any, "42");
        expect(items(qr, "vhf-travel")).toEqual([
            { linkId: "vhf-travelled", answer: [{ valueCoding: { code: "no", display: "No" } }] },
        ]);
    });

    it("references the point-of-entry Location when given", () => {
        const pointOfEntry = { name: "Busia One Stop Border Post", type: "border", locationId: "POE-BUSIA" };
        const qr = buildScreeningQuestionnaireResponse({ ...valid, pointOfEntry } as any, "42");
        const poe = items(qr, "point-of-entry");
        expect(answerOf(poe, "point-of-entry.location")[0].valueReference).toEqual({
            reference: "Location/POE-BUSIA",
            display: "Busia One Stop Border Post",
        });
        expect(validateScreeningPayload({ ...valid, pointOfEntry: { ...pointOfEntry, locationId: "" } }).ok).toBe(false);
    });
});

describe("migrateLegacyScreeningResponse", () => {
    const patient = buildScreenedPatient(
        { ...valid.patient, phone: "0712345678" } as any,
        "SCR-1",
    );
    const legacy = {
        resourceType: "QuestionnaireResponse",
        id: "qr-1",
        meta: { versionId: "1", tag: [{ system: "http://nphiis.health.go.ke/fhir/CodeSystem/screening-outcome", code: "suspected" }] },
        identifier: { system: "x", value: "scr-old" },
        subject: { reference: "Patient/42" },
        authored: "2026-10-12T09:00:00Z",
        item: [
            {
                linkId: "point-of-entry",
                item: [
                    { linkId: "point-of-entry.name", answer: [{ valueString: "Busia OSBP" }] },
                    { linkId: "point-of-entry.type", answer: [{ valueString: "border" }] },
                    { linkId: "point-of-entry.location", answer: [{ valueReference: { reference: "Location/POE-BUSIA", display: "Busia OSBP" } }] },
                ],
            },
            {
                linkId: "travel-history",
                item: [
                    { linkId: "travel-history.has-travelled", answer: [{ valueBoolean: true }] },
                    {
                        linkId: "travel-history.trip",
                        item: [
                            { linkId: "travel-history.trip.country", answer: [{ valueString: "Uganda" }] },
                            { linkId: "travel-history.trip.arrival-date", answer: [{ valueDate: "2026-10-11" }] },
                            { linkId: "travel-history.trip.purpose", answer: [{ valueString: "trade" }] },
                        ],
                    },
                ],
            },
            {
                linkId: "signs-symptoms",
                item: [
                    { linkId: "signs-symptoms.temperature", answer: [{ valueDecimal: 38.4 }] },
                    {
                        linkId: "signs-symptoms.symptom",
                        answer: [
                            {
                                valueCoding: { code: "fever" },
                                item: [
                                    { linkId: "signs-symptoms.symptom.present", answer: [{ valueBoolean: true }] },
                                    { linkId: "signs-symptoms.symptom.onset-date", answer: [{ valueDate: "2026-10-10" }] },
                                ],
                            },
                        ],
                    },
                    {
                        linkId: "signs-symptoms.symptom",
                        answer: [{ valueCoding: { code: "cough" }, item: [{ linkId: "signs-symptoms.symptom.present", answer: [{ valueBoolean: false }] }] }],
                    },
                ],
            },
        ],
    };

    it("rewrites the items with vhf-case linkIds and keeps the rest of the response", () => {
        const migrated = migrateLegacyScreeningResponse(legacy, { ...patient, id: "42" })!;
        expect(migrated.id).toBe("qr-1");
        expect(migrated.identifier).toEqual(legacy.identifier);
        expect(migrated.meta).toEqual(legacy.meta);
        expect(migrated.authored).toBe(legacy.authored);
        expect(migrated.item.map((i: any) => i.linkId)).toEqual([
            "vhf-demographics",
            "vhf-clinical",
            "vhf-travel",
            "point-of-entry",
            "screening-temperature",
            "screening-travel-purpose",
        ]);
        const demo = items(migrated, "vhf-demographics");
        expect(answerOf(demo, "486402457213")).toEqual([{ valueString: "Doe" }]);
        expect(answerOf(demo, "vhf-national-id")).toEqual([{ valueString: "12345678" }]);
        expect(answerOf(demo, "vhf-phone")).toEqual([{ valueString: "0712345678" }]);
        expect(answerOf(items(migrated, "vhf-clinical"), "vhf-symptoms")).toEqual([{ valueCoding: { code: "fever", display: "Fever" } }]);
        const travel = items(migrated, "vhf-travel");
        expect(answerOf(travel, "vhf-travel-origin-country")[0].valueCoding.code).toBe("UG");
        expect(answerOf(travel, "vhf-travel-destination-place")).toEqual([{ valueString: "Busia OSBP" }]);
        expect(answerOf(items(migrated, "point-of-entry"), "point-of-entry.location")[0].valueReference.reference).toBe(
            "Location/POE-BUSIA",
        );
    });

    it("leaves responses already in the vhf-case shape alone", () => {
        const migrated = migrateLegacyScreeningResponse(legacy, patient)!;
        expect(isLegacyScreeningResponse(migrated)).toBe(false);
        expect(migrateLegacyScreeningResponse(migrated, patient)).toBeNull();
        expect(migrateLegacyScreeningResponse(buildScreeningQuestionnaireResponse(valid as any, "42"), patient)).toBeNull();
    });

    it("migrates without a Patient, keeping the screening answers", () => {
        const migrated = migrateLegacyScreeningResponse(legacy, null)!;
        expect(migrated.item[0].linkId).toBe("vhf-clinical");
    });
});

describe("countryCoding", () => {
    it("matches ISO codes and names, and keeps unknown text", () => {
        expect(countryCoding("ug").code).toBe("UG");
        expect(countryCoding("tanzania")).toEqual({ system: "urn:iso:std:iso:3166", code: "TZ", display: "Tanzania" });
        expect(countryCoding("Democratic Republic of the Congo").code).toBe("CD");
        expect(countryCoding("UAE").code).toBe("AE");
        expect(countryCoding("Atlantis")).toEqual({ system: "urn:iso:std:iso:3166", display: "Atlantis" });
    });
});

import { describe, expect, it } from "vitest";
import {
    SCREENING_TAG_CODE,
    buildScreenedPatient,
    buildScreeningQuestionnaireResponse,
    mergeIntoExistingPatient,
    patientHasIdentifier,
    validateScreeningPayload,
} from "./screening";

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

    it("gives the patient a Screening No. in the shape mobile writes", () => {
        const p = buildScreenedPatient(valid.patient as any, "SCR-2026-40560");
        expect(p.identifier[0]).toEqual({
            type: {
                coding: [{ system: "vhf-screened", code: "vhf-screened", display: "VHF Screening" }],
                text: "Screening No.",
            },
            system: "vhf-screening-number",
            value: "SCR-2026-40560",
        });
        expect(buildScreenedPatient(valid.patient as any).identifier.some((i: any) => i.system === "vhf-screening-number")).toBe(false);
    });

    it("adds a new Screening No. to an existing patient once, keeping earlier ones", () => {
        const first = mergeIntoExistingPatient(
            { resourceType: "Patient", id: "9", identifier: [] },
            buildScreenedPatient(valid.patient as any, "SCR-1"),
        );
        const again = mergeIntoExistingPatient(first, buildScreenedPatient(valid.patient as any, "SCR-1"));
        const second = mergeIntoExistingPatient(again, buildScreenedPatient(valid.patient as any, "SCR-2"));
        const numbers = (p: any) => p.identifier.filter((i: any) => i.system === "vhf-screening-number").map((i: any) => i.value);
        expect(numbers(again)).toEqual(["SCR-1"]);
        expect(numbers(second)).toEqual(["SCR-1", "SCR-2"]);
    });

    it("merges into an existing patient without overwriting", () => {
        const existing = { resourceType: "Patient", id: "9", gender: "male", identifier: [{ system: "x", value: "12345678" }] };
        const merged = mergeIntoExistingPatient(existing, buildScreenedPatient(valid.patient as any));
        expect(merged.gender).toBe("male");
        expect(merged.birthDate).toBe("1990-02-01");
        expect(merged.meta.tag.some((t: any) => t.code === SCREENING_TAG_CODE)).toBe(true);
    });
});

describe("buildScreeningQuestionnaireResponse", () => {
    it("links the patient, keeps denied symptoms and tags the outcome", () => {
        const qr = buildScreeningQuestionnaireResponse(valid as any, "42");
        expect(qr.subject.reference).toBe("Patient/42");
        expect(qr.identifier.value).toBe("scr-1");
        expect(qr.meta.tag.map((t: any) => t.code)).toEqual(["screened", "referred"]);
        const symptoms = qr.item.find((i: any) => i.linkId === "signs-symptoms")!.item!;
        expect(symptoms.filter((i: any) => i.linkId === "signs-symptoms.symptom")).toHaveLength(2);
    });
});

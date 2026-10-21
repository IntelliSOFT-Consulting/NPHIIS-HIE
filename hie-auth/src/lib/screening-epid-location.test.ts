import { describe, expect, it } from "vitest";
import { resolveLocationNamesForEncounter } from "./epid-location-segment";
import { buildScreeningQuestionnaireResponse, ScreeningPayload } from "./screening";
import { screeningLocationCandidates, screeningSubCountyForPatient, subCountyAbove } from "./screening-epid-location";

const loc = (id: string, name: string, code: string, partOf?: string) => ({
    resourceType: "Location",
    id,
    name,
    type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-RoleCode", code }] }],
    ...(partOf ? { partOf: { reference: `Location/${partOf}` } } : {}),
});

const LOCATIONS: Record<string, any> = {
    "0": loc("0", "Kenya", "COUNTRY"),
    "2": loc("2", "KWALE", "COUNTY", "0"),
    "LUNGA-LUNGA": loc("LUNGA-LUNGA", "LUNGA LUNGA", "SUB-COUNTY", "2"),
    VANGA: loc("VANGA", "VANGA", "WARD", "LUNGA-LUNGA"),
    "23135": loc("23135", "PANGANI DISPENSARY (LUNGALUNGA)", "FACILITY", "VANGA"),
    // A point of entry under its sub-county, and one mapped to a port health facility.
    "POE-LUNGA-LUNGA": loc("POE-LUNGA-LUNGA", "Lunga Lunga One Stop Border Post", "POE", "LUNGA-LUNGA"),
    "POE-VIA-FACILITY": loc("POE-VIA-FACILITY", "Shimoni Port", "POE", "23135"),
    "POE-ORPHAN": loc("POE-ORPHAN", "Unmapped post", "POE"),
};

const payload = (pointOfEntry?: ScreeningPayload["pointOfEntry"]): ScreeningPayload => ({
    screeningId: "s-1",
    screenedAt: "2026-10-21T10:00:00+03:00",
    outcome: "suspected",
    ...(pointOfEntry ? { pointOfEntry } : {}),
    patient: { identifiers: [{ type: "National ID", value: "1" }] },
});

const site = {
    role: "VACCINATOR",
    county: { id: "2", name: "KWALE" },
    subCounty: { id: "LUNGA-LUNGA", name: "LUNGA LUNGA" },
    ward: { id: "VANGA", name: "VANGA" },
    facility: { id: "23135", name: "PANGANI DISPENSARY (LUNGALUNGA)" },
};

function fakeFhir(qrs: any[], observations: any[] = []) {
    const calls: string[] = [];
    const api = async ({ url }: { url: string }) => {
        calls.push(url);
        const m = /^\/Location\/([^?]+)$/.exec(url);
        if (m) return { status: "success", data: LOCATIONS[decodeURIComponent(m[1])] ?? { resourceType: "OperationOutcome" } };
        if (url.startsWith("/QuestionnaireResponse?")) return { status: "success", data: { entry: qrs.map((resource) => ({ resource })) } };
        if (url.startsWith("/Observation?")) return { status: "success", data: { entry: observations.map((resource) => ({ resource })) } };
        if (url.startsWith("/Encounter/")) return { status: "success", data: { resourceType: "Encounter", subject: { reference: "Patient/p1" } } };
        if (url.startsWith("/Location?")) return { status: "success", data: { entry: [] } };
        throw new Error(`unexpected ${url}`);
    };
    return { api, calls };
}

describe("subCountyAbove", () => {
    it("returns a SUB-COUNTY Location as is", async () => {
        expect((await subCountyAbove(fakeFhir([]).api, "LUNGA-LUNGA"))?.id).toBe("LUNGA-LUNGA");
    });
    it("walks a facility up through its ward", async () => {
        expect((await subCountyAbove(fakeFhir([]).api, "23135"))?.id).toBe("LUNGA-LUNGA");
    });
    it("walks a point of entry mapped to a facility", async () => {
        expect((await subCountyAbove(fakeFhir([]).api, "POE-VIA-FACILITY"))?.id).toBe("LUNGA-LUNGA");
    });
    it("is undefined when the chain never reaches a sub-county", async () => {
        expect(await subCountyAbove(fakeFhir([]).api, "POE-ORPHAN")).toBeUndefined();
        expect(await subCountyAbove(fakeFhir([]).api, "missing")).toBeUndefined();
    });
});

describe("screeningLocationCandidates", () => {
    it("puts the point of entry before the reporting facility, ward and sub-county", () => {
        const qr = buildScreeningQuestionnaireResponse(
            payload({ name: "Lunga Lunga", type: "border", locationId: "POE-LUNGA-LUNGA" }),
            "p1",
            site,
        );
        expect(screeningLocationCandidates(qr)).toEqual(["POE-LUNGA-LUNGA", "23135", "VANGA", "LUNGA-LUNGA"]);
    });
    it("reads reporting sites filed under a suffixed level group", () => {
        const qr = buildScreeningQuestionnaireResponse(payload(), "p1", { ...site, role: "ADMINISTRATOR" });
        expect(screeningLocationCandidates(qr)).toEqual(["23135", "VANGA", "LUNGA-LUNGA"]);
    });
    it("is empty for a screening with no places", () => {
        expect(screeningLocationCandidates(buildScreeningQuestionnaireResponse(payload(), "p1"))).toEqual([]);
    });
});

describe("screeningSubCountyForPatient", () => {
    it("uses the point of entry", async () => {
        const qr = buildScreeningQuestionnaireResponse(payload({ name: "Shimoni", locationId: "POE-VIA-FACILITY" }), "p1");
        expect((await screeningSubCountyForPatient(fakeFhir([qr]).api, "p1"))?.id).toBe("LUNGA-LUNGA");
    });
    it("falls back to the reporting facility when the point of entry is unmapped", async () => {
        const qr = buildScreeningQuestionnaireResponse(payload({ name: "Unmapped", locationId: "POE-ORPHAN" }), "p1", site);
        expect((await screeningSubCountyForPatient(fakeFhir([qr]).api, "p1"))?.id).toBe("LUNGA-LUNGA");
    });
    it("is undefined without a screening", async () => {
        expect(await screeningSubCountyForPatient(fakeFhir([]).api, "p1")).toBeUndefined();
    });
});

describe("resolveLocationNamesForEncounter", () => {
    it("places a converted screening with no case form at its point of entry", async () => {
        const qr = buildScreeningQuestionnaireResponse(payload({ name: "Lunga Lunga", locationId: "POE-LUNGA-LUNGA" }), "p1");
        expect(await resolveLocationNamesForEncounter("e1", fakeFhir([qr]).api as any)).toEqual({
            countryName: "KENYA",
            countyName: "KWALE",
            subCountyName: "LUNGA LUNGA",
        });
    });
    it("leaves the screening alone when the case form gave a sub-county", async () => {
        const { api, calls } = fakeFhir([], [{ valueString: "LUNGA LUNGA" }]);
        const realApi = async (p: { url: string }) =>
            p.url.startsWith("/Location?") ? { status: "success", data: { entry: [{ resource: LOCATIONS["LUNGA-LUNGA"] }] } } : api(p);
        expect((await resolveLocationNamesForEncounter("e1", realApi as any))?.subCountyName).toBe("LUNGA LUNGA");
        expect(calls.some((u) => u.startsWith("/QuestionnaireResponse"))).toBe(false);
    });
    it("is null when neither source places the case", async () => {
        expect(await resolveLocationNamesForEncounter("e1", fakeFhir([]).api as any)).toBeNull();
    });
});

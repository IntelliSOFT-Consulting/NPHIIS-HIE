import { beforeEach, describe, expect, it, vi } from "vitest";

const fhir = vi.hoisted(() => ({ FhirApi: vi.fn() }));
const segment = vi.hoisted(() => ({
    buildEpidFormattedId: vi.fn(() => "KEN-KWA-LUL-2026-VHF-001"),
    resolveLocationNamesForEncounter: vi.fn(async () => ({ countryName: "KENYA", countyName: "KWALE", subCountyName: "LUNGA LUNGA" })),
}));
vi.mock("./utils", () => ({ FhirApi: fhir.FhirApi, FhirIdentifier: vi.fn((system: string, _c: string, _d: string, value: string) => ({ system, value, use: "official" })) }));
vi.mock("./caseIdTracker", () => ({ generateCaseId: vi.fn(async () => 1) }));
vi.mock("./fhir", () => ({ processFollowUpObservations: vi.fn() }));
vi.mock("./notification", () => ({ notifyCaseSubmissionIfEnabled: vi.fn() }));
vi.mock("./nphl-lab-sync", () => ({ queueCaseSync: vi.fn() }));
vi.mock("./epid-location-segment", () => segment);
vi.mock("./county-segment-registry", () => ({ resolveCountyLocationSegment: vi.fn(async () => "KWA") }));

import { assignEpidForEncounter } from "./epid-assignment";

const created = (value: string) => ({ system: "system-creation", value, type: { coding: [{ code: "system_creation" }] } });

function hapi(store: Record<string, any>) {
    fhir.FhirApi.mockImplementation(async ({ url, method, data }: any) => {
        if (method === "PUT") {
            store[url] = JSON.parse(data);
            return { status: "success", data: store[url] };
        }
        if (url.includes("?") || url.includes("/_history")) return { status: "success", data: { entry: [] } };
        return store[url] ? { status: "success", data: store[url] } : { status: "error", data: {} };
    });
}

const encounter = (identifier: any[]) => ({
    resourceType: "Encounter",
    id: "e1",
    subject: { reference: "Patient/p1" },
    reasonCode: [{ coding: [{ code: "VHF Case Information" }] }],
    identifier,
});

beforeEach(() => {
    fhir.FhirApi.mockReset();
    segment.buildEpidFormattedId.mockClear();
});

describe("EPID year", () => {
    it("comes from the case Encounter when the Patient (e.g. a screened one) has no creation date", async () => {
        hapi({
            "/Encounter/e1": encounter([created("2026-10-21 14:27:12")]),
            "/Patient/p1": { resourceType: "Patient", id: "p1", birthDate: "1987-04-11", identifier: [] },
        });
        await assignEpidForEncounter(encounter([created("2026-10-21 14:27:12")]));
        expect(segment.buildEpidFormattedId).toHaveBeenCalledWith("KENYA", "KWA", "LUNGA LUNGA", 2026, "VHF", 1);
    });

    it("still prefers the Patient's creation date", async () => {
        hapi({
            "/Encounter/e1": encounter([created("2026-10-21 14:27:12")]),
            "/Patient/p1": { resourceType: "Patient", id: "p1", birthDate: "1987-04-11", identifier: [created("2025-12-30 09:00:00")] },
        });
        await assignEpidForEncounter(encounter([]));
        expect(segment.buildEpidFormattedId).toHaveBeenCalledWith("KENYA", "KWA", "LUNGA LUNGA", 2025, "VHF", 1);
    });
});

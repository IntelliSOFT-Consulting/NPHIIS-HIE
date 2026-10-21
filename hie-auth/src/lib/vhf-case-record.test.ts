import { beforeEach, describe, expect, it, vi } from "vitest";

const fhir = vi.hoisted(() => ({ FhirApi: vi.fn() }));
vi.mock("./utils", () => ({ FhirApi: fhir.FhirApi }));

import { completeVhfCaseRecord, VHF_CASE_SYSTEM } from "./vhf-case-record";

const EPID = "KEN-KWA-LUL-2026-VHF-001";
const encounter = {
    resourceType: "Encounter",
    id: "e1",
    subject: { reference: "Patient/p1" },
    identifier: [{ system: "http://hie.org/identifiers/EPID", value: EPID }],
};
const stub = (value: string) => ({
    resourceType: "Observation",
    id: "o1",
    meta: { versionId: "1" },
    code: { coding: [{ system: "http://snomed.info/sct", code: "EPID" }], text: value },
    valueString: value,
});

function hapi(patient: any, observations: any[]) {
    const writes: Array<{ url: string; method: string; body: any }> = [];
    fhir.FhirApi.mockImplementation(async ({ url, method, data }: any) => {
        if (method === "PUT" || method === "POST") {
            const body = JSON.parse(data);
            writes.push({ url, method, body });
            return { status: "success", data: body };
        }
        if (url.startsWith("/Observation?")) return { status: "success", data: { entry: observations.map((resource) => ({ resource })) } };
        if (url === "/Patient/p1") return { status: "success", data: patient };
        return { status: "error", data: {} };
    });
    return writes;
}

beforeEach(() => {
    fhir.FhirApi.mockReset();
});

describe("completeVhfCaseRecord", () => {
    it("tags a converted screening's Patient as a VHF case record and completes the EPID stub", async () => {
        const writes = hapi({ resourceType: "Patient", id: "p1", identifier: [{ system: "vhf-screening-number", value: "SCR-1" }] }, [
            stub("KEN-BUS-BUN-2026-VHF-"),
        ]);

        expect(await completeVhfCaseRecord(encounter)).toEqual({ patientTagged: true, epidObservations: 1 });

        const patient = writes.find((w) => w.url === "/Patient/p1")!.body;
        expect(patient.identifier).toContainEqual(expect.objectContaining({ system: VHF_CASE_SYSTEM, value: "e1" }));
        expect(patient.identifier).toContainEqual({ system: "vhf-screening-number", value: "SCR-1" });
        const obs = writes.find((w) => w.url === "/Observation/o1")!;
        expect(obs.body.valueString).toBe(EPID);
        expect(obs.body.code.text).toBe(EPID);
    });

    it("adds an EPID Observation when the app sent none", async () => {
        const writes = hapi({ resourceType: "Patient", id: "p1", identifier: [{ system: VHF_CASE_SYSTEM, value: "e1" }] }, []);
        expect(await completeVhfCaseRecord(encounter)).toEqual({ patientTagged: false, epidObservations: 1 });
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({
            url: "/Observation",
            method: "POST",
            body: { valueString: EPID, encounter: { reference: "Encounter/e1" }, subject: { reference: "Patient/p1" } },
        });
    });

    it("changes nothing on a complete record", async () => {
        const writes = hapi({ resourceType: "Patient", id: "p1", identifier: [{ system: VHF_CASE_SYSTEM, value: "other" }] }, [stub(EPID)]);
        expect(await completeVhfCaseRecord(encounter)).toEqual({ patientTagged: false, epidObservations: 0 });
        expect(writes).toHaveLength(0);
    });
});

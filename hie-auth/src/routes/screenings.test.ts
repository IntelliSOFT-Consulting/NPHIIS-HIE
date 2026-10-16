import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const fhir = vi.hoisted(() => ({ FhirApi: vi.fn() }));
vi.mock("../lib/utils", () => fhir);
vi.mock("../lib/middleware", () => ({
    authenticateUser: (req: any, res: any, next: any) =>
        req.headers.authorization ? next() : res.status(401).json({ status: "error" }),
}));

import router from "./screenings";

const body = {
    screeningId: "scr-1",
    patient: { identifiers: [{ type: "National ID", value: "12345678" }], givenNames: ["Jane"] },
    travelHistory: { hasTravelled: false },
};
const ok = (data: any) => ({ status: "success", data });
const bundle = (...r: any[]) => ok({ entry: r.map((resource) => ({ resource })) });

let server: Server;
let base: string;
beforeAll(async () => {
    const app = express();
    app.use("/provider/screenings", router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/provider/screenings`;
});
afterAll(() => server.close());
beforeEach(() => fhir.FhirApi.mockReset());

const post = (payload: any, headers: Record<string, string> = { authorization: "Bearer token" }) =>
    fetch(base, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(payload) });

describe("POST /provider/screenings", () => {
    it("requires a Bearer token", async () => {
        expect((await post(body, {})).status).toBe(401);
    });

    it("returns 400 with errors for an invalid payload", async () => {
        const res = await post({ patient: {} });
        expect(res.status).toBe(400);
        expect((await res.json()).errors.length).toBeGreaterThan(0);
        expect(fhir.FhirApi).not.toHaveBeenCalled();
    });

    it("creates the patient and QR when nothing matches", async () => {
        fhir.FhirApi
            .mockResolvedValueOnce(bundle()) // idempotency lookup
            .mockResolvedValueOnce(bundle()) // patient search
            .mockResolvedValueOnce(ok({ id: "p1" })) // patient create
            .mockResolvedValueOnce(ok({ id: "q1" })); // QR create
        const res = await post(body);
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ patientCreated: true, patientId: "p1", questionnaireResponseId: "q1" });
        const patientPost = fhir.FhirApi.mock.calls[2][0];
        expect(JSON.parse(patientPost.data).meta.profile[0]).toContain("screened-patient");
        // No screeningNumber in the body: the Screening No. falls back to screeningId
        expect(JSON.parse(patientPost.data).identifier).toContainEqual(
            expect.objectContaining({ system: "vhf-screening-number", value: "scr-1" }),
        );
        const qrPost = fhir.FhirApi.mock.calls[3][0];
        expect(qrPost.headers["If-None-Exist"]).toContain("scr-1");
        expect(JSON.parse(qrPost.data).subject.reference).toBe("Patient/p1");
    });

    it("bypasses HAPI's search cache for the lookups that decide whether to create", async () => {
        fhir.FhirApi
            .mockResolvedValueOnce(bundle())
            .mockResolvedValueOnce(bundle())
            .mockResolvedValueOnce(ok({ id: "p1" }))
            .mockResolvedValueOnce(ok({ id: "q1" }));
        await post(body);
        const [idempotency, patientSearch] = fhir.FhirApi.mock.calls.map((c: any[]) => c[0]);
        expect(idempotency.headers["Cache-Control"]).toBe("no-cache");
        expect(patientSearch.headers["Cache-Control"]).toBe("no-cache");
    });

    it("updates a single matching patient instead of creating one", async () => {
        const existing = { resourceType: "Patient", id: "p9", identifier: [{ system: "x", value: "12345678" }] };
        fhir.FhirApi
            .mockResolvedValueOnce(bundle())
            .mockResolvedValueOnce(bundle(existing))
            .mockResolvedValueOnce(ok({ ...existing }))
            .mockResolvedValueOnce(ok({ id: "q2" }));
        const res = await post(body);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ patientCreated: false, patientId: "p9" });
        expect(fhir.FhirApi.mock.calls[2][0].method).toBe("PUT");
    });

    it("writes the screeningNumber as the patient's Screening No.", async () => {
        const existing = { resourceType: "Patient", id: "p9", identifier: [{ system: "x", value: "12345678" }] };
        fhir.FhirApi
            .mockResolvedValueOnce(bundle())
            .mockResolvedValueOnce(bundle(existing))
            .mockResolvedValueOnce(ok({ ...existing }))
            .mockResolvedValueOnce(ok({ id: "q3" }));
        await post({ ...body, screeningNumber: "SCR-2026-40560" });
        const ids = JSON.parse(fhir.FhirApi.mock.calls[2][0].data).identifier;
        for (const system of ["vhf-screening-number", "vhf-screened"]) {
            expect(ids).toContainEqual({
                type: {
                    coding: [{ system: "vhf-screened", code: "vhf-screened", display: "VHF Screening" }],
                    text: "Screening No.",
                },
                system,
                value: "SCR-2026-40560",
            });
        }
    });

    it("409s when identifiers match several patients", async () => {
        const mk = (id: string) => ({ resourceType: "Patient", id, identifier: [{ value: "12345678" }] });
        fhir.FhirApi.mockResolvedValueOnce(bundle()).mockResolvedValueOnce(bundle(mk("a"), mk("b")));
        const res = await post(body);
        expect(res.status).toBe(409);
        expect((await res.json()).patientIds).toEqual(["a", "b"]);
    });

    it("is idempotent on screeningId", async () => {
        fhir.FhirApi.mockResolvedValueOnce(bundle({ id: "q1", subject: { reference: "Patient/p1" } }));
        const res = await post(body);
        expect(await res.json()).toMatchObject({ duplicate: true, patientId: "p1", questionnaireResponseId: "q1" });
        expect(fhir.FhirApi).toHaveBeenCalledTimes(1);
    });

    it("502s with the patientId when the QR save fails", async () => {
        fhir.FhirApi
            .mockResolvedValueOnce(bundle())
            .mockResolvedValueOnce(bundle())
            .mockResolvedValueOnce(ok({ id: "p1" }))
            .mockResolvedValueOnce({ status: "error", data: {} });
        const res = await post(body);
        expect(res.status).toBe(502);
        expect((await res.json()).patientId).toBe("p1");
    });
});

describe("GET /provider/screenings/patients", () => {
    it("searches by the screened tag", async () => {
        fhir.FhirApi.mockResolvedValueOnce(bundle({ id: "p1" }));
        const res = await fetch(`${base}/patients?_count=5`, { headers: { authorization: "Bearer token" } });
        expect(res.status).toBe(200);
        expect(decodeURIComponent(fhir.FhirApi.mock.calls[0][0].url)).toContain("_tag=http://nphiis.health.go.ke/fhir/CodeSystem/record-origin|screened");
    });
});

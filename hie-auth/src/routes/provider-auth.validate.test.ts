import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const cr = vi.hoisted(() => ({ lookupClientRegistryPatient: vi.fn() }));
const iprs = vi.hoisted(() => ({ lookupIprsPatient: vi.fn() }));

vi.mock("../lib/client-registry", () => cr);
vi.mock("../lib/iprs", () => iprs);
vi.mock("../lib/middleware", () => ({
    authenticateUser: (req: any, res: any, next: any) =>
        req.headers.authorization
            ? next()
            : res.status(401).json({ status: "error" }),
}));
// Unrelated heavy dependencies of the router module
vi.mock("../lib/utils", () => ({}));
vi.mock("../lib/keycloak", () => ({}));
vi.mock("../lib/email", () => ({}));
vi.mock("../lib/superset", () => ({}));
vi.mock("../lib/practitioner-role", () => ({}));
vi.mock("../lib/practitioner-role-backfill", () => ({}));
vi.mock("../lib/practitioner-role-resource-backfill", () => ({}));
vi.mock("../lib/notification-backfill-job", () => ({}));
vi.mock("../lib/roles", () => ({}));

let server: Server;
let base: string;

beforeAll(async () => {
    const { default: router } = await import("./provider-auth");
    const app = express();
    app.use("/provider", router);
    await new Promise<void>((r) => {
        server = app.listen(0, () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/provider`;
});

afterAll(() => {
    server?.close();
});

beforeEach(() => {
    cr.lookupClientRegistryPatient.mockReset();
    iprs.lookupIprsPatient.mockReset();
});

const get = (qs: string, auth = true) =>
    fetch(`${base}/patients/validate?${qs}`, {
        headers: auth ? { Authorization: "Bearer x" } : {},
    });
const Q = "identification_number=12345678&identification_type=National%20ID";

describe("GET /provider/patients/validate", () => {
    it("401 without bearer token", async () => {
        expect((await get(Q, false)).status).toBe(401);
    });

    it("400 on missing or invalid params", async () => {
        expect((await get("identification_number=1")).status).toBe(400);
        expect((await get("identification_number=1&identification_type=Bogus")).status).toBe(400);
        expect(cr.lookupClientRegistryPatient).not.toHaveBeenCalled();
    });

    it("returns CR patient and skips IPRS when CR finds", async () => {
        cr.lookupClientRegistryPatient.mockResolvedValue({ status: "found", data: { first_name: "Jane" } });
        const res = await get(Q);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ found: true, source: "client-registry" });
        expect(body.patient.resourceType).toBe("Patient");
        expect(body.patient.meta.profile[0]).toContain("client-registry-patient");
        expect(iprs.lookupIprsPatient).not.toHaveBeenCalled();
    });

    it("falls back to IPRS when CR not found", async () => {
        cr.lookupClientRegistryPatient.mockResolvedValue({ status: "not_found" });
        iprs.lookupIprsPatient.mockResolvedValue({ status: "found", data: { first_name: "John" } });
        const body = await (await get(Q)).json();
        expect(body).toMatchObject({ found: true, source: "iprs" });
        expect(body.patient.meta.profile[0]).toContain("iprs-patient");
    });

    it("found:false when both miss", async () => {
        cr.lookupClientRegistryPatient.mockResolvedValue({ status: "not_found" });
        iprs.lookupIprsPatient.mockResolvedValue({ status: "not_found" });
        const res = await get(Q);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "success", found: false });
    });

    it("502 on CR error without falling through to IPRS", async () => {
        cr.lookupClientRegistryPatient.mockResolvedValue({ status: "error", error: "boom" });
        expect((await get(Q)).status).toBe(502);
        expect(iprs.lookupIprsPatient).not.toHaveBeenCalled();
    });

    it("502 on IPRS error", async () => {
        cr.lookupClientRegistryPatient.mockResolvedValue({ status: "not_found" });
        iprs.lookupIprsPatient.mockResolvedValue({ status: "error", error: "down" });
        expect((await get(Q)).status).toBe(502);
    });

    it("503 when CR or IPRS is misconfigured", async () => {
        cr.lookupClientRegistryPatient.mockResolvedValue({ status: "misconfigured", error: "CR_BASE_URL not set" });
        expect((await get(Q)).status).toBe(503);
        cr.lookupClientRegistryPatient.mockResolvedValue({ status: "not_found" });
        iprs.lookupIprsPatient.mockResolvedValue({ status: "misconfigured", error: "IPRS_BASE_URL not set" });
        expect((await get(Q)).status).toBe(503);
    });
});

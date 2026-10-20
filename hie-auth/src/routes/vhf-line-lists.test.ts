import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const kc = vi.hoisted(() => ({
    validateBearerToken: (req: any) => req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? null,
    validateUserAuthentication: vi.fn(),
    findKeycloakUser: vi.fn(),
    getClientCredentialsToken: vi.fn(),
}));
const lists = vi.hoisted(() => ({ fetchLineList: vi.fn() }));

// Real REPORTS_CLIENT_IDS / token helpers, mocked Keycloak calls.
vi.mock("../lib/keycloak", async () => ({ ...kc, ...(await import("../lib/reports-client")) }));
vi.mock("../lib/practitioner-role", () => ({ resolvePractitionerAssignment: vi.fn().mockResolvedValue(null) }));
vi.mock("../lib/utils", () => ({ buildLocationInfo: vi.fn(), FhirApi: vi.fn() }));
vi.mock("../lib/vhf-line-lists", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../lib/vhf-line-lists")>()),
    fetchLineList: lists.fetchLineList,
}));

let server: Server;
let base: string;

beforeAll(async () => {
    const { default: router } = await import("./vhf-line-lists");
    const app = express();
    app.use("/reports/vhf", router);
    await new Promise<void>((r) => {
        server = app.listen(0, () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/reports/vhf`;
});

afterAll(() => {
    server?.close();
});

beforeEach(() => {
    process.env.REPORTS_CLIENT_IDS = "partner-reports, other-system";
    delete process.env.REPORTS_API_KEY;
    kc.validateUserAuthentication.mockReset();
    kc.findKeycloakUser.mockReset();
    kc.getClientCredentialsToken.mockReset();
    lists.fetchLineList.mockReset().mockResolvedValue({ total: 1, rows: [{ EPID: "X" }], columns: ["EPID"] });
});

/** An unsigned JWT-shaped token carrying the given claims (Keycloak's check is mocked). */
const jwt = (claims: object) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

const postToken = (body: Record<string, string>, form = false) =>
    fetch(`${base}/token`, {
        method: "POST",
        headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
        body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    });

describe("POST /reports/vhf/token", () => {
    it("returns a token for a listed client (JSON body)", async () => {
        kc.getClientCredentialsToken.mockResolvedValue({ access_token: "tok", expires_in: 1800 });

        const res = await postToken({ client_id: "partner-reports", client_secret: "s3cret" });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "success", access_token: "tok", token_type: "Bearer", expires_in: 1800 });
        expect(kc.getClientCredentialsToken).toHaveBeenCalledWith("partner-reports", "s3cret");
    });

    it("accepts a form body and HTTP Basic", async () => {
        kc.getClientCredentialsToken.mockResolvedValue({ access_token: "tok", expires_in: 1800 });

        expect((await postToken({ client_id: "other-system", client_secret: "a" }, true)).status).toBe(200);
        const basic = await fetch(`${base}/token`, {
            method: "POST",
            headers: { Authorization: `Basic ${Buffer.from("partner-reports:b").toString("base64")}` },
        });
        expect(basic.status).toBe(200);
        expect(kc.getClientCredentialsToken).toHaveBeenLastCalledWith("partner-reports", "b");
    });

    it("refuses an unlisted client without asking Keycloak", async () => {
        const res = await postToken({ client_id: "hie-auth", client_secret: "x" });

        expect(res.status).toBe(401);
        expect(kc.getClientCredentialsToken).not.toHaveBeenCalled();
    });

    it("401 on a wrong secret, 400 when fields are missing", async () => {
        kc.getClientCredentialsToken.mockResolvedValue(null);
        expect((await postToken({ client_id: "partner-reports", client_secret: "bad" })).status).toBe(401);
        expect((await postToken({ client_id: "partner-reports" })).status).toBe(400);
    });
});

describe("GET /reports/vhf/line-list auth", () => {
    const get = (token: string) =>
        fetch(`${base}/line-list?period=this_month`, { headers: { Authorization: `Bearer ${token}` } });

    it("lets a listed client's service account see all areas", async () => {
        kc.validateUserAuthentication.mockResolvedValue({ preferred_username: "service-account-partner-reports" });

        const res = await get(jwt({ azp: "partner-reports" }));

        expect(res.status).toBe(200);
        expect(lists.fetchLineList.mock.calls[0][1]).toEqual({ roles: ["ADMINISTRATOR"] });
        expect(kc.findKeycloakUser).not.toHaveBeenCalled();
    });

    it("refuses a service account of an unlisted client", async () => {
        kc.validateUserAuthentication.mockResolvedValue({ preferred_username: "service-account-hie-auth" });

        const res = await get(jwt({ azp: "hie-auth" }));

        expect(res.status).toBe(403);
        expect(lists.fetchLineList).not.toHaveBeenCalled();
    });

    it("treats a person who logged in through a listed client as a user, not all areas", async () => {
        kc.validateUserAuthentication.mockResolvedValue({ preferred_username: "12345678" });
        kc.findKeycloakUser.mockResolvedValue({ id: "u1" });

        const res = await get(jwt({ azp: "partner-reports" }));

        expect(res.status).toBe(200);
        expect(lists.fetchLineList.mock.calls[0][1]).toEqual({ roles: [] });
    });

    it("401 when Keycloak rejects the token", async () => {
        kc.validateUserAuthentication.mockResolvedValue(null);
        expect((await get(jwt({ azp: "partner-reports" }))).status).toBe(401);
    });
});

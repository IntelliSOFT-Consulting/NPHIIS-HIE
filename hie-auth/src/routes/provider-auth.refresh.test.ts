import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const kc = vi.hoisted(() => ({ refreshToken: vi.fn() }));

vi.mock("../lib/keycloak", () => kc);
// Unrelated heavy dependencies of the router module
vi.mock("../lib/middleware", () => ({ authenticateUser: vi.fn() }));
vi.mock("../lib/client-registry", () => ({}));
vi.mock("../lib/iprs", () => ({}));
vi.mock("../lib/utils", () => ({}));
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
    app.use(express.json());
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
    kc.refreshToken.mockReset();
});

const refresh = (refresh_token: string) =>
    fetch(`${base}/refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token }),
    });

describe("POST /provider/refresh_token", () => {
    it("returns the new token pair", async () => {
        kc.refreshToken.mockResolvedValue({ access_token: "a", refresh_token: "r", expires_in: 300 });

        const res = await refresh("good");

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ status: "success", access_token: "a", refresh_token: "r" });
    });

    it("rejects a refresh token Keycloak reports as invalid", async () => {
        kc.refreshToken.mockResolvedValue({ error: "invalid_grant", error_description: "Invalid refresh token" });

        const res = await refresh("expired");

        expect(res.status).toBe(401);
        expect((await res.json()).status).toBe("error");
    });
});

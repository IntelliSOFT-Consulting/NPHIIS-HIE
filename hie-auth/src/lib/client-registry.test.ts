import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupClientRegistryPatient, resetClientRegistryTokenCache } from "./client-registry";

const BASE = "https://cr.example/mw";
const params = { identificationNumber: "12345678", identificationType: "National ID" };

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    resetClientRegistryTokenCache();
    vi.stubEnv("CR_BASE_URL", BASE);
    vi.stubEnv("CR_API_TOKEN", "");
    vi.stubEnv("CR_CLIENT_ID", "id");
    vi.stubEnv("CR_CLIENT_SECRET", "secret");
    vi.stubEnv("CR_TOKEN_URL", "");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("lookupClientRegistryPatient with client credentials", () => {
    it("fetches a token, then searches with it", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok1", expires_in: 3600 }))
            .mockResolvedValueOnce(json(200, { id: "CR1", first_name: "A" }));

        const result = await lookupClientRegistryPatient(params);

        expect(result.status).toBe("found");
        const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
        expect(tokenUrl).toBe(`${BASE}/api/v1/tenants/token`);
        expect(tokenInit.body).toBe("client_id=id&client_secret=secret");
        const [searchUrl, searchInit] = fetchMock.mock.calls[1];
        expect(searchUrl).toContain(`${BASE}/api/v1/patients?identification_number=12345678`);
        expect(searchInit.headers.Authorization).toBe("Bearer tok1");
    });

    it("reuses the cached token across lookups", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok1", expires_in: 3600 }))
            .mockResolvedValueOnce(json(200, { id: "CR1" }))
            .mockResolvedValueOnce(json(200, { id: "CR2" }));

        await lookupClientRegistryPatient(params);
        await lookupClientRegistryPatient(params);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer tok1");
    });

    it("refreshes the token once on 401", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "old", expires_in: 3600 }))
            .mockResolvedValueOnce(json(401, { error: "Unauthorized" }))
            .mockResolvedValueOnce(json(200, { access_token: "new", expires_in: 3600 }))
            .mockResolvedValueOnce(json(200, { id: "CR1" }));

        const result = await lookupClientRegistryPatient(params);

        expect(result.status).toBe("found");
        expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe("Bearer new");
    });

    it("treats DHA's 400 'zero results found' as not_found", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok1", expires_in: 3600 }))
            .mockResolvedValueOnce(
                json(400, {
                    error: "Bad Request",
                    message: "failed to get patient record: zero results found in client registry fetch patient search response",
                })
            );

        expect((await lookupClientRegistryPatient(params)).status).toBe("not_found");
    });

    it("keeps other 400s as errors", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok1", expires_in: 3600 }))
            .mockResolvedValueOnce(json(400, { error: "Bad Request", message: "invalid identification_type" }));

        expect((await lookupClientRegistryPatient(params)).status).toBe("error");
    });

    it("reports a failed token request as an error", async () => {
        fetchMock.mockResolvedValueOnce(json(401, { error: "invalid_client" }));

        const result = await lookupClientRegistryPatient(params);

        expect(result).toMatchObject({ status: "error" });
        expect(result.error).toContain("token request returned HTTP 401");
    });
});

describe("lookupClientRegistryPatient with a static token", () => {
    it("uses CR_API_TOKEN when no client credentials are set", async () => {
        vi.stubEnv("CR_CLIENT_ID", "");
        vi.stubEnv("CR_CLIENT_SECRET", "");
        vi.stubEnv("CR_API_TOKEN", "static");
        fetchMock.mockResolvedValueOnce(json(200, { id: "CR1" }));

        await lookupClientRegistryPatient(params);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer static");
    });
});

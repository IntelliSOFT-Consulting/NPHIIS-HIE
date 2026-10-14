import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iprsAuthorizationHeader, lookupIprsPatient } from "./iprs";

beforeEach(() => {
    vi.stubEnv("IPRS_BASIC_AUTH", "");
    vi.stubEnv("IPRS_USERNAME", "");
    vi.stubEnv("IPRS_PASSWORD", "");
    vi.stubEnv("IPRS_API_TOKEN", "");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("iprsAuthorizationHeader", () => {
    it("builds Basic auth from username and password", () => {
        vi.stubEnv("IPRS_USERNAME", "user");
        vi.stubEnv("IPRS_PASSWORD", "pass");
        expect(iprsAuthorizationHeader()).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`);
    });

    it("sends IPRS_BASIC_AUTH as-is, taking precedence over username/password", () => {
        vi.stubEnv("IPRS_BASIC_AUTH", "dXNlcjpwYXNz");
        vi.stubEnv("IPRS_USERNAME", "other");
        vi.stubEnv("IPRS_PASSWORD", "other");
        expect(iprsAuthorizationHeader()).toBe("Basic dXNlcjpwYXNz");
    });

    it("does not double the Basic prefix", () => {
        vi.stubEnv("IPRS_BASIC_AUTH", "Basic dXNlcjpwYXNz");
        expect(iprsAuthorizationHeader()).toBe("Basic dXNlcjpwYXNz");
    });

    it("falls back to a Bearer token", () => {
        vi.stubEnv("IPRS_API_TOKEN", "tok");
        expect(iprsAuthorizationHeader()).toBe("Bearer tok");
    });

    it("sends nothing when unconfigured", () => {
        expect(iprsAuthorizationHeader()).toBeUndefined();
    });
});

describe("lookupIprsPatient", () => {
    const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.stubEnv("IPRS_BASE_URL", "https://iprs.example/");
        vi.stubEnv("IPRS_BASIC_AUTH", "dXNlcjpwYXNz");
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    it("queries lookup/persons as a citizen for a National ID", async () => {
        fetchMock.mockResolvedValueOnce(json(200, { data: { id_number: "32041729", first_name: "JANIS" } }));

        const result = await lookupIprsPatient({ identificationNumber: "32041729", identificationType: "National ID" });

        expect(result.status).toBe("found");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://iprs.example/api/v1/lookup/persons?id_number=32041729&type=citizen");
        expect(init.headers.Authorization).toBe("Basic dXNlcjpwYXNz");
    });

    it("queries as an alien for an Alien ID", async () => {
        fetchMock.mockResolvedValueOnce(json(200, { data: { id_number: "A1" } }));

        await lookupIprsPatient({ identificationNumber: "A1", identificationType: "Alien ID" });

        expect(fetchMock.mock.calls[0][0]).toContain("type=alien");
    });

    it("maps 404 to not_found", async () => {
        fetchMock.mockResolvedValueOnce(json(404, { errors: { detail: "Not Found" } }));

        const result = await lookupIprsPatient({ identificationNumber: "1", identificationType: "National ID" });

        expect(result.status).toBe("not_found");
    });

    it("skips IPRS for identification types it does not hold", async () => {
        const result = await lookupIprsPatient({ identificationNumber: "1", identificationType: "Birth Certificate" });

        expect(result.status).toBe("not_found");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

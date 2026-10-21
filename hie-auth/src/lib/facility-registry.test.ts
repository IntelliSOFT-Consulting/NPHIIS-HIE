import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetClientRegistryTokenCache } from "./client-registry";
import { searchFacilityRegistry, toFacilitySummary } from "./facility-registry";

const BASE = "https://mw.example/uat-middleware";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const record = {
    uuid: "u-1",
    officialName: "Kenyatta National Hospital",
    frCode: "FR-001",
    fidCode: "FID-47-13023",
    facilityType: "National Referral Hospital",
    kephLevel: "Level 6",
    facilityOwnership: "Ministry of Health",
    address: { county: "Nairobi", subCounty: "Dagoretti North", ward: "Kilimani" },
    regulatoryOperationalStatus: { operationalStatus: "Operational" },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    resetClientRegistryTokenCache();
    vi.stubEnv("CR_BASE_URL", BASE);
    vi.stubEnv("FR_BASE_URL", "");
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

describe("searchFacilityRegistry", () => {
    it("searches by name with the middleware token", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok", expires_in: 3600 }))
            .mockResolvedValueOnce(json(200, record));

        const result = await searchFacilityRegistry({ name: "Kenyatta" });

        expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/tenants/token`);
        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe(`${BASE}/api/v1/facilities/search?name=Kenyatta`);
        expect(init.headers.Authorization).toBe("Bearer tok");
        expect(result).toEqual({
            status: "found",
            facilities: [
                {
                    frCode: "FR-001",
                    fidCode: "FID-47-13023",
                    name: "Kenyatta National Hospital",
                    facilityType: "National Referral Hospital",
                    kephLevel: "Level 6",
                    ownership: "Ministry of Health",
                    county: "Nairobi",
                    subCounty: "Dagoretti North",
                    ward: "Kilimani",
                    operationalStatus: "Operational",
                },
            ],
        });
    });

    it("searches by identifier and reads a list response", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok", expires_in: 3600 }))
            .mockResolvedValueOnce(json(200, { data: [record, { ...record, frCode: "FR-002" }] }));

        const result = await searchFacilityRegistry({ identifier: "13023", identifierType: "mfl" });

        expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/v1/facilities/search?identifier=13023&identifier-type=mfl`);
        expect(result.status === "found" && result.facilities.map((f) => f.frCode)).toEqual(["FR-001", "FR-002"]);
    });

    it("uses FR_BASE_URL for the search when set", async () => {
        vi.stubEnv("FR_BASE_URL", "https://fr.example/");
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok", expires_in: 3600 }))
            .mockResolvedValueOnce(json(200, record));

        await searchFacilityRegistry({ name: "Kenyatta" });

        expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/tenants/token`);
        expect(fetchMock.mock.calls[1][0]).toBe("https://fr.example/api/v1/facilities/search?name=Kenyatta");
    });

    it("treats 404 and 400 zero-results as not found", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok", expires_in: 3600 }))
            .mockResolvedValueOnce(json(404, { message: "nothing" }))
            .mockResolvedValueOnce(json(400, { message: "zero results found" }));

        expect(await searchFacilityRegistry({ name: "Nowhere" })).toEqual({ status: "not_found" });
        expect(await searchFacilityRegistry({ name: "Nowhere" })).toEqual({ status: "not_found" });
    });

    it("retries once with a fresh token on 401", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "old", expires_in: 3600 }))
            .mockResolvedValueOnce(json(401, {}))
            .mockResolvedValueOnce(json(200, { access_token: "new", expires_in: 3600 }))
            .mockResolvedValueOnce(json(200, record));

        const result = await searchFacilityRegistry({ name: "Kenyatta" });

        expect(result.status).toBe("found");
        expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe("Bearer new");
    });

    it("reports upstream errors and missing config", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { access_token: "tok", expires_in: 3600 }))
            .mockResolvedValueOnce(json(500, {}));
        expect(await searchFacilityRegistry({ name: "Kenyatta" })).toEqual({
            status: "error",
            error: "Facility Registry returned HTTP 500",
        });

        vi.stubEnv("CR_BASE_URL", "");
        expect((await searchFacilityRegistry({ name: "Kenyatta" })).status).toBe("misconfigured");
    });
});

describe("toFacilitySummary", () => {
    it("drops records without a name", () => {
        expect(toFacilitySummary({ frCode: "FR-1" })).toBeNull();
        expect(toFacilitySummary(null)).toBeNull();
    });
});

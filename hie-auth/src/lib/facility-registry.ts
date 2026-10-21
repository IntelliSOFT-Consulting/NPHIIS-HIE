import { getClientRegistryToken, parseTimeoutMs } from "./client-registry";

/** Identifier types the Facility Registry search accepts. */
export const FACILITY_IDENTIFIER_TYPES = ["mfl", "license-number", "fr-code", "registration-number", "fid"] as const;
export type FacilityIdentifierType = (typeof FACILITY_IDENTIFIER_TYPES)[number];

export function isFacilityIdentifierType(v: string): v is FacilityIdentifierType {
    return (FACILITY_IDENTIFIER_TYPES as readonly string[]).includes(v);
}

/** A facility as the HIE hands it to clients: the fields a picker needs. */
export interface FacilitySummary {
    frCode: string;
    fidCode?: string;
    name: string;
    facilityType?: string;
    kephLevel?: string;
    ownership?: string;
    county?: string;
    subCounty?: string;
    ward?: string;
    operationalStatus?: string;
}

export type FacilitySearch =
    | { name: string }
    | { identifier: string; identifierType: FacilityIdentifierType };

export type FacilitySearchResult =
    | { status: "found"; facilities: FacilitySummary[] }
    | { status: "not_found" }
    | { status: "error" | "misconfigured"; error: string };

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** One Facility Registry record → FacilitySummary; null when it has no name. */
export function toFacilitySummary(raw: unknown): FacilitySummary | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, any>;
    const name = str(r.officialName) ?? str(r.name);
    if (!name) return null;
    const address = (r.address ?? {}) as Record<string, unknown>;
    return {
        frCode: str(r.frCode) ?? str(r.fidCode) ?? str(r.uuid) ?? name,
        fidCode: str(r.fidCode),
        name,
        facilityType: str(r.facilityType),
        kephLevel: str(r.kephLevel),
        ownership: str(r.facilityOwnership),
        county: str(address.county),
        subCounty: str(address.subCounty),
        ward: str(address.ward),
        operationalStatus: str(r.regulatoryOperationalStatus?.operationalStatus),
    };
}

/** The search can answer with one record, a list, or a list inside an envelope. */
function recordsOf(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        for (const key of ["data", "results", "facilities", "items"]) {
            const inner = obj[key];
            if (Array.isArray(inner)) return inner;
            if (inner && typeof inner === "object") return recordsOf(inner);
        }
        return [obj];
    }
    return [];
}

/** DHA middleware reports "no match" as 404, or 400 with a "zero results" / "not found" message. */
async function isNotFoundResponse(response: Response): Promise<boolean> {
    if (response.status === 404) return true;
    if (response.status !== 400) return false;
    const text = await response.clone().text().catch(() => "");
    return /zero results|not found|no (facility|record)/i.test(text);
}

/**
 * Search the DHA Facility Registry.
 * GET ${FR_BASE_URL}/api/v1/facilities/search?name=  or  ?identifier=&identifier-type=
 * FR sits on the same DHA middleware as the Client Registry: FR_BASE_URL defaults to
 * CR_BASE_URL and the request uses the Client Registry's credentials.
 */
export async function searchFacilityRegistry(query: FacilitySearch): Promise<FacilitySearchResult> {
    const baseUrl = (process.env.FR_BASE_URL || process.env.CR_BASE_URL)?.replace(/\/$/, "");
    if (!baseUrl) {
        return { status: "misconfigured", error: "FR_BASE_URL (or CR_BASE_URL) is not configured" };
    }
    // Token comes from the middleware's tenant endpoint, as for the Client Registry.
    const tokenBaseUrl = process.env.CR_BASE_URL?.replace(/\/$/, "") || baseUrl;

    const url = new URL(`${baseUrl}/api/v1/facilities/search`);
    if ("name" in query) {
        url.searchParams.set("name", query.name);
    } else {
        url.searchParams.set("identifier", query.identifier);
        url.searchParams.set("identifier-type", query.identifierType);
    }

    const timeoutMs = parseTimeoutMs(process.env.FR_TIMEOUT_MS, 10_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const search = async (forceRefresh: boolean) => {
        const headers: Record<string, string> = { Accept: "application/json" };
        const token = await getClientRegistryToken(tokenBaseUrl, controller.signal, forceRefresh);
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(url.toString(), { method: "GET", headers, signal: controller.signal });
    };

    try {
        let response = await search(false);
        // A cached token can be revoked before its expiry; retry once with a fresh one.
        if (response.status === 401 && process.env.CR_CLIENT_ID && process.env.CR_CLIENT_SECRET) {
            response = await search(true);
        }

        if (await isNotFoundResponse(response)) return { status: "not_found" };

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            console.error("[FacilityRegistry] HTTP", response.status, detail.slice(0, 500));
            return { status: "error", error: `Facility Registry returned HTTP ${response.status}` };
        }

        const data: unknown = await response.json().catch(() => null);
        const facilities = recordsOf(data)
            .map(toFacilitySummary)
            .filter((f): f is FacilitySummary => f !== null);
        return facilities.length ? { status: "found", facilities } : { status: "not_found" };
    } catch (err: any) {
        const message =
            err?.name === "AbortError"
                ? "Facility Registry request timed out"
                : err?.message || "Facility Registry request failed";
        console.error("[FacilityRegistry]", message);
        return { status: "error", error: message };
    } finally {
        clearTimeout(timer);
    }
}

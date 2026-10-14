import type { UpstreamLookupResult } from "./client-registry";

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * IPRS (SHA Health ID) uses Basic auth. IPRS_BASIC_AUTH, when set, is sent as-is
 * (with or without the "Basic " prefix) instead of IPRS_USERNAME/IPRS_PASSWORD.
 * IPRS_API_TOKEN (Bearer) remains as a last resort.
 */
export function iprsAuthorizationHeader(): string | undefined {
    const basicAuth = process.env.IPRS_BASIC_AUTH?.trim();
    if (basicAuth) {
        return /^basic\s/i.test(basicAuth) ? basicAuth : `Basic ${basicAuth}`;
    }

    const username = process.env.IPRS_USERNAME;
    const password = process.env.IPRS_PASSWORD;
    if (username && password) {
        return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }

    const token = process.env.IPRS_API_TOKEN;
    return token ? `Bearer ${token}` : undefined;
}

function isEmptyPatientPayload(data: unknown): boolean {
    if (data == null) return true;
    if (Array.isArray(data)) return data.length === 0;
    if (typeof data === "object") {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.results) && obj.results.length === 0) return true;
        if (Array.isArray(obj.data) && obj.data.length === 0) return true;
        if (Array.isArray(obj.patients) && obj.patients.length === 0) return true;
        if (obj.found === false) return true;
        if (Object.keys(obj).length === 0) return true;
    }
    return false;
}

/** IPRS person types per identification type; IPRS only holds citizens and aliens. */
const IPRS_PERSON_TYPES: Record<string, string> = {
    "National ID": "citizen",
    "Alien ID": "alien",
};

/**
 * Look up a person in IPRS (SHA Health ID) by identification number.
 * GET ${IPRS_BASE_URL}/api/v1/lookup/persons?id_number=&type=citizen|alien
 * Identification types IPRS does not hold are reported as not_found without a request.
 */
export async function lookupIprsPatient(params: {
    identificationNumber: string;
    identificationType: string;
}): Promise<UpstreamLookupResult> {
    const baseUrl = process.env.IPRS_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) {
        return { status: "misconfigured", error: "IPRS_BASE_URL is not configured" };
    }

    const personType = IPRS_PERSON_TYPES[params.identificationType];
    if (!personType) {
        return { status: "not_found" };
    }

    const url = new URL(`${baseUrl}/api/v1/lookup/persons`);
    url.searchParams.set("id_number", params.identificationNumber);
    url.searchParams.set("type", personType);

    const headers: Record<string, string> = {
        Accept: "application/json",
    };
    const authorization = iprsAuthorizationHeader();
    if (authorization) {
        headers.Authorization = authorization;
    }

    const timeoutMs = parseTimeoutMs(process.env.IPRS_TIMEOUT_MS, 10_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers,
            signal: controller.signal,
        });

        if (response.status === 404) {
            return { status: "not_found" };
        }

        if (!response.ok) {
            return {
                status: "error",
                error: `IPRS returned HTTP ${response.status}`,
            };
        }

        const data: unknown = await response.json().catch(() => null);

        if (isEmptyPatientPayload(data)) {
            return { status: "not_found" };
        }

        return { status: "found", data };
    } catch (err: any) {
        const message =
            err?.name === "AbortError"
                ? "IPRS request timed out"
                : err?.message || "IPRS request failed";
        console.error("[IPRS]", message);
        return { status: "error", error: message };
    } finally {
        clearTimeout(timer);
    }
}

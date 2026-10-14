import type { UpstreamLookupResult } from "./client-registry";

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
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

/**
 * Look up a person in IPRS by identification number.
 * Uses the same query shape as CR until a distinct IPRS contract is provided:
 * GET ${IPRS_BASE_URL}/api/v1/patients?identification_number=&identification_type=
 */
export async function lookupIprsPatient(params: {
    identificationNumber: string;
    identificationType: string;
}): Promise<UpstreamLookupResult> {
    const baseUrl = process.env.IPRS_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) {
        return { status: "misconfigured", error: "IPRS_BASE_URL is not configured" };
    }

    const url = new URL(`${baseUrl}/api/v1/patients`);
    url.searchParams.set("identification_number", params.identificationNumber);
    url.searchParams.set("identification_type", params.identificationType);

    const headers: Record<string, string> = {
        Accept: "application/json",
    };
    const token = process.env.IPRS_API_TOKEN;
    if (token) {
        headers.Authorization = `Bearer ${token}`;
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

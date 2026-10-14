export type UpstreamLookupStatus = "found" | "not_found" | "error" | "misconfigured";

export type UpstreamLookupResult = {
    status: UpstreamLookupStatus;
    data?: unknown;
    error?: string;
};

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Look up a patient in Client Registry by identification number and type.
 * GET ${CR_BASE_URL}/api/v1/patients?identification_number=&identification_type=
 */
export async function lookupClientRegistryPatient(params: {
    identificationNumber: string;
    identificationType: string;
}): Promise<UpstreamLookupResult> {
    const baseUrl = process.env.CR_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) {
        return { status: "misconfigured", error: "CR_BASE_URL is not configured" };
    }

    const url = new URL(`${baseUrl}/api/v1/patients`);
    url.searchParams.set("identification_number", params.identificationNumber);
    url.searchParams.set("identification_type", params.identificationType);

    const headers: Record<string, string> = {
        Accept: "application/json",
    };
    const token = process.env.CR_API_TOKEN;
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const timeoutMs = parseTimeoutMs(process.env.CR_TIMEOUT_MS, 10_000);
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
                error: `Client Registry returned HTTP ${response.status}`,
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
                ? "Client Registry request timed out"
                : err?.message || "Client Registry request failed";
        console.error("[ClientRegistry]", message);
        return { status: "error", error: message };
    } finally {
        clearTimeout(timer);
    }
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

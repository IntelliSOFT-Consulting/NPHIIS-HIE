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

/** Refresh this long before the upstream-reported expiry. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Test hook: forget the cached client-credentials token. */
export function resetClientRegistryTokenCache(): void {
    cachedToken = null;
}

/**
 * Bearer token for CR. With CR_CLIENT_ID + CR_CLIENT_SECRET, fetches an OAuth2
 * client-credentials token (DHA middleware: POST ${CR_BASE_URL}/api/v1/tenants/token,
 * override with CR_TOKEN_URL) and caches it until shortly before expiry.
 * Otherwise falls back to the static CR_API_TOKEN.
 */
async function getClientRegistryToken(
    baseUrl: string,
    signal: AbortSignal,
    forceRefresh = false
): Promise<string | undefined> {
    const clientId = process.env.CR_CLIENT_ID;
    const clientSecret = process.env.CR_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return process.env.CR_API_TOKEN || undefined;
    }

    if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.value;
    }

    const tokenUrl = process.env.CR_TOKEN_URL || `${baseUrl}/api/v1/tenants/token`;
    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }).toString(),
        signal,
    });
    if (!response.ok) {
        throw new Error(`Client Registry token request returned HTTP ${response.status}`);
    }

    const body: any = await response.json().catch(() => null);
    const value = body?.access_token;
    if (typeof value !== "string" || !value) {
        throw new Error("Client Registry token response has no access_token");
    }
    const expiresInMs = (Number(body.expires_in) || 300) * 1000;
    cachedToken = {
        value,
        expiresAt: Date.now() + Math.max(expiresInMs - TOKEN_EXPIRY_MARGIN_MS, 0),
    };
    return value;
}

/** DHA middleware reports "no match" as 400 with a "zero results found" message. */
async function isNotFoundResponse(response: Response): Promise<boolean> {
    if (response.status === 404) return true;
    if (response.status !== 400) return false;
    // Read a clone so the body stays available for error logging
    const text = await response.clone().text().catch(() => "");
    return /zero results found/i.test(text);
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

    const timeoutMs = parseTimeoutMs(process.env.CR_TIMEOUT_MS, 10_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const search = async (forceRefresh: boolean) => {
        const headers: Record<string, string> = {
            Accept: "application/json",
        };
        const token = await getClientRegistryToken(baseUrl, controller.signal, forceRefresh);
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return fetch(url.toString(), {
            method: "GET",
            headers,
            signal: controller.signal,
        });
    };

    try {
        let response = await search(false);
        // A cached token can be revoked before its expiry; retry once with a fresh one.
        if (response.status === 401 && process.env.CR_CLIENT_ID && process.env.CR_CLIENT_SECRET) {
            response = await search(true);
        }

        if (await isNotFoundResponse(response)) {
            return { status: "not_found" };
        }

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            console.error("[ClientRegistry] HTTP", response.status, detail.slice(0, 500));
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

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Authenticates calls from the lab system (LIMS) to /lab/results.
 *
 * - API key: `x-api-key` (or `Authorization: Bearer`) must equal one of LAB_RESULTS_API_KEY,
 *   comma-separated so a new key can be issued before the old one is withdrawn.
 * - Signature, when LAB_RESULTS_HMAC_SECRET is set: `x-lab-timestamp` (Unix seconds or ISO 8601)
 *   and `x-lab-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`. The timestamp
 *   must be within LAB_RESULTS_SIGNATURE_TOLERANCE_SECONDS (default 300) of now, so a captured
 *   request cannot be replayed later or altered in transit.
 */

export type LabAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers, name: string): string | undefined {
  const v = headers[name];
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function labApiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.LAB_RESULTS_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function checkLabApiKey(headers: Headers, env: NodeJS.ProcessEnv = process.env): LabAuthResult {
  const keys = labApiKeys(env);
  if (!keys.length) return { ok: false, status: 503, error: "LAB_RESULTS_API_KEY is not configured" };
  const provided = header(headers, "x-api-key") ?? header(headers, "authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  // Compare against every key so the time taken does not reveal which one matched.
  const matches = keys.map((k) => safeEqual(provided, k));
  return matches.includes(true) ? { ok: true } : { ok: false, status: 401, error: "Unauthorized" };
}

export function signLabBody(secret: string, timestamp: string, rawBody: Buffer | string): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
}

export function checkLabSignature(
  headers: Headers,
  rawBody: Buffer | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): LabAuthResult {
  const secret = env.LAB_RESULTS_HMAC_SECRET?.trim();
  if (!secret) return { ok: true };
  const timestamp = header(headers, "x-lab-timestamp");
  const signature = header(headers, "x-lab-signature")?.replace(/^sha256=/i, "").toLowerCase();
  if (!timestamp || !signature) return { ok: false, status: 401, error: "Missing x-lab-timestamp or x-lab-signature" };
  const at = /^\d+$/.test(timestamp) ? Number(timestamp) * 1000 : Date.parse(timestamp);
  const toleranceMs = (Number(env.LAB_RESULTS_SIGNATURE_TOLERANCE_SECONDS) || 300) * 1000;
  if (!Number.isFinite(at) || Math.abs(now - at) > toleranceMs) {
    return { ok: false, status: 401, error: "x-lab-timestamp is outside the allowed window" };
  }
  const expected = signLabBody(secret, timestamp, rawBody ?? Buffer.alloc(0));
  return safeEqual(signature, expected) ? { ok: true } : { ok: false, status: 401, error: "Invalid signature" };
}

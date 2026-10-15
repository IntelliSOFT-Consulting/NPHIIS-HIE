import { describe, expect, it } from "vitest";
import { checkLabApiKey, checkLabSignature, signLabBody } from "./lab-auth";

describe("checkLabApiKey", () => {
  const env = { LAB_RESULTS_API_KEY: "old-key, new-key" } as NodeJS.ProcessEnv;

  it("accepts any configured key, in x-api-key or as a Bearer token", () => {
    expect(checkLabApiKey({ "x-api-key": "old-key" }, env)).toEqual({ ok: true });
    expect(checkLabApiKey({ authorization: "Bearer new-key" }, env)).toEqual({ ok: true });
  });

  it("rejects a wrong or missing key", () => {
    expect(checkLabApiKey({ "x-api-key": "nope" }, env)).toMatchObject({ ok: false, status: 401 });
    expect(checkLabApiKey({}, env)).toMatchObject({ ok: false, status: 401 });
  });

  it("is unavailable when no key is configured", () => {
    expect(checkLabApiKey({ "x-api-key": "" }, {} as NodeJS.ProcessEnv)).toMatchObject({ ok: false, status: 503 });
  });
});

describe("checkLabSignature", () => {
  const env = { LAB_RESULTS_HMAC_SECRET: "s3cret" } as NodeJS.ProcessEnv;
  const body = Buffer.from('{"data":[{"specimenIdentifier":"2261733"}]}');
  const now = Date.parse("2026-10-15T09:00:00Z");
  const ts = String(now / 1000);
  const signed = (t: string, b: Buffer | string = body) => ({
    "x-lab-timestamp": t,
    "x-lab-signature": `sha256=${signLabBody("s3cret", t, b)}`,
  });

  it("is not required when no secret is configured", () => {
    expect(checkLabSignature({}, body, {} as NodeJS.ProcessEnv, now)).toEqual({ ok: true });
  });

  it("accepts a fresh signature over the exact body, with a Unix or ISO timestamp", () => {
    expect(checkLabSignature(signed(ts), body, env, now)).toEqual({ ok: true });
    expect(checkLabSignature(signed("2026-10-15T08:58:00Z"), body, env, now)).toEqual({ ok: true });
  });

  it("rejects an altered body, a missing signature and a stale timestamp", () => {
    expect(checkLabSignature(signed(ts), Buffer.from('{"data":[]}'), env, now)).toMatchObject({ ok: false, error: "Invalid signature" });
    expect(checkLabSignature({ "x-lab-timestamp": ts }, body, env, now)).toMatchObject({ ok: false, status: 401 });
    const old = String(now / 1000 - 301);
    expect(checkLabSignature(signed(old), body, env, now)).toMatchObject({ ok: false, error: expect.stringMatching(/window/) });
  });
});

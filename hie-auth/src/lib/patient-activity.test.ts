import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils", () => ({
  apiHost: "http://hapi/fhir",
  fhirApiDefaultHeaders: (extra?: Record<string, string>) => ({ "Content-Type": "application/json", ...(extra || {}) }),
}));
vi.mock("./prisma", () => ({ prisma: { fhirSubscriptionCallbackLog: { create: vi.fn(async () => ({})) } } }));

import {
  PATIENT_ACTIVITY_EXTENSION,
  patientActivityResourceTypes,
  patientIdFromResource,
  queuePatientActivity,
  recordActivity,
  resolveDeleted,
  stampPatient,
} from "./patient-activity";

type Call = { method: string; url: string; body?: any; headers: Record<string, string> };
let calls: Call[] = [];
let respond: (call: Call) => { status: number; body?: any };

function json(status: number, body?: any) {
  return { status, json: async () => (body === undefined ? Promise.reject(new Error("empty")) : body) } as Response;
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      const call: Call = {
        method: init.method,
        url: url.replace("http://hapi/fhir", ""),
        body: init.body ? JSON.parse(init.body) : undefined,
        headers: init.headers,
      };
      calls.push(call);
      const r = respond(call);
      return json(r.status, r.body);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.PATIENT_ACTIVITY_DEBOUNCE_MS;
  delete process.env.PATIENT_ACTIVITY_RESOURCE_TYPES;
});

const patient = (ext?: string, versionId = "1") => ({
  resourceType: "Patient",
  id: "p1",
  meta: { versionId },
  extension: [
    { url: "http://other/ext", valueString: "keep" },
    ...(ext ? [{ url: PATIENT_ACTIVITY_EXTENSION, valueDateTime: ext }] : []),
  ],
});

describe("patientIdFromResource", () => {
  it("reads subject, patient and absolute references", () => {
    expect(patientIdFromResource({ subject: { reference: "Patient/a" } })).toBe("a");
    expect(patientIdFromResource({ patient: { reference: "Patient/b" } })).toBe("b");
    expect(patientIdFromResource({ subject: { reference: "https://x/fhir/Patient/c/_history/2" } })).toBe("c");
  });
  it("ignores non-Patient subjects and missing references", () => {
    expect(patientIdFromResource({ subject: { reference: "Group/g" } })).toBeNull();
    expect(patientIdFromResource({})).toBeNull();
  });
});

describe("patientActivityResourceTypes", () => {
  it("never includes Patient", () => {
    process.env.PATIENT_ACTIVITY_RESOURCE_TYPES = "Observation, Patient";
    expect(patientActivityResourceTypes()).toEqual(["Observation"]);
  });
});

describe("stampPatient", () => {
  it("replaces the extension and keeps the others, with If-Match", async () => {
    respond = (c) =>
      c.method === "GET" ? { status: 200, body: patient("2026-01-01T00:00:00Z") } : { status: 200, body: { meta: { versionId: "2" } } };
    const result = await stampPatient("p1", "2026-02-01T00:00:00Z");
    expect(result).toEqual({ kind: "stamped", versionId: "2" });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.headers["If-Match"]).toBe('W/"1"');
    const stamps = put.body.extension.filter((e: any) => e.url === PATIENT_ACTIVITY_EXTENSION);
    expect(stamps).toEqual([{ url: PATIENT_ACTIVITY_EXTENSION, valueDateTime: "2026-02-01T00:00:00Z" }]);
    expect(put.body.extension).toContainEqual({ url: "http://other/ext", valueString: "keep" });
  });

  it("skips the write when the stored time is not older", async () => {
    respond = () => ({ status: 200, body: patient("2026-03-01T00:00:00Z") });
    expect((await stampPatient("p1", "2026-02-01T00:00:00Z")).kind).toBe("skipped");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("re-reads and retries on a version conflict", async () => {
    let puts = 0;
    respond = (c) => {
      if (c.method === "GET") return { status: 200, body: patient(undefined, String(puts + 1)) };
      return ++puts === 1 ? { status: 412, body: {} } : { status: 200, body: { meta: { versionId: "3" } } };
    };
    expect((await stampPatient("p1", "2026-02-01T00:00:00Z")).kind).toBe("stamped");
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.headers["If-Match"])).toEqual(['W/"1"', 'W/"2"']);
  });

  it("skips a missing Patient", async () => {
    respond = () => ({ status: 404, body: {} });
    expect((await stampPatient("p1", "2026-02-01T00:00:00Z")).kind).toBe("skipped");
  });
});

describe("resolveDeleted", () => {
  it("takes the patient from the last live version and the time from HAPI's 410", async () => {
    respond = (c) =>
      c.url.includes("_history")
        ? {
            status: 200,
            body: {
              entry: [
                { request: { method: "DELETE" }, response: { status: "200 OK" } },
                { resource: { resourceType: "Observation", subject: { reference: "Patient/p9" } } },
              ],
            },
          }
        : {
            status: 410,
            body: { resourceType: "OperationOutcome", issue: [{ diagnostics: "Resource was deleted at 2026-10-16T15:20:05.050+03:00" }] },
          };
    expect(await resolveDeleted("Observation", "o1")).toEqual({ patientId: "p9", at: "2026-10-16T15:20:05.050+03:00" });
  });

  it("ignores a resource that is not actually deleted", async () => {
    respond = (c) => ({ status: 200, body: c.url.includes("_history") ? { entry: [] } : { resourceType: "Observation" } });
    expect(await resolveDeleted("Observation", "o1")).toBeNull();
  });
});

describe("redeliveries", () => {
  it("acknowledges a repeated notification without queueing or I/O", () => {
    const obs = { resourceType: "Observation", subject: { reference: "Patient/p7" }, meta: { versionId: "4", lastUpdated: "2026-01-01T00:00:00Z" } };
    expect(recordActivity("Observation", "dup1", "upsert", obs)).toBe("queued");
    expect(recordActivity("Observation", "dup1", "upsert", obs)).toBe("duplicate");
    expect(recordActivity("Observation", "dup2", "delete")).toBe("resolving");
    expect(recordActivity("Observation", "dup2", "delete")).toBe("duplicate");
  });
});

describe("queuePatientActivity / recordActivity", () => {
  it("coalesces a burst into one write with the latest time, without I/O in the callback", async () => {
    vi.useFakeTimers();
    process.env.PATIENT_ACTIVITY_DEBOUNCE_MS = "1000";
    respond = (c) => (c.method === "GET" ? { status: 200, body: patient() } : { status: 200, body: { meta: { versionId: "2" } } });
    const obs = (t: string) => ({ resourceType: "Observation", subject: { reference: "Patient/p1" }, meta: { lastUpdated: t } });

    expect(recordActivity("Observation", "o1", "upsert", obs("2026-01-01T00:00:01Z"))).toBe("queued");
    expect(recordActivity("Observation", "o2", "upsert", obs("2026-01-01T00:00:03Z"))).toBe("already-queued");
    expect(queuePatientActivity("p1", "2026-01-01T00:00:02Z")).toBe("already-queued");
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body.extension.at(-1).valueDateTime).toBe("2026-01-01T00:00:03Z");
  });

  it("reports resources that are not about a patient", () => {
    expect(recordActivity("Observation", "o3", "upsert", { resourceType: "Observation" })).toBe("no-patient");
  });
});

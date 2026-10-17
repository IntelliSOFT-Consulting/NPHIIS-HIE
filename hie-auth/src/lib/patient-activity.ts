import { apiHost, fhirApiDefaultHeaders } from "./utils";
import { prisma } from "./prisma";

/**
 * Stamps Patient.extension[patient-data-last-updated] whenever a resource about the patient is
 * created, updated or deleted. HAPI REST-hook callbacks only enqueue work here; the FHIR reads and
 * the Patient write run in the background, debounced per patient and bounded in concurrency.
 */
export const PATIENT_ACTIVITY_EXTENSION = "http://nphiis.health.go.ke/fhir/StructureDefinition/patient-data-last-updated";

export const DEFAULT_PATIENT_ACTIVITY_TYPES = [
  "Encounter",
  "Observation",
  "Condition",
  "Immunization",
  "Specimen",
  "QuestionnaireResponse",
  "DiagnosticReport",
  "ServiceRequest",
  "Procedure",
  "MedicationAdministration",
];

const MAX_STAMP_ATTEMPTS = 3;

/** Patient is never included: stamping it would notify ourselves. */
export function patientActivityResourceTypes(): string[] {
  const configured = (process.env.PATIENT_ACTIVITY_RESOURCE_TYPES ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return (configured.length ? configured : DEFAULT_PATIENT_ACTIVITY_TYPES).filter((t) => t !== "Patient");
}

function activityConfig() {
  return {
    debounceMs: Math.max(0, Number(process.env.PATIENT_ACTIVITY_DEBOUNCE_MS ?? 3000)),
    concurrency: Math.max(1, Number(process.env.PATIENT_ACTIVITY_CONCURRENCY) || 4),
    maxPending: Math.max(1, Number(process.env.PATIENT_ACTIVITY_MAX_PENDING) || 10000),
  };
}

/** `Patient/{id}` from subject or patient, also for absolute references; null for non-Patient subjects. */
export function patientIdFromResource(resource: any): string | null {
  const ref: unknown = resource?.subject?.reference ?? resource?.patient?.reference;
  if (typeof ref !== "string") return null;
  const parts = ref.split("/_history/")[0].split("/").filter(Boolean);
  if (parts.length < 2 || parts[parts.length - 2] !== "Patient") return null;
  return parts[parts.length - 1] || null;
}

function laterOf(a: string | undefined, b: string): string {
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

async function fhir(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  const response = await fetch(`${apiHost}${url}`, {
    method,
    headers: fhirApiDefaultHeaders(headers),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

/* ---------- bounded worker ---------- */

let active = 0;
const waiting: Array<() => void> = [];

function runLimited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      active++;
      task()
        .then(resolve, reject)
        .finally(() => {
          active--;
          waiting.shift()?.();
        });
    };
    if (active < activityConfig().concurrency) start();
    else waiting.push(start);
  });
}

/* ---------- per-patient debounce ---------- */

const pending = new Map<string, { at: string; timer: ReturnType<typeof setTimeout> }>();
const running = new Set<string>();
const rerun = new Map<string, string>();

export type QueueStatus = "queued" | "already-queued" | "dropped";

/** Records that the patient's data changed at `at`; coalesces bursts into one Patient write. */
export function queuePatientActivity(patientId: string, at: string): QueueStatus {
  const existing = pending.get(patientId);
  if (existing) {
    existing.at = laterOf(existing.at, at);
    return "already-queued";
  }
  if (running.has(patientId)) {
    rerun.set(patientId, laterOf(rerun.get(patientId), at));
    return "already-queued";
  }
  if (pending.size >= activityConfig().maxPending) {
    console.warn(`[PatientActivity] Queue full; dropped Patient/${patientId}`);
    return "dropped";
  }
  const timer = setTimeout(() => void flushPatient(patientId), activityConfig().debounceMs);
  timer.unref?.();
  pending.set(patientId, { at, timer });
  return "queued";
}

async function flushPatient(patientId: string) {
  const entry = pending.get(patientId);
  if (!entry) return;
  pending.delete(patientId);
  running.add(patientId);
  const startedAt = Date.now();
  let result: StampResult;
  try {
    result = await runLimited(() => stampPatient(patientId, entry.at));
  } catch (e) {
    result = { kind: "error", error: String(e) };
  } finally {
    running.delete(patientId);
  }
  logStamp(patientId, entry.at, result, startedAt);
  const next = rerun.get(patientId);
  if (next) {
    rerun.delete(patientId);
    queuePatientActivity(patientId, next);
  }
}

/* ---------- Patient write ---------- */

export type StampResult = { kind: "stamped"; versionId?: string } | { kind: "skipped"; reason: string } | { kind: "error"; error: string };

export function currentStamp(patient: any): string | undefined {
  return patient?.extension?.find((e: any) => e?.url === PATIENT_ACTIVITY_EXTENSION)?.valueDateTime;
}

/** Sets the extension to `at` unless it already holds a later time; optimistic-locked on versionId. */
export async function stampPatient(patientId: string, at: string): Promise<StampResult> {
  for (let attempt = 1; attempt <= MAX_STAMP_ATTEMPTS; attempt++) {
    const read = await fhir("GET", `/Patient/${encodeURIComponent(patientId)}`);
    if (read.status === 404 || read.status === 410) return { kind: "skipped", reason: `Patient/${patientId} not found` };
    if (read.status >= 400 || read.data?.resourceType !== "Patient") {
      return { kind: "error", error: `GET Patient/${patientId} returned ${read.status}` };
    }
    const patient = read.data;
    const current = currentStamp(patient);
    if (current && Date.parse(current) >= Date.parse(at)) {
      return { kind: "skipped", reason: `Already stamped ${current}` };
    }
    const updated = {
      ...patient,
      extension: [
        ...(patient.extension ?? []).filter((e: any) => e?.url !== PATIENT_ACTIVITY_EXTENSION),
        { url: PATIENT_ACTIVITY_EXTENSION, valueDateTime: at },
      ],
    };
    const versionId = patient.meta?.versionId;
    const write = await fhir(
      "PUT",
      `/Patient/${encodeURIComponent(patientId)}`,
      updated,
      versionId ? { "If-Match": `W/"${versionId}"` } : undefined,
    );
    if (write.status === 412 || write.status === 409) continue;
    if (write.status >= 400) return { kind: "error", error: `PUT Patient/${patientId} returned ${write.status}` };
    return { kind: "stamped", versionId: write.data?.meta?.versionId };
  }
  return { kind: "error", error: `Patient/${patientId} kept changing; gave up after ${MAX_STAMP_ATTEMPTS} attempts` };
}

function logStamp(patientId: string, at: string, result: StampResult, startedAt: number) {
  prisma.fhirSubscriptionCallbackLog
    .create({
      data: {
        route: "patient-activity-stamp",
        resourceType: "Patient",
        resourceId: patientId,
        httpStatus: 200,
        outcome: result.kind === "stamped" ? "success" : result.kind,
        errorMessage: result.kind === "error" ? result.error.slice(0, 2000) : null,
        detail: { at, ...result },
        durationMs: Date.now() - startedAt,
      },
    })
    .catch((e) => console.error("FhirSubscriptionCallbackLog write failed:", e));
}

/* ---------- callback entry point ---------- */

export type ActivityAction = "upsert" | "delete";

/** HAPI answers a read of a deleted resource with 410 "Resource was deleted at {instant}". */
export function deletedAtFromOutcome(outcome: any): string | null {
  for (const issue of outcome?.issue ?? []) {
    const match = /deleted at (\S+)/.exec(issue?.diagnostics ?? "");
    if (match && !Number.isNaN(Date.parse(match[1]))) return match[1];
  }
  return null;
}

/**
 * Patient and delete time of a deleted resource: patient from the last version before the delete,
 * time from HAPI (stable across redeliveries, so a retried DELETE never re-stamps the Patient).
 */
export async function resolveDeleted(type: string, id: string): Promise<{ patientId: string; at: string } | null> {
  const path = `/${type}/${encodeURIComponent(id)}`;
  const [history, current] = await Promise.all([fhir("GET", `${path}/_history?_count=5`), fhir("GET", path)]);
  if (current.status !== 410) return null;
  const at = deletedAtFromOutcome(current.data);
  const lastLive = (history.data?.entry ?? []).find((e: any) => e?.resource);
  const patientId = patientIdFromResource(lastLive?.resource);
  return patientId && at ? { patientId, at } : null;
}

async function resolveCurrent(type: string, id: string): Promise<{ patientId: string; at: string } | null> {
  const read = await fhir("GET", `/${type}/${encodeURIComponent(id)}`);
  if (read.status >= 400) return null;
  const patientId = patientIdFromResource(read.data);
  return patientId ? { patientId, at: read.data?.meta?.lastUpdated ?? new Date().toISOString() } : null;
}

export type RecordStatus = QueueStatus | "resolving" | "no-patient" | "duplicate";

const SEEN_TTL_MS = 10 * 60 * 1000;
const SEEN_MAX = 50000;
const seen = new Map<string, number>();

/** True when this exact notification was handled recently (HAPI redelivery); bounded, expiring. */
function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = seen.get(key);
  if (last !== undefined && now - last < SEEN_TTL_MS) return true;
  seen.delete(key);
  seen.set(key, now);
  if (seen.size > SEEN_MAX) {
    for (const k of seen.keys()) {
      seen.delete(k);
      if (seen.size <= SEEN_MAX * 0.9) break;
    }
  }
  return false;
}

/**
 * Called from the REST-hook route. Never awaits I/O: uses the payload HAPI sent when it carries the
 * patient, otherwise resolves the resource in the background worker. Redeliveries of the same
 * version (or the same delete) are acknowledged without any FHIR call.
 */
export function recordActivity(type: string, id: string, action: ActivityAction, payload?: any): RecordStatus {
  const version = action === "delete" ? "deleted" : payload?.meta?.versionId;
  if (version && isDuplicate(`${type}/${id}/${version}`)) return "duplicate";
  if (action === "upsert" && payload?.resourceType === type) {
    const patientId = patientIdFromResource(payload);
    if (!patientId) return "no-patient";
    return queuePatientActivity(patientId, payload.meta?.lastUpdated ?? new Date().toISOString());
  }
  if (waiting.length >= activityConfig().maxPending) {
    console.warn(`[PatientActivity] Worker backlog full; dropped ${type}/${id}`);
    return "dropped";
  }
  void runLimited(() => (action === "delete" ? resolveDeleted(type, id) : resolveCurrent(type, id)))
    .then((found) => {
      if (found) queuePatientActivity(found.patientId, found.at);
    })
    .catch((e) => console.error(`[PatientActivity] Resolving ${type}/${id} failed:`, e));
  return "resolving";
}

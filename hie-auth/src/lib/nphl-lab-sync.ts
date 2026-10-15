import { createHash } from "crypto";
import { FhirApi } from "./utils";
import { prisma } from "./prisma";
import { getEpidValueFromEncounter, getEpidValueFromPatient } from "./epid-utils";
import { toRelativeRequestPath } from "./fhir-resource-history";
import {
  DEFAULT_LAB_TESTS,
  LabUpdate,
  NphlResult,
  SPECIMEN_LABEL_SYSTEM,
  TASK_CODE,
  TASK_CODE_SYSTEM,
  TaskState,
  buildResultObservation,
  buildSpecimenTask,
  buildSurveillancePayload,
  isVhfCaseEncounter,
  notifiableOutcome,
  parseLabUpdates,
  surveillanceEntryState,
  resultChanged,
  resultObservationIdForSpecimen,
  specimenCaseEncounterId,
  specimenLabel,
  specimenWithLabStatus,
  taskChanged,
  taskIdForSpecimen,
  taskPayloadHash,
} from "./nphl-lab";
import { notifySpecimenOutcome } from "./nphl-result-notification";

export type SpecimenSyncOutcome = { specimenId: string; label: string; status: string; businessStatus: string };

export type CaseSyncResult =
  | { kind: "skipped"; reason: string }
  | { kind: "error"; error: string }
  | { kind: "synced"; caseEncounterId: string; submitted: boolean; specimens: SpecimenSyncOutcome[] };

function nphlConfig() {
  const tests = (process.env.NPHL_VHF_LAB_TESTS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    baseUrl: (process.env.NPHL_SURVEILLANCE_API_URL || "https://data-apis.nphl.go.ke").replace(/\/$/, ""),
    apiKey: process.env.NPHL_SURVEILLANCE_API_KEY?.trim(),
    timeoutMs: Number(process.env.NPHL_SURVEILLANCE_TIMEOUT_MS) || 30000,
    labTests: tests.length ? tests : DEFAULT_LAB_TESTS,
    maxConcurrent: Math.max(1, Number(process.env.NPHL_MAX_CONCURRENT) || 2),
    debounceMs: Math.max(0, Number(process.env.NPHL_SYNC_DEBOUNCE_MS ?? 15000)),
    pollMaxCases: Math.max(1, Number(process.env.NPHL_POLL_MAX_CASES) || 200),
    pollMaxAgeDays: Math.max(1, Number(process.env.NPHL_POLL_MAX_AGE_DAYS) || 60),
  };
}

// Every NPHL call (subscription, poll, manual) shares this cap.
let nphlActive = 0;
const nphlWaiters: Array<() => void> = [];
async function withNphlSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (nphlActive >= nphlConfig().maxConcurrent) await new Promise<void>((r) => nphlWaiters.push(r));
  nphlActive++;
  try {
    return await fn();
  } finally {
    nphlActive--;
    nphlWaiters.shift()?.();
  }
}

async function postSurveillance(payload: unknown): Promise<{ ok: true; data: any[] } | { ok: false; error: string }> {
  const { baseUrl, apiKey, timeoutMs } = nphlConfig();
  if (!apiKey) return { ok: false, error: "NPHL_SURVEILLANCE_API_KEY is not configured" };
  try {
    const res = await withNphlSlot(() => fetch(`${baseUrl}/v1/surveillance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    }));
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 500) };
    }
    if (!res.ok) {
      return { ok: false, error: `NPHL ${res.status}: ${body?.message ?? ""} ${body?.error ?? ""}`.trim() };
    }
    return { ok: true, data: Array.isArray(body?.data) ? body.data : [] };
  } catch (e) {
    return { ok: false, error: `NPHL request failed: ${String(e)}` };
  }
}

async function getResource(path: string): Promise<any | null> {
  const r = await FhirApi({ url: path });
  return r.status === "success" && r.data?.resourceType && r.data.resourceType !== "OperationOutcome" ? r.data : null;
}

async function putResource(resource: any): Promise<void> {
  const r = await FhirApi({
    url: `/${resource.resourceType}/${resource.id}`,
    method: "PUT",
    data: JSON.stringify(resource),
  });
  if (r.status !== "success") {
    throw new Error(`Failed to write ${resource.resourceType}/${resource.id}: ${JSON.stringify(r.data).slice(0, 500)}`);
  }
}

async function searchAll(path: string, maxPages = 20): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < maxPages; page++) {
    const bundle: any = (await FhirApi({ url: next })).data;
    for (const e of bundle?.entry ?? []) if (e?.resource) out.push(e.resource);
    const link: string | undefined = bundle?.link?.find((l: any) => l.relation === "next")?.url;
    next = link ? toRelativeRequestPath(link) : null;
  }
  return out;
}

/**
 * Puts the Specimen's lab status. Versioned (If-Match) so a mobile re-sync in between is not
 * overwritten; on a conflict it re-reads the Specimen and tries once more.
 */
async function updateSpecimenLabStatus(specimen: any, task: any): Promise<void> {
  let current = specimen;
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = specimenWithLabStatus(current, task);
    if (!next) return;
    const version = current?.meta?.versionId;
    const r = await FhirApi({
      url: `/Specimen/${current.id}`,
      method: "PUT",
      data: JSON.stringify(next),
      ...(version ? { headers: { "If-Match": `W/"${version}"` } } : {}),
    });
    if (r.status === "success") return;
    current = await getResource(`/Specimen/${specimen.id}`);
    if (!current) break;
  }
  console.error(`[NPHL] Could not update lab status on Specimen/${specimen.id}`);
}

/** Writes the result Observation and the Task for one specimen; skips writes that change nothing. */
async function recordSpecimenState(
  specimen: any,
  caseEncounterId: string,
  state: TaskState,
  payloadHash?: string,
  existingTask?: any,
): Promise<SpecimenSyncOutcome> {
  const existing = existingTask !== undefined ? existingTask : await getResource(`/Task/${taskIdForSpecimen(specimen.id)}`);

  // Never undo recorded progress: a failed re-post after a successful one, or a response
  // without a result after one that had a result (NPHL's POST can lag a pushed result).
  const existingCode = existing?.businessStatus?.coding?.[0]?.code;
  const existingHasResult = existingCode === "preliminary-result" || existingCode === "final-result";
  // A rejection is final too: only a result from the lab replaces it.
  const existingRejected = existing?.status === "rejected";
  const newHasResult = state.kind === "submitted" && !!state.result?.result;
  const failedAfterSubmit =
    (state.kind === "submission-failed" || state.kind === "awaiting-epid") &&
    ["in-progress", "completed", "rejected"].includes(existing?.status);
  const noResultAfterOutcome = state.kind === "submitted" && !newHasResult && (existingHasResult || existingRejected);
  if (existing && (failedAfterSubmit || noResultAfterOutcome)) {
    return {
      specimenId: specimen.id,
      label: specimenLabel(specimen).value,
      status: existing.status,
      businessStatus: existing.businessStatus?.coding?.[0]?.code ?? "",
    };
  }

  let resultObservationId: string | undefined;
  let observation: any;
  if (state.kind === "submitted" && state.result?.result) {
    observation = buildResultObservation({ specimen, caseEncounterId, result: state.result });
    const current = await getResource(`/Observation/${observation.id}`);
    if (resultChanged(current, observation)) await putResource(observation);
    resultObservationId = resultObservationIdForSpecimen(specimen.id);
  }

  const task = buildSpecimenTask({ existing, specimen, caseEncounterId, state, resultObservationId, payloadHash });
  if (taskChanged(existing, task)) await putResource(task);
  // Our Specimen write re-fires the Specimen subscription; the case then has an unchanged
  // payload hash and is not re-posted. A failure here never fails the sync.
  await updateSpecimenLabStatus(specimen, task).catch((e) =>
    console.error(`[NPHL] Specimen/${specimen.id} lab status update failed:`, e),
  );

  // Email the case submitter once per new outcome; a mail failure never fails the sync.
  const outcome = notifiableOutcome(existing, task);
  if (outcome) {
    await notifySpecimenOutcome({ outcome, task, caseEncounterId, observation }).catch((e) =>
      console.error(`[NPHL] ${outcome} email for ${task.id} failed:`, e),
    );
  }
  return {
    specimenId: specimen.id,
    label: specimenLabel(specimen).value,
    status: task.status,
    businessStatus: task.businessStatus.coding[0].code,
  };
}

/**
 * Posts a VHF case and all of its specimens to NPHL. Resubmitting is safe on NPHL's side,
 * and the response carries the latest result for each specimen, so this is also the poll.
 */
export async function syncCaseToNphl(
  caseEncounterId: string,
  opts: { onlyIfChanged?: boolean } = {},
): Promise<CaseSyncResult> {
  const encounter = await getResource(`/Encounter/${caseEncounterId}`);
  if (!encounter) return { kind: "error", error: `Encounter/${caseEncounterId} not found` };
  if (!isVhfCaseEncounter(encounter)) return { kind: "skipped", reason: "Not a VHF case encounter" };

  const patientId = encounter.subject?.reference?.split("/")[1];
  const patient = patientId ? await getResource(`/Patient/${patientId}`) : null;
  if (!patient) return { kind: "error", error: `Patient for Encounter/${caseEncounterId} not found` };

  const specimens = (await searchAll(`/Specimen?subject=Patient/${patientId}&_count=100`))
    .filter((s) => specimenCaseEncounterId(s) === caseEncounterId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!specimens.length) return { kind: "skipped", reason: "Case has no specimens" };

  const epid = getEpidValueFromEncounter(encounter) ?? getEpidValueFromPatient(patient);
  if (!epid) {
    const outcomes = [];
    for (const s of specimens) outcomes.push(await recordSpecimenState(s, caseEncounterId, { kind: "awaiting-epid" }));
    return { kind: "synced", caseEncounterId, submitted: false, specimens: outcomes };
  }

  const observations = await searchAll(`/Observation?encounter=Encounter/${caseEncounterId}&_count=500`);
  const payload = buildSurveillancePayload({
    caseEncounterId,
    epid,
    patient,
    observations,
    specimens,
    labTests: nphlConfig().labTests,
  });
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  // Subscription re-deliveries and mobile re-syncs: nothing NPHL would see has changed, so don't post.
  const existingTasks = await Promise.all(specimens.map((s) => getResource(`/Task/${taskIdForSpecimen(s.id)}`)));
  if (
    opts.onlyIfChanged &&
    existingTasks.every(
      (t) => t && ["in-progress", "completed", "rejected"].includes(t.status) && taskPayloadHash(t) === payloadHash,
    )
  ) {
    return { kind: "skipped", reason: "Case unchanged since it was last submitted to NPHL" };
  }

  const response = await postSurveillance(payload);

  const outcomes: SpecimenSyncOutcome[] = [];
  if (!response.ok) {
    console.error(`[NPHL] Case ${caseEncounterId}: ${response.error}`);
    for (const [i, s] of specimens.entries()) {
      outcomes.push(
        await recordSpecimenState(s, caseEncounterId, { kind: "submission-failed", error: response.error }, undefined, existingTasks[i]),
      );
    }
    return { kind: "synced", caseEncounterId, submitted: false, specimens: outcomes };
  }

  const states = new Map<string, TaskState>(
    response.data.map((e) => [String(e?.specimen_id ?? ""), surveillanceEntryState(e)] as [string, TaskState]),
  );
  for (const [i, s] of specimens.entries()) {
    const state = states.get(specimenLabel(s).value) ?? { kind: "submitted", result: null };
    outcomes.push(await recordSpecimenState(s, caseEncounterId, state, payloadHash, existingTasks[i]));
  }
  return { kind: "synced", caseEncounterId, submitted: true, specimens: outcomes };
}

export async function syncSpecimenToNphl(specimenId: string): Promise<CaseSyncResult> {
  const specimen = await getResource(`/Specimen/${specimenId}`);
  if (!specimen) return { kind: "error", error: `Specimen/${specimenId} not found` };
  const caseEncounterId = specimenCaseEncounterId(specimen);
  if (!caseEncounterId) return { kind: "skipped", reason: "Specimen is not linked to a case encounter" };
  return runCaseSync(caseEncounterId, {});
}

/*
 * Subscription traffic is coalesced per case. A phone syncing five specimens fires five
 * callbacks; they become one NPHL post after a short quiet window. A callback for a case that
 * is already syncing marks it to run once more afterwards, never in parallel. Our own writes
 * (Task, and Observations coded nphl-lab-result) match no subscription, so there is no loop.
 */
const pendingCases = new Map<string, ReturnType<typeof setTimeout>>();
const runningCases = new Set<string>();
const rerunCases = new Set<string>();

async function runCaseSync(caseEncounterId: string, opts: { onlyIfChanged?: boolean }): Promise<CaseSyncResult> {
  if (runningCases.has(caseEncounterId)) {
    rerunCases.add(caseEncounterId);
    return { kind: "skipped", reason: "A sync for this case is already running; it will run again after" };
  }
  runningCases.add(caseEncounterId);
  try {
    return await syncCaseToNphl(caseEncounterId, opts);
  } finally {
    runningCases.delete(caseEncounterId);
    if (rerunCases.delete(caseEncounterId)) queueCaseSync(caseEncounterId);
  }
}

async function logQueuedSync(caseEncounterId: string, result: CaseSyncResult | { kind: "error"; error: string }, startedAt: number) {
  const outcome = result.kind === "skipped" ? "skipped" : result.kind === "error" || !result.submitted ? "error" : "success";
  await prisma.fhirSubscriptionCallbackLog
    .create({
      data: {
        route: "nphl-case-sync",
        resourceType: "Encounter",
        resourceId: caseEncounterId,
        httpStatus: 200,
        outcome,
        errorMessage:
          result.kind === "error"
            ? result.error.slice(0, 2000)
            : outcome === "error"
              ? "Specimens not submitted to NPHL; see Task statusReason"
              : null,
        detail: result as object,
        durationMs: Date.now() - startedAt,
      },
    })
    .catch((e) => console.error("FhirSubscriptionCallbackLog write failed:", e));
}

/** Queues a debounced, change-only sync of one case. Returns at once. */
export function queueCaseSync(caseEncounterId: string): "queued" | "already-queued" {
  if (pendingCases.has(caseEncounterId)) return "already-queued";
  if (runningCases.has(caseEncounterId)) {
    rerunCases.add(caseEncounterId);
    return "already-queued";
  }
  const timer = setTimeout(async () => {
    pendingCases.delete(caseEncounterId);
    const startedAt = Date.now();
    let result: CaseSyncResult;
    try {
      result = await runCaseSync(caseEncounterId, { onlyIfChanged: true });
    } catch (e) {
      console.error(`[NPHL] Queued sync failed for case ${caseEncounterId}:`, e);
      result = { kind: "error", error: String(e) };
    }
    await logQueuedSync(caseEncounterId, result, startedAt);
  }, nphlConfig().debounceMs);
  pendingCases.set(caseEncounterId, timer);
  return "queued";
}

/** Resolves a Specimen to its case and queues the case. */
export async function queueSpecimenSync(specimenId: string): Promise<CaseSyncResult | { kind: "queued"; caseEncounterId: string; status: string }> {
  const specimen = await getResource(`/Specimen/${specimenId}`);
  if (!specimen) return { kind: "error", error: `Specimen/${specimenId} not found` };
  const caseEncounterId = specimenCaseEncounterId(specimen);
  if (!caseEncounterId) return { kind: "skipped", reason: "Specimen is not linked to a case encounter" };
  return { kind: "queued", caseEncounterId, status: queueCaseSync(caseEncounterId) };
}

export async function syncCaseNow(caseEncounterId: string): Promise<CaseSyncResult> {
  return runCaseSync(caseEncounterId, {});
}

let pollRunning = false;

/**
 * Re-posts cases that still have a specimen without a final result or rejection. Bounded: only
 * Tasks authored in the last NPHL_POLL_MAX_AGE_DAYS, at most NPHL_POLL_MAX_CASES cases per run,
 * one case at a time; a run never overlaps the previous one.
 */
export async function pollOpenNphlTasks(): Promise<{ cases: number; errors: number } | null> {
  if (pollRunning) return null;
  pollRunning = true;
  try {
    const { pollMaxAgeDays, pollMaxCases } = nphlConfig();
    const since = new Date(Date.now() - pollMaxAgeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tasks = await searchAll(
      `/Task?code=${encodeURIComponent(`${TASK_CODE_SYSTEM}|${TASK_CODE}`)}&status=requested,in-progress,on-hold&authored-on=ge${since}&_sort=_lastUpdated&_count=200`,
      5,
    );
    const caseIds = [...new Set(tasks.map((t) => t.encounter?.reference?.split("/")[1]).filter(Boolean))].slice(
      0,
      pollMaxCases,
    ) as string[];
    let errors = 0;
    for (const id of caseIds) {
      try {
        const r = await runCaseSync(id, {});
        if (r.kind === "error" || (r.kind === "synced" && !r.submitted)) errors++;
      } catch (e) {
        errors++;
        console.error(`[NPHL] Poll failed for case ${id}:`, e);
      }
    }
    return { cases: caseIds.length, errors };
  } finally {
    pollRunning = false;
  }
}

export type PushedUpdateOutcome = { specimenId: string; kind?: LabUpdate["kind"]; matched: boolean; status?: string; businessStatus?: string; error?: string };

/** Applies results and rejections pushed by the lab system, matched to Tasks by the specimen tube label. */
export async function applyLabUpdates(updates: LabUpdate[]): Promise<PushedUpdateOutcome[]> {
  const out: PushedUpdateOutcome[] = [];
  for (const update of updates) {
    try {
      const tasks = await searchAll(
        `/Task?identifier=${encodeURIComponent(`${SPECIMEN_LABEL_SYSTEM}|${update.specimenId}`)}&code=${encodeURIComponent(`${TASK_CODE_SYSTEM}|${TASK_CODE}`)}`,
        1,
      );
      if (!tasks.length) {
        out.push({ specimenId: update.specimenId, matched: false, error: "No specimen with this ID has been submitted" });
        continue;
      }
      for (const task of tasks) {
        const specimen = await getResource(`/${task.focus?.reference}`);
        const caseEncounterId = task.encounter?.reference?.split("/")[1];
        if (!specimen || !caseEncounterId) {
          out.push({ specimenId: update.specimenId, matched: false, error: "Task has no specimen or case" });
          continue;
        }
        const state: TaskState =
          update.kind === "rejected"
            ? { kind: "rejected", rejection: update.rejection }
            : { kind: "submitted", result: update.result };
        const o = await recordSpecimenState(specimen, caseEncounterId, state);
        out.push({ specimenId: update.specimenId, kind: update.kind, matched: true, status: o.status, businessStatus: o.businessStatus });
      }
    } catch (e) {
      out.push({ specimenId: update.specimenId, matched: false, error: String(e) });
    }
  }
  return out;
}

function labStagingConfig() {
  return {
    baseUrl: (process.env.LAB_STAGING_API_URL || "https://lab-staging-api.nphl.go.ke").replace(/\/$/, ""),
    apiKey: process.env.LAB_STAGING_API_KEY?.trim(),
    timeoutMs: Number(process.env.LAB_STAGING_TIMEOUT_MS) || 60000,
    lookbackDays: Math.max(1, Number(process.env.LAB_STAGING_LOOKBACK_DAYS) || 14),
  };
}

/** GET /list on the NPHL lab staging API: lab line-list rows with a test date on or after dateFrom. */
async function fetchLabStagingRows(dateFrom: string): Promise<{ ok: true; rows: any[] } | { ok: false; error: string }> {
  const { baseUrl, apiKey, timeoutMs } = labStagingConfig();
  if (!apiKey) return { ok: false, error: "LAB_STAGING_API_KEY is not configured" };
  try {
    const res = await fetch(`${baseUrl}/list?dateFrom=${dateFrom}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 500) };
    }
    if (!res.ok) return { ok: false, error: `Lab staging ${res.status}: ${body?.message ?? ""}`.trim() };
    return { ok: true, rows: Array.isArray(body?.data) ? body.data : [] };
  } catch (e) {
    return { ok: false, error: `Lab staging request failed: ${String(e)}` };
  }
}

let stagingPollRunning = false;

/**
 * Pulls results that are ready from the NPHL lab staging API (GET /list) and records the ones
 * for specimens we submitted and are still waiting on. Rows are matched to Tasks on the tube
 * label (specimenIdentifier); rows for other specimens, and specimens with a final result or a
 * rejection already, are ignored.
 */
export async function pollLabStagingResults(): Promise<
  { rows: number; open: number; updates: number; matched: number } | { error: string } | null
> {
  if (stagingPollRunning) return null;
  stagingPollRunning = true;
  try {
    const { lookbackDays } = labStagingConfig();
    const { pollMaxAgeDays } = nphlConfig();
    const dateFrom = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fetched = await fetchLabStagingRows(dateFrom);
    if (!fetched.ok) {
      console.error(`[NPHL] ${fetched.error}`);
      return { error: fetched.error };
    }

    const since = new Date(Date.now() - pollMaxAgeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const openTasks = await searchAll(
      `/Task?code=${encodeURIComponent(`${TASK_CODE_SYSTEM}|${TASK_CODE}`)}&status=requested,in-progress,on-hold&authored-on=ge${since}&_count=200`,
      10,
    );
    const openLabels = new Set(
      openTasks
        .map((t) => (t.identifier ?? []).find((i: any) => i?.system === SPECIMEN_LABEL_SYSTEM)?.value)
        .filter(Boolean),
    );
    const updates = parseLabUpdates(fetched.rows).filter((u) => openLabels.has(u.specimenId));
    const outcomes = updates.length ? await applyLabUpdates(updates) : [];
    return {
      rows: fetched.rows.length,
      open: openLabels.size,
      updates: updates.length,
      matched: outcomes.filter((o) => o.matched).length,
    };
  } finally {
    stagingPollRunning = false;
  }
}

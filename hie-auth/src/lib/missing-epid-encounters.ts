import { FhirApi } from "./utils";
import { patientHasOfficialEpid } from "./epid-utils";
import { REASON_CODE_CONDITIONS, conditionCodeForReason, encounterGetsNoEpid } from "./condition-codes";

const apiHost = process.env.FHIR_BASE_URL || "";

const DEFAULT_ENCOUNTER_PATH = "/Encounter?_count=500";
const MAX_LIMIT = 50;
const MAX_BUNDLE_PAGES = 100;

export interface MissingEpidEncounterRow {
  encounterId: string;
  patientId: string;
  createdAt: string | null;
  conditionCode: string | null;
  conditionLabel: string | null;
  patientName: string | null;
}

export interface MissingEpidFilters {
  /** Condition code as shown in the list, e.g. "VHF", "MEA", "AFP". */
  condition?: string | null;
  /** Inclusive created-date bounds, YYYY-MM-DD. */
  from?: string | null;
  to?: string | null;
  /** Matches encounter ID, patient ID, patient name or any patient identifier. */
  q?: string | null;
}

interface ScanCursor {
  path: string;
  index: number;
}

function toRelativeRequestPath(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    let path = u.pathname + (u.search || "");
    if (!apiHost) return path;
    try {
      const base = new URL(apiHost.endsWith("/") ? apiHost.slice(0, -1) : apiHost);
      const basePath = base.pathname.replace(/\/$/, "") || "";
      if (basePath && path.startsWith(basePath)) {
        path = path.slice(basePath.length) || "/";
      }
    } catch {
      /* keep path */
    }
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return fullUrl;
  }
}

function encodeCursor(cursor: ScanCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(raw: string | null | undefined): ScanCursor | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as ScanCursor;
    if (typeof parsed.path === "string" && typeof parsed.index === "number" && parsed.index >= 0) {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function patientIdFromEncounter(enc: any): string | null {
  const ref = enc?.subject?.reference;
  if (typeof ref !== "string" || !ref.includes("/")) return null;
  const id = ref.split("/").pop();
  return id?.trim() ? id : null;
}

function createdAtFromEncounter(enc: any): string | null {
  const periodStart = enc?.period?.start;
  if (typeof periodStart === "string" && periodStart.trim()) {
    return periodStart;
  }
  const lastUpdated = enc?.meta?.lastUpdated;
  if (typeof lastUpdated === "string" && lastUpdated.trim()) {
    return lastUpdated;
  }
  return null;
}

function conditionFromEncounter(enc: any): { code: string | null; label: string | null } {
  const coding = enc?.reasonCode?.[0]?.coding?.[0];
  const code = coding?.code != null ? String(coding.code) : null;
  const display = coding?.display != null ? String(coding.display) : null;
  const label =
    (display && REASON_CODE_CONDITIONS[display]) ||
    (code ? conditionCodeForReason(code) : null);
  return { code, label };
}

function patientNameOf(patient: any): string | null {
  const n = patient?.name?.[0];
  if (!n) return null;
  const name = [...(n.given ?? []), n.family].filter(Boolean).join(" ").trim();
  return name || (typeof n.text === "string" && n.text.trim() ? n.text.trim() : null);
}

/** Created date as YYYY-MM-DD in Kenya time, for comparing against the date filters. */
function kenyaDay(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function matchesEncounterFilters(row: { createdAt: string | null; conditionLabel: string | null }, f: MissingEpidFilters): boolean {
  if (f.condition && (row.conditionLabel ?? "").toUpperCase() !== f.condition.toUpperCase()) return false;
  if (f.from || f.to) {
    const day = kenyaDay(row.createdAt);
    if (!day) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
  }
  return true;
}

function matchesSearch(q: string, enc: any, patientId: string, patient: any, name: string | null): boolean {
  const needle = q.toLowerCase();
  const haystack = [
    String(enc.id),
    patientId,
    name ?? "",
    ...(patient?.identifier ?? []).map((i: any) => String(i?.value ?? "")),
    ...(enc?.identifier ?? []).map((i: any) => String(i?.value ?? "")),
  ];
  return haystack.some((v) => v.toLowerCase().includes(needle));
}

export async function scanEncountersMissingEpid(options: {
  limit: number;
  cursor?: string | null;
  filters?: MissingEpidFilters;
}): Promise<{
  encounters: MissingEpidEncounterRow[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit || 25));
  const decoded = decodeCursor(options.cursor);
  let path: string | null = decoded?.path ?? DEFAULT_ENCOUNTER_PATH;
  let index = decoded?.index ?? 0;

  const filters = options.filters ?? {};
  const q = filters.q?.trim() || "";

  const encounters: MissingEpidEncounterRow[] = [];
  let pagesScanned = 0;

  while (encounters.length < limit && path && pagesScanned < MAX_BUNDLE_PAGES) {
    const res = await FhirApi({ url: path });
    const bundle = res.data;
    if (bundle?.resourceType !== "Bundle" || !Array.isArray(bundle.entry)) {
      path = null;
      break;
    }

    for (; index < bundle.entry.length && encounters.length < limit; index++) {
      const enc = bundle.entry[index]?.resource;
      if (enc?.resourceType !== "Encounter" || !enc?.id) continue;
      // Call logs never get an EPID, so they are never "missing" one.
      if (encounterGetsNoEpid(enc)) continue;

      const patientId = patientIdFromEncounter(enc);
      if (!patientId) continue;

      // Cheap checks first, so filtered-out rows skip the Patient fetch.
      const { code, label } = conditionFromEncounter(enc);
      const createdAt = createdAtFromEncounter(enc);
      if (!matchesEncounterFilters({ createdAt, conditionLabel: label }, filters)) continue;

      const patientResp = await FhirApi({ url: `/Patient/${patientId}` });
      const patient = patientResp.data;
      if (patientResp.status !== "success" || patient?.resourceType !== "Patient") {
        continue;
      }
      if (patientHasOfficialEpid(patient)) {
        continue;
      }

      const patientName = patientNameOf(patient);
      if (q && !matchesSearch(q, enc, patientId, patient, patientName)) continue;

      encounters.push({
        encounterId: String(enc.id),
        patientId,
        createdAt,
        conditionCode: code,
        conditionLabel: label,
        patientName,
      });
    }

    if (index >= bundle.entry.length) {
      const nextLink = bundle.link?.find((l: any) => l.relation === "next")?.url;
      path = nextLink ? toRelativeRequestPath(nextLink) : null;
      index = 0;
      pagesScanned++;
    } else {
      break;
    }
  }

  const hasMore = Boolean(path && (encounters.length >= limit || index > 0));
  const nextCursor =
    path && hasMore ? encodeCursor({ path, index }) : null;

  return { encounters, nextCursor, hasMore };
}

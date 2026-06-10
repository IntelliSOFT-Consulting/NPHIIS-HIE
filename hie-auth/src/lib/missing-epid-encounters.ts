import { FhirApi } from "./utils";
import { patientHasOfficialEpid } from "./epid-utils";

const apiHost = process.env.FHIR_BASE_URL || "";

const POSSIBLE_REASON_CODES: Record<string, string> = {
  "Measles Case Information": "MEA",
  "MOH 505 Reporting Form": "MOH505",
  "AFP Case Information": "AFP",
};

const DEFAULT_ENCOUNTER_PATH = "/Encounter?_count=500";
const MAX_LIMIT = 50;
const MAX_BUNDLE_PAGES = 100;

export interface MissingEpidEncounterRow {
  encounterId: string;
  patientId: string;
  createdAt: string | null;
  conditionCode: string | null;
  conditionLabel: string | null;
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
    (display && POSSIBLE_REASON_CODES[display]) ||
    (code ? code.toUpperCase().slice(0, 3) : null);
  return { code, label };
}

export async function scanEncountersMissingEpid(options: {
  limit: number;
  cursor?: string | null;
}): Promise<{
  encounters: MissingEpidEncounterRow[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit || 25));
  const decoded = decodeCursor(options.cursor);
  let path: string | null = decoded?.path ?? DEFAULT_ENCOUNTER_PATH;
  let index = decoded?.index ?? 0;

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

      const patientId = patientIdFromEncounter(enc);
      if (!patientId) continue;

      const patientResp = await FhirApi({ url: `/Patient/${patientId}` });
      const patient = patientResp.data;
      if (patientResp.status !== "success" || patient?.resourceType !== "Patient") {
        continue;
      }
      if (patientHasOfficialEpid(patient)) {
        continue;
      }

      const { code, label } = conditionFromEncounter(enc);
      encounters.push({
        encounterId: String(enc.id),
        patientId,
        createdAt: createdAtFromEncounter(enc),
        conditionCode: code,
        conditionLabel: label,
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

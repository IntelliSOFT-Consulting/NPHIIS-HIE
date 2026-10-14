import { FhirApi } from "./utils";

const apiHost = process.env.FHIR_BASE_URL || "";

/**
 * Convert an absolute FHIR next link to a path suitable for FhirApi (`${FHIR_BASE_URL}${path}`).
 */
export function toRelativeRequestPath(fullUrl: string): string {
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

/**
 * When Encounter version 1 was persisted on the server (`meta.lastUpdated` on the v1 instance).
 * Used to order backfill processing chronologically.
 */
export async function getEncounterVersionOneLastUpdatedInstant(
  encounterId: string
): Promise<{ instant: string } | null> {
  const vread = await FhirApi({ url: `/Encounter/${encounterId}/_history/1` });
  const d = vread.data;
  if (
    vread.status === "success" &&
    d?.resourceType === "Encounter" &&
    String(d?.meta?.versionId) === "1" &&
    d?.meta?.lastUpdated
  ) {
    return { instant: String(d.meta.lastUpdated) };
  }

  let nextPath: string | null = `/Encounter/${encounterId}/_history?_count=500`;
  const maxPages = 50;
  let fallback: { vid: number; instant: string } | null = null;

  for (let page = 0; page < maxPages && nextPath; page++) {
    const res = await FhirApi({ url: nextPath });
    const bundle = res.data;
    if (bundle?.resourceType !== "Bundle" || !bundle.entry?.length) break;

    for (const e of bundle.entry) {
      const r = e?.resource;
      const vidStr = r?.meta?.versionId;
      const lu = r?.meta?.lastUpdated;
      if (r?.resourceType !== "Encounter" || !vidStr || !lu) continue;
      if (String(vidStr) === "1") {
        return { instant: String(lu) };
      }
      const vid = parseInt(String(vidStr), 10);
      if (!isNaN(vid)) {
        if (!fallback || vid < fallback.vid) {
          fallback = { vid, instant: String(lu) };
        }
      }
    }

    const nextLink = bundle.link?.find((l: any) => l.relation === "next")?.url;
    nextPath = nextLink ? toRelativeRequestPath(nextLink) : null;
  }

  if (fallback) {
    return { instant: fallback.instant };
  }

  return null;
}

export function compareIsoInstant(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (isNaN(ta) && isNaN(tb)) return 0;
  if (isNaN(ta)) return 1;
  if (isNaN(tb)) return -1;
  return ta - tb;
}

/**
 * Deduplicate, resolve v1 instants, sort ascending (unknown instant last).
 */
export async function orderEncounterIdsByV1(encounterIds: string[]): Promise<string[]> {
  const normalizedIds = [...new Set(encounterIds.map((x) => String(x).trim()).filter(Boolean))];
  const timeRows = await Promise.all(
    normalizedIds.map(async (eid) => {
      const v1 = await getEncounterVersionOneLastUpdatedInstant(eid);
      return { eid, instant: v1?.instant ?? null };
    })
  );
  timeRows.sort((a, b) => {
    if (!a.instant && !b.instant) return a.eid.localeCompare(b.eid);
    if (!a.instant) return 1;
    if (!b.instant) return -1;
    const c = compareIsoInstant(a.instant, b.instant);
    return c !== 0 ? c : a.eid.localeCompare(b.eid);
  });
  return timeRows.map((r) => r.eid);
}

/**
 * Paginate `GET /Encounter` until no `next` link (cap pages for safety).
 */
export async function fetchAllEncounterIds(maxPages: number = 2000): Promise<string[]> {
  const ids: string[] = [];
  let nextPath: string | null = "/Encounter?_count=500";
  for (let page = 0; page < maxPages && nextPath; page++) {
    const res = await FhirApi({ url: nextPath });
    const bundle = res.data;
    if (bundle?.resourceType !== "Bundle" || !bundle.entry?.length) break;
    for (const e of bundle.entry) {
      const r = e?.resource;
      if (r?.resourceType === "Encounter" && r?.id) {
        ids.push(String(r.id));
      }
    }
    const nextLink = bundle.link?.find((l: any) => l.relation === "next")?.url;
    nextPath = nextLink ? toRelativeRequestPath(nextLink) : null;
  }
  return [...new Set(ids)];
}

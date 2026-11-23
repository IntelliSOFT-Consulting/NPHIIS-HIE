// EVD daily snapshots in HAPI: one standalone QuestionnaireResponse per sub-county per
// reporting date (id from snapshotId, so saving again replaces it). No Patient or Encounter:
// a snapshot is an aggregate return, not a case. The analytics pipeline already flattens
// QuestionnaireResponse (questionnaire_response_flat_pg / _answer_pg) for Superset.

import { NATIONAL_ROLES, hasAnyRole } from "./roles";
import type { UserProfile } from "./server-auth";
import { FHIR_BASE_URL, fhirHeaders, searchAll, searchPage } from "./fhir-search";
import {
  EVD_SNAPSHOT_QUESTIONNAIRE,
  EVD_SNAPSHOT_TAG_COUNTY,
  EVD_SNAPSHOT_TAG_DATE,
  EVD_SNAPSHOT_TAG_SUBCOUNTY,
  buildQuestionnaireResponse,
  snapshotId,
  summaryFromResponse,
  type LocationRef,
  type SnapshotInput,
  type SnapshotSummary,
} from "./evd-snapshot";

type Resource = Record<string, any>;

/* ── Who may see and send what ──────────────────────────────────────────── */

/** National roles see everything; others only the county or sub-county on their profile. */
export interface SnapshotScope {
  countyId?: string;
  subCountyId?: string;
  countyName?: string;
  subCountyName?: string;
}

/** null = whole country; undefined = the user has no area, so no access. */
export function snapshotScopeFor(profile: UserProfile): SnapshotScope | null | undefined {
  if (hasAnyRole(profile.roles, NATIONAL_ROLES)) return null;
  const li = profile.locationInfo;
  if (li?.subCounty || li?.subCountyName) {
    return { subCountyId: li.subCounty || undefined, subCountyName: li.subCountyName || undefined };
  }
  if (li?.county || li?.countyName) {
    return { countyId: li.county || undefined, countyName: li.countyName || undefined };
  }
  return undefined;
}

const sameName = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export class SnapshotError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 = 400,
  ) {
    super(message);
    this.name = "SnapshotError";
  }
}

async function getLocation(id: string, token: string): Promise<Resource | null> {
  const res = await fetch(`${FHIR_BASE_URL}/Location/${encodeURIComponent(id)}`, {
    headers: fhirHeaders(token),
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`FHIR read Location/${id} failed (${res.status})`);
  return (await res.json()) as Resource;
}

/**
 * The county and sub-county as HAPI has them (names come from HAPI, not the browser), and
 * whether the user may report for that sub-county. Throws SnapshotError when not.
 */
export async function resolveReportingUnit(
  input: Pick<SnapshotInput, "county" | "subCounty">,
  scope: SnapshotScope | null,
  token: string,
): Promise<{ county: LocationRef; subCounty: LocationRef }> {
  const [county, subCounty] = await Promise.all([
    getLocation(input.county!.id, token),
    getLocation(input.subCounty!.id, token),
  ]);
  if (!county?.name) throw new SnapshotError("County not found");
  if (!subCounty?.name) throw new SnapshotError("Sub-county not found");
  if (subCounty.partOf?.reference !== `Location/${county.id}`) {
    throw new SnapshotError(`${subCounty.name} is not in ${county.name} County`);
  }
  if (scope) {
    const subOk = scope.subCountyId
      ? scope.subCountyId === subCounty.id
      : scope.subCountyName
        ? sameName(scope.subCountyName, subCounty.name)
        : true;
    const countyOk = scope.countyId
      ? scope.countyId === county.id
      : scope.countyName
        ? sameName(scope.countyName, county.name)
        : true;
    if (!subOk || !countyOk) {
      throw new SnapshotError("You can only report for your own sub-county", 403);
    }
  }
  return { county: { id: county.id, name: county.name }, subCounty: { id: subCounty.id, name: subCounty.name } };
}

/* ── Saving ─────────────────────────────────────────────────────────────── */

export interface SaveResult {
  id: string;
  /** True when a snapshot for that sub-county and date already existed and was replaced. */
  replaced: boolean;
}

/**
 * Saves a validated snapshot. The first submission time is kept when replacing, so the
 * 09:00 EAT on-time flag reflects when the return first came in.
 */
export async function saveSnapshot(
  input: SnapshotInput,
  scope: SnapshotScope | null,
  ctx: { practitionerId?: string; submittedBy?: string; now?: Date },
  token: string,
): Promise<SaveResult> {
  const unit = await resolveReportingUnit(input, scope, token);
  const resolved: SnapshotInput = { ...input, county: unit.county, subCounty: unit.subCounty };
  const id = snapshotId(unit.subCounty.id, input.reportingDate);

  const existingRes = await fetch(`${FHIR_BASE_URL}/QuestionnaireResponse/${encodeURIComponent(id)}`, {
    headers: fhirHeaders(token),
    cache: "no-store",
  });
  if (!existingRes.ok && existingRes.status !== 404 && existingRes.status !== 410) {
    throw new Error(`FHIR read QuestionnaireResponse/${id} failed (${existingRes.status})`);
  }
  const existing = existingRes.ok ? ((await existingRes.json()) as Resource) : null;

  const body = buildQuestionnaireResponse(resolved, { ...ctx, firstAuthored: existing?.authored });
  const res = await fetch(`${FHIR_BASE_URL}/QuestionnaireResponse/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { ...fhirHeaders(token), "Content-Type": "application/fhir+json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HAPI rejected the snapshot (${res.status}): ${text.slice(0, 300)}`);
  }
  return { id, replaced: existing !== null };
}

/* ── Listing ────────────────────────────────────────────────────────────── */

export interface SnapshotQuery {
  page: number;
  pageSize: number;
  /** yyyy-mm-dd: only that reporting date. */
  date?: string;
  countyId?: string;
  subCountyId?: string;
}

export interface SnapshotPage {
  snapshots: SnapshotSummary[];
  total: number;
  page: number;
  pageSize: number;
}

const tag = (system: string, code: string) => `${system}|${code}`;

/** The scope (and any filter the caller picked inside it) as HAPI `_tag` conditions, ANDed. */
function tagFilters(q: Pick<SnapshotQuery, "date" | "countyId" | "subCountyId">, scope: SnapshotScope | null): string[] {
  const tags: string[] = [];
  if (scope?.subCountyId) tags.push(tag(EVD_SNAPSHOT_TAG_SUBCOUNTY, scope.subCountyId));
  else if (scope?.countyId) tags.push(tag(EVD_SNAPSHOT_TAG_COUNTY, scope.countyId));
  if (q.subCountyId) tags.push(tag(EVD_SNAPSHOT_TAG_SUBCOUNTY, q.subCountyId));
  if (q.countyId) tags.push(tag(EVD_SNAPSHOT_TAG_COUNTY, q.countyId));
  if (q.date) tags.push(tag(EVD_SNAPSHOT_TAG_DATE, q.date));
  return tags;
}

function searchParams(tags: string[]): URLSearchParams {
  const params = new URLSearchParams({ questionnaire: EVD_SNAPSHOT_QUESTIONNAIRE });
  // Repeated `_tag` parameters are ANDed by HAPI.
  for (const t of tags) params.append("_tag", t);
  return params;
}

/**
 * One page of snapshots, newest first. A user whose profile names a sub-county or county by
 * name only (no id) cannot be tag-filtered, so for them the page is filtered after the fact.
 */
export async function listSnapshots(token: string, scope: SnapshotScope | null, q: SnapshotQuery): Promise<SnapshotPage> {
  const byNameOnly = !!scope && !scope.subCountyId && !scope.countyId;
  const params = searchParams(tagFilters(q, scope));
  params.set("_sort", "-_lastUpdated");

  if (byNameOnly) {
    const all = await searchAll<Resource>(`${FHIR_BASE_URL}/QuestionnaireResponse?${params}&_count=200`, token);
    const mine = all
      .map(summaryFromResponse)
      .filter((s) => (scope!.subCountyName ? sameName(s.subCounty, scope!.subCountyName) : sameName(s.county, scope!.countyName)));
    const start = (q.page - 1) * q.pageSize;
    return { snapshots: mine.slice(start, start + q.pageSize), total: mine.length, page: q.page, pageSize: q.pageSize };
  }

  params.set("_count", String(q.pageSize));
  params.set("_offset", String((q.page - 1) * q.pageSize));
  params.set("_total", "accurate");
  const { resources, total } = await searchPage<Resource>("QuestionnaireResponse", params, token);
  return { snapshots: resources.map(summaryFromResponse), total, page: q.page, pageSize: q.pageSize };
}

export async function getSnapshot(id: string, scope: SnapshotScope | null, token: string): Promise<SnapshotSummary> {
  const res = await fetch(`${FHIR_BASE_URL}/QuestionnaireResponse/${encodeURIComponent(id)}`, {
    headers: fhirHeaders(token),
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 410) throw new SnapshotError("Snapshot not found", 404);
  if (!res.ok) throw new Error(`FHIR read QuestionnaireResponse/${id} failed (${res.status})`);
  const r = (await res.json()) as Resource;
  if (r.questionnaire !== EVD_SNAPSHOT_QUESTIONNAIRE) throw new SnapshotError("Snapshot not found", 404);
  const s = summaryFromResponse(r);
  if (scope) {
    const ok = scope.subCountyId
      ? s.subCountyId === scope.subCountyId
      : scope.countyId
        ? s.countyId === scope.countyId
        : scope.subCountyName
          ? sameName(s.subCounty, scope.subCountyName)
          : sameName(s.county, scope.countyName);
    if (!ok) throw new SnapshotError("Snapshot not found", 404);
  }
  return s;
}

/* ── Who has not reported ───────────────────────────────────────────────── */

export interface ReportingStatus {
  date: string;
  expected: number;
  submitted: number;
  onTime: number;
  missing: Array<{ id: string; name: string; county: string }>;
}

/** Sub-counties in the user's area, with the ones that have no snapshot for [date]. */
export async function reportingStatus(
  token: string,
  scope: SnapshotScope | null,
  date: string,
  countyId?: string,
): Promise<ReportingStatus> {
  const locParams = new URLSearchParams({ _count: "200", _elements: "name,partOf" });
  const countyFilter = scope?.countyId ?? countyId;
  if (countyFilter) locParams.set("partof", `Location/${countyFilter}`);
  else locParams.set("type:code", "SUB-COUNTY");
  const subCountyIdScope = scope?.subCountyId;

  const [locations, snapshots] = await Promise.all([
    searchAll<Resource>(`${FHIR_BASE_URL}/Location?${locParams}`, token),
    searchAll<Resource>(
      `${FHIR_BASE_URL}/QuestionnaireResponse?${searchParams(tagFilters({ date, countyId: countyFilter }, scope?.subCountyId ? scope : null))}&_count=200`,
      token,
    ),
  ]);

  const submitted = new Map<string, SnapshotSummary>();
  for (const r of snapshots) {
    const s = summaryFromResponse(r);
    if (s.subCountyId) submitted.set(s.subCountyId, s);
  }
  // `partof` on a county returns its sub-counties and wards; keep sub-counties (their parent is a county).
  const expected = locations.filter(
    (l) => l.name && (!subCountyIdScope || l.id === subCountyIdScope) && l.partOf?.reference?.startsWith("Location/"),
  );
  const subCounties = countyFilter ? expected.filter((l) => l.partOf.reference === `Location/${countyFilter}`) : expected;
  const missing = subCounties
    .filter((l) => !submitted.has(l.id))
    .map((l) => ({ id: String(l.id), name: String(l.name), county: String(l.partOf?.display ?? "") }))
    .sort((a, b) => a.county.localeCompare(b.county) || a.name.localeCompare(b.name));
  const ids = new Set(subCounties.map((l) => l.id));
  const seen = Array.from(submitted.values()).filter((s) => s.subCountyId && ids.has(s.subCountyId));
  return {
    date,
    expected: subCounties.length,
    submitted: seen.length,
    onTime: seen.filter((s) => s.onTime).length,
    missing,
  };
}

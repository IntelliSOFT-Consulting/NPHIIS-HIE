// Rumour reports from the mobile "Social Listening and Rumor Tracking Tool".
// The app saves each report as a Patient carrying an identifier with
// RUMOUR_SYSTEM (value = the report's Encounter id) plus one Observation per
// answer, coded by questionnaire linkId (AddClientViewModel.kt). Priority is
// set from the admin portal as an extra Observation; every change is a new
// Observation so the history is kept and readers take the latest.

import { NATIONAL_ROLES, hasAnyRole } from "./roles";
import {
  type RumourPriority,
  type RumourReport,
  isRumourPriority,
} from "./rumours";
import type { UserProfile } from "./server-auth";
import { FHIR_BASE_URL, fhirHeaders, searchAll, searchPage } from "./fhir-search";

const RUMOUR_SYSTEM = "social-listening-and-rumor-tracking-tool";
export const RUMOUR_PRIORITY_CODE = "rumour-priority";

// linkIds from rumor-tracking-case.json that the triage list shows.
const FIELD_CODES = {
  epid: "EPID",
  county: "a4-county",
  subCounty: "a3-sub-county",
  ward: "a2-ward",
  village: "871818396498",
  cadre: "683805917262",
  cadreOther: "223529605110",
  agency: "683805917111",
  agencyOther: "22311605110",
  harmfulPractice: "765331413106",
  rumour: "560083852118",
  source: "217867281789",
  investigated: "735623392446",
  investigationResult: "results",
  conclusion: "conclusion",
  priority: RUMOUR_PRIORITY_CODE,
} as const;

// Answers the search box looks in (the same fields the list shows).
const SEARCH_CODES = [
  FIELD_CODES.epid,
  FIELD_CODES.county,
  FIELD_CODES.subCounty,
  FIELD_CODES.ward,
  FIELD_CODES.village,
  FIELD_CODES.rumour,
  FIELD_CODES.harmfulPractice,
  FIELD_CODES.source,
];

const OBSERVATION_PAGE_SIZE = 1000;

export interface RumourQuery {
  page: number;
  pageSize: number;
  search?: string;
  /** A priority, or "unset" for reports nobody has prioritised. */
  priority?: RumourPriority | "unset";
}

export interface RumourPage {
  rumours: RumourReport[];
  total: number;
  page: number;
  pageSize: number;
}

export class RumourNotFoundError extends Error {
  constructor(patientId: string) {
    super(`Rumour report ${patientId} not found`);
    this.name = "RumourNotFoundError";
  }
}

interface RumourPatient {
  id?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  address?: Array<{ city?: string; state?: string }>;
  meta?: { lastUpdated?: string };
}

interface RumourObservation {
  code?: { coding?: Array<{ code?: string }> };
  subject?: { reference?: string };
  valueString?: string;
  valueCodeableConcept?: { text?: string; coding?: Array<{ display?: string }> };
  valueDateTime?: string;
  meta?: { lastUpdated?: string };
}

/** The county or sub-county (by name) whose reports a user may see. */
export interface RumourScope {
  county?: string;
  subCounty?: string;
}

/**
 * National roles see every report. Everyone else is limited to the smallest
 * area on their profile; returns `undefined` when they have no area at all.
 */
export function rumourScopeFor(
  profile: UserProfile,
): RumourScope | null | undefined {
  if (hasAnyRole(profile.roles, NATIONAL_ROLES)) return null;
  const { subCountyName, countyName } = profile.locationInfo ?? {};
  if (subCountyName) return { subCounty: subCountyName };
  if (countyName) return { county: countyName };
  return undefined;
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function inScope(patient: RumourPatient, scope: RumourScope | null): boolean {
  if (!scope) return true;
  const address = patient.address?.[0];
  if (scope.subCounty) return sameName(address?.state, scope.subCounty);
  return sameName(address?.city, scope.county);
}

function rumourEncounterId(patient: RumourPatient): string | undefined {
  return patient.identifier?.find((i) => i.system === RUMOUR_SYSTEM)?.value;
}

function observationValue(o: RumourObservation): string | undefined {
  return (
    o.valueString ??
    o.valueCodeableConcept?.text ??
    o.valueCodeableConcept?.coding?.[0]?.display ??
    o.valueDateTime
  );
}

/** Latest value per code; observations must be sorted oldest → newest. */
function latestByCode(observations: RumourObservation[]): Map<string, RumourObservation> {
  const latest = new Map<string, RumourObservation>();
  for (const o of observations) {
    const code = o.code?.coding?.[0]?.code;
    if (code) latest.set(code, o);
  }
  return latest;
}

/** "Other" answers carry the real value in a companion free-text field. */
function withOther(choice?: string, other?: string): string | undefined {
  return choice?.toLowerCase().startsWith("other") && other ? other : choice;
}

function toReport(patient: RumourPatient, observations: RumourObservation[]): RumourReport {
  const sorted = [...observations].sort((a, b) =>
    (a.meta?.lastUpdated ?? "").localeCompare(b.meta?.lastUpdated ?? ""),
  );
  const latest = latestByCode(sorted);
  const value = (code: string) => {
    const o = latest.get(code);
    return o ? observationValue(o) : undefined;
  };
  const priorityObs = latest.get(FIELD_CODES.priority);
  const priority = value(FIELD_CODES.priority);
  const firstAnswer = sorted.find(
    (o) => o.code?.coding?.[0]?.code !== FIELD_CODES.priority,
  );

  return {
    patientId: patient.id!,
    epid: value(FIELD_CODES.epid),
    reportedAt: firstAnswer?.meta?.lastUpdated ?? patient.meta?.lastUpdated,
    county: value(FIELD_CODES.county) ?? patient.address?.[0]?.city,
    subCounty: value(FIELD_CODES.subCounty) ?? patient.address?.[0]?.state,
    ward: value(FIELD_CODES.ward),
    village: value(FIELD_CODES.village),
    reporterCadre: withOther(value(FIELD_CODES.cadre), value(FIELD_CODES.cadreOther)),
    agency: withOther(value(FIELD_CODES.agency), value(FIELD_CODES.agencyOther)),
    harmfulPractice: value(FIELD_CODES.harmfulPractice),
    rumour: value(FIELD_CODES.rumour),
    source: value(FIELD_CODES.source),
    investigated: value(FIELD_CODES.investigated),
    investigationResult: value(FIELD_CODES.investigationResult),
    conclusion: value(FIELD_CODES.conclusion),
    priority: isRumourPriority(priority) ? priority : undefined,
    prioritySetAt: priorityObs?.meta?.lastUpdated,
  };
}

const subjectId = (o: RumourObservation) => (o.subject?.reference ?? "").replace(/^Patient\//, "");

/** Reports with an answer containing `term` in one of the searchable fields. */
async function reportIdsMatching(term: string, token: string): Promise<Set<string>> {
  const query = new URLSearchParams({
    code: SEARCH_CODES.join(","),
    "value-string:contains": term,
    _elements: "subject",
    _count: String(OBSERVATION_PAGE_SIZE),
  });
  const matches = await searchAll<RumourObservation>(`${FHIR_BASE_URL}/Observation?${query}`, token);
  return new Set(matches.map(subjectId).filter(Boolean));
}

/** Each report's current priority (the latest one set); only reports that were ever prioritised. */
async function currentPriorities(token: string): Promise<Map<string, string | undefined>> {
  const query = new URLSearchParams({
    code: FIELD_CODES.priority,
    _elements: "subject,valueString",
    _count: String(OBSERVATION_PAGE_SIZE),
  });
  const observations = await searchAll<RumourObservation>(`${FHIR_BASE_URL}/Observation?${query}`, token);
  observations.sort((a, b) => (a.meta?.lastUpdated ?? "").localeCompare(b.meta?.lastUpdated ?? ""));
  const latest = new Map<string, string | undefined>();
  for (const o of observations) latest.set(subjectId(o), observationValue(o));
  return latest;
}

/**
 * One page of reports, newest first. Search and the priority filter are resolved to
 * report ids first (both are small lookups), so only the page's answers are fetched.
 */
export async function listRumours(
  token: string,
  scope: RumourScope | null,
  query: RumourQuery,
): Promise<RumourPage> {
  const { page, pageSize } = query;
  const empty: RumourPage = { rumours: [], total: 0, page, pageSize };

  const [matching, priorities] = await Promise.all([
    query.search ? reportIdsMatching(query.search, token) : undefined,
    query.priority ? currentPriorities(token) : undefined,
  ]);
  let only = matching;
  let exclude: string[] = [];
  if (priorities) {
    if (query.priority === "unset") {
      exclude = Array.from(priorities.keys());
    } else {
      const withPriority = Array.from(priorities)
        .filter(([, p]) => p === query.priority)
        .map(([id]) => id);
      only = only ? new Set(withPriority.filter((id) => only!.has(id))) : new Set(withPriority);
    }
  }
  if (only && only.size === 0) return empty;

  const params = new URLSearchParams({
    identifier: `${RUMOUR_SYSTEM}|`,
    _sort: "-_lastUpdated",
    _count: String(pageSize),
    _offset: String((page - 1) * pageSize),
    _total: "accurate",
  });
  if (scope?.subCounty) params.set("address-state", scope.subCounty);
  else if (scope?.county) params.set("address-city", scope.county);
  if (only) params.set("_id", Array.from(only).join(","));
  if (exclude.length) params.set("_id:not", exclude.join(","));

  const { resources, total } = await searchPage<RumourPatient>("Patient", params, token);
  // HAPI matches address names by prefix; drop near-misses so other areas' reports never show.
  const patients = resources.filter((p) => p.id && inScope(p, scope));
  if (patients.length === 0) return { ...empty, total };

  const observations = await searchAll<RumourObservation>(
    `${FHIR_BASE_URL}/Observation?${new URLSearchParams({
      subject: patients.map((p) => `Patient/${p.id}`).join(","),
      code: Object.values(FIELD_CODES).join(","),
      _count: String(OBSERVATION_PAGE_SIZE),
    })}`,
    token,
  );
  const bySubject = new Map<string, RumourObservation[]>();
  for (const o of observations) bySubject.set(subjectId(o), [...(bySubject.get(subjectId(o)) ?? []), o]);

  return {
    rumours: patients.map((p) => toReport(p, bySubject.get(p.id!) ?? [])),
    total,
    page,
    pageSize,
  };
}

export async function setRumourPriority(args: {
  patientId: string;
  priority: RumourPriority;
  scope: RumourScope | null;
  practitionerId?: string;
  token: string;
}): Promise<void> {
  const { patientId, priority, scope, practitionerId, token } = args;
  const res = await fetch(`${FHIR_BASE_URL}/Patient/${encodeURIComponent(patientId)}`, {
    headers: fhirHeaders(token),
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 410) throw new RumourNotFoundError(patientId);
  if (!res.ok) throw new Error(`Patient lookup failed (${res.status})`);

  const patient = (await res.json()) as RumourPatient;
  const encounterId = rumourEncounterId(patient);
  // Out-of-scope reports are reported as missing so their existence isn't leaked.
  if (!encounterId || !inScope(patient, scope)) throw new RumourNotFoundError(patientId);

  const now = new Date().toISOString();
  const observation = {
    resourceType: "Observation",
    status: "final",
    // Same coding shape as the mobile answers so the warehouse reads it the
    // same way (Observation.code.coding[0].code).
    code: {
      coding: [
        { system: "http://snomed.info/sct", code: RUMOUR_PRIORITY_CODE, display: "Rumour priority" },
      ],
      text: "Rumour priority",
    },
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
    effectiveDateTime: now,
    issued: now,
    valueString: priority,
    ...(practitionerId
      ? { performer: [{ reference: `Practitioner/${practitionerId}` }] }
      : {}),
  };

  const post = await fetch(`${FHIR_BASE_URL}/Observation`, {
    method: "POST",
    headers: { ...fhirHeaders(token), "Content-Type": "application/fhir+json" },
    body: JSON.stringify(observation),
  });
  if (!post.ok) {
    const body = await post.text().catch(() => "");
    throw new Error(`HAPI rejected priority (${post.status}): ${body.slice(0, 300)}`);
  }
}

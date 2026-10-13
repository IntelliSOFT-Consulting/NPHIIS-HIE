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
import { FHIR_BASE_URL, chunk, fhirHeaders, searchAll } from "./fhir-search";

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

const PATIENT_PAGE_SIZE = 100;
const SUBJECTS_PER_OBSERVATION_QUERY = 40;

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

export async function listRumours(
  token: string,
  scope: RumourScope | null,
): Promise<RumourReport[]> {
  const params = new URLSearchParams({
    identifier: `${RUMOUR_SYSTEM}|`,
    _sort: "-_lastUpdated",
    _count: String(PATIENT_PAGE_SIZE),
  });
  if (scope?.subCounty) params.set("address-state", scope.subCounty);
  else if (scope?.county) params.set("address-city", scope.county);

  const patients = (
    await searchAll<RumourPatient>(`${FHIR_BASE_URL}/Patient?${params}`, token)
  ).filter((p) => p.id && inScope(p, scope));
  if (patients.length === 0) return [];

  const codes = Object.values(FIELD_CODES).join(",");
  const observationsBySubject = new Map<string, RumourObservation[]>();
  for (const ids of chunk(patients.map((p) => p.id!), SUBJECTS_PER_OBSERVATION_QUERY)) {
    const query = new URLSearchParams({
      subject: ids.map((id) => `Patient/${id}`).join(","),
      code: codes,
      _count: "200",
    });
    const observations = await searchAll<RumourObservation>(
      `${FHIR_BASE_URL}/Observation?${query}`,
      token,
    );
    for (const o of observations) {
      const ref = o.subject?.reference ?? "";
      const list = observationsBySubject.get(ref) ?? [];
      list.push(o);
      observationsBySubject.set(ref, list);
    }
  }

  return patients
    .map((p) => toReport(p, observationsBySubject.get(`Patient/${p.id}`) ?? []))
    .sort((a, b) => (b.reportedAt ?? "").localeCompare(a.reportedAt ?? ""));
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

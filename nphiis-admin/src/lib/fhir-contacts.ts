// Server-side VHF contact tracing for the admin portal. The contact List and follow-up status
// come from hie-auth (/provider/contacts, one implementation shared with mobile); this module
// adds the people's details for the board, resolves places, checks for duplicates and writes
// contacts and follow ups to HAPI.

import { FHIR_BASE_URL, fhirHeaders, searchAll, chunk } from "./fhir-search";
import type { RumourScope } from "./fhir-rumours";
import type { ImportedContact } from "./contact-import";
import { personKey, phoneKey } from "./contact-import";
import type { UserProfile } from "./server-auth";
import {
  contactIds,
  FACILITY_TYPES,
  L,
  REPORTING_ROLES,
  VHF_CASE_SLUG,
  type ContactInput,
  type Facility,
  type FacilityType,
  type IndexCase,
  type ReportingSite,
  type TransactionBundle,
} from "./vhf-contacts";

const API_HOST = process.env.API_HOST ?? process.env.NEXT_PUBLIC_API_HOST ?? "";

/* ── hie-auth ──────────────────────────────────────────────────────────── */

export type ContactStatus = "active" | "flagged" | "completed" | "converted" | "lost" | "died";
export type DayState = "seen" | "symptomatic" | "missed" | "due" | "upcoming";

export interface HieContact {
  encounterId: string;
  patientId: string;
  /** <case EPID>-C001...; null until the case has an EPID. */
  contactId: string | null;
  /** Only once the contact is converted to a case. */
  epid: string | null;
  subCounty: string | null;
  caseType: string | null;
  exposureDate: string | null;
  dayZero: string;
  daysSinceExposure: number;
  lastDay: string;
  status: ContactStatus;
  monitoringStatus: string | null;
  dueToday: boolean;
  missedDays: number[];
  firstSymptomaticDay: number | null;
  days: Array<{ day: number; date: string; state: DayState }>;
}

export interface HieCaseList {
  indexCase: { encounterId: string; patientId: string | null; epid: string | null; caseId: string | null; caseType: string | null };
  list: { id: string; status: string; entry?: Array<{ item?: { reference?: string }; deleted?: boolean }> };
  contacts: HieContact[];
  /** Contacts taken off the list by a user (older hie-auth: absent). */
  removed?: HieContact[];
}

export class HieAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function hieAuth<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  if (!API_HOST) throw new HieAuthError("Auth backend (API_HOST) not configured", 502);
  const res = await fetch(`${API_HOST}/provider/contacts${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: "frontend_lang=en_US",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HieAuthError(body?.error ?? `hie-auth ${path} failed (${res.status})`, res.status);
  return body;
}

export const caseListById = (token: string, id: string) =>
  hieAuth<HieCaseList>(`/case?id=${encodeURIComponent(id)}`, token);

export interface ListChanges {
  /** Contact Encounters to take off the case's list. */
  remove?: string[];
  /** Contact Encounters taken off before, to put back. */
  restore?: string[];
}

export const refreshCaseList = (token: string, indexEncounterId: string, changes: ListChanges = {}) =>
  hieAuth<HieCaseList>(`/lists/${encodeURIComponent(indexEncounterId)}`, token, {
    method: "POST",
    body: JSON.stringify(changes),
  });

export const contactConverted = (token: string, encounterId: string, indexEncounterId?: string) =>
  hieAuth<{ promoted: { kind: string } }>(`/${encodeURIComponent(encounterId)}/converted`, token, {
    method: "POST",
    body: JSON.stringify(indexEncounterId ? { indexEncounterId } : {}),
  });

/* ── Board ─────────────────────────────────────────────────────────────── */

interface FhirPatient {
  id: string;
  name?: Array<{ family?: string; given?: string[] }>;
  gender?: string;
  telecom?: Array<{ value?: string }>;
  address?: Array<{ city?: string; state?: string }>;
  identifier?: Array<{ system?: string; value?: string }>;
}
interface FhirObservation {
  id: string;
  code?: { coding?: Array<{ code?: string }> };
  encounter?: { reference?: string };
  valueString?: string;
  issued?: string;
  meta?: { lastUpdated?: string };
}

export interface BoardContact extends HieContact {
  name: string;
  sex?: string;
  phone?: string;
  county?: string;
  relationship?: string;
}

export interface RemovedContact {
  encounterId: string;
  name: string;
  contactId: string | null;
  phone?: string;
  exposureDate: string | null;
}

export interface Board {
  indexCase: HieCaseList["indexCase"] & { name: string };
  listStatus: string;
  contacts: BoardContact[];
  /** Contacts taken off this case's list, which can be put back. */
  removed: RemovedContact[];
  /** Contacts living outside the viewer's area (counted, not shown). */
  outsideScope: number;
}

const sameName = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export function inContactScope(patient: FhirPatient | undefined, scope: RumourScope | null): boolean {
  if (!scope) return true;
  const address = patient?.address?.[0];
  if (scope.subCounty) return sameName(address?.state, scope.subCounty);
  return sameName(address?.city, scope.county);
}

function displayName(p?: FhirPatient): string {
  const n = p?.name?.[0];
  return [...(n?.given ?? []), n?.family].filter(Boolean).join(" ").trim() || "(no name)";
}

async function patientsById(ids: string[], token: string): Promise<Map<string, FhirPatient>> {
  const out = new Map<string, FhirPatient>();
  for (const part of chunk(Array.from(new Set(ids.filter(Boolean))), 50)) {
    const found = await searchAll<FhirPatient>(`${FHIR_BASE_URL}/Patient?_id=${part.join(",")}&_count=50`, token);
    for (const p of found) out.set(p.id, p);
  }
  return out;
}

/** Latest answer per contact Encounter for the given linkIds. */
async function latestAnswers(encounterIds: string[], codes: string[], token: string) {
  const out = new Map<string, Map<string, string>>();
  const seen = new Map<string, string>();
  for (const part of chunk(encounterIds, 40)) {
    const url = `${FHIR_BASE_URL}/Observation?encounter=${part.map((id) => `Encounter/${id}`).join(",")}&code=${codes.join(",")}&_count=500`;
    for (const o of await searchAll<FhirObservation>(url, token)) {
      const enc = o.encounter?.reference?.split("/")[1];
      const code = o.code?.coding?.[0]?.code;
      if (!enc || !code || o.valueString == null) continue;
      const t = o.meta?.lastUpdated ?? o.issued ?? "";
      const key = `${enc}|${code}`;
      if ((seen.get(key) ?? "") > t) continue;
      seen.set(key, t);
      if (!out.has(enc)) out.set(enc, new Map());
      out.get(enc)!.set(code, o.valueString);
    }
  }
  return out;
}

export async function buildBoard(list: HieCaseList, token: string, scope: RumourScope | null): Promise<Board> {
  const removed = list.removed ?? [];
  const patients = await patientsById(
    [list.indexCase.patientId ?? "", ...list.contacts.map((c) => c.patientId), ...removed.map((c) => c.patientId)],
    token,
  );
  const answers = await latestAnswers(list.contacts.map((c) => c.encounterId), [L.relationship], token);
  const visible = list.contacts.filter((c) => inContactScope(patients.get(c.patientId), scope));
  return {
    indexCase: { ...list.indexCase, name: displayName(patients.get(list.indexCase.patientId ?? "")) },
    listStatus: list.list?.status ?? "current",
    outsideScope: list.contacts.length - visible.length,
    contacts: visible.map((c) => {
      const p = patients.get(c.patientId);
      return {
        ...c,
        name: displayName(p),
        sex: p?.gender,
        phone: p?.telecom?.[0]?.value,
        county: p?.address?.[0]?.city,
        relationship: answers.get(c.encounterId)?.get(L.relationship),
      };
    }),
    removed: removed
      .filter((c) => inContactScope(patients.get(c.patientId), scope))
      .map((c) => {
        const p = patients.get(c.patientId);
        return { encounterId: c.encounterId, name: displayName(p), contactId: c.contactId, phone: p?.telecom?.[0]?.value, exposureDate: c.exposureDate };
      }),
  };
}

/* ── Places ────────────────────────────────────────────────────────────── */

interface FhirLocation {
  id: string;
  name?: string;
  partOf?: { reference?: string };
}

/** Letters and digits only, lower case: "Lang'ata " = "langata" (as mobile matches places). */
const placeKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const parentOf = (l: FhirLocation) => l.partOf?.reference?.split("/").pop() ?? "";

async function locationsNamed(name: string, token: string): Promise<FhirLocation[]> {
  const start = name.trim().match(/^[A-Za-z0-9]+/)?.[0] ?? name.trim();
  if (!start) return [];
  const found = await searchAll<FhirLocation>(`${FHIR_BASE_URL}/Location?name=${encodeURIComponent(start)}&_count=200`, token);
  return found.filter((l) => placeKey(l.name ?? "") === placeKey(name));
}

export interface ResolvedPlace {
  county?: Facility;
  subCounty?: Facility;
  problem?: string;
}

/**
 * County and sub-county Locations for a row's names. A sub-county given in the County column
 * is moved to the sub-county, as mobile does. Reminders go to the officers of the
 * sub-county, so a name that matches no Location is reported.
 */
export async function resolvePlace(countyName: string | undefined, subCountyName: string | undefined, token: string, cache: Map<string, FhirLocation[]>): Promise<ResolvedPlace> {
  const named = async (n: string) => {
    const k = placeKey(n);
    if (!cache.has(k)) cache.set(k, await locationsNamed(n, token));
    return cache.get(k)!;
  };
  const counties = countyName ? (await named(countyName)).filter((l) => parentOf(l) === "0") : [];
  let county = counties[0];
  let subCounty: FhirLocation | undefined;
  if (subCountyName) {
    const subs = (await named(subCountyName)).filter((l) => parentOf(l) !== "0");
    subCounty = subs.find((l) => !county || parentOf(l) === county.id) ?? subs[0];
  } else if (countyName && !county) {
    // "Embakasi East" in the County column: a sub-county.
    subCounty = (await named(countyName)).find((l) => parentOf(l) !== "0");
  }
  if (subCounty && !county) {
    const parentId = parentOf(subCounty);
    const res = await fetch(`${FHIR_BASE_URL}/Location/${parentId}`, { headers: fhirHeaders(token), cache: "no-store" });
    if (res.ok) county = (await res.json()) as FhirLocation;
  }
  const toFacility = (l?: FhirLocation): Facility | undefined => (l ? { id: l.id, name: l.name ?? l.id } : undefined);
  const problem =
    subCountyName && !subCounty
      ? `Sub-county "${subCountyName}" is not a known sub-county`
      : countyName && !county && !subCounty
        ? `County "${countyName}" is not a known county`
        : !subCounty
          ? "No sub-county: no follow-up reminders until one is added"
          : undefined;
  return { county: toFacility(county), subCounty: toFacility(subCounty), problem };
}

/* ── Reporting site ────────────────────────────────────────────────────── */

/** "Public" / "Private" / "Faith Based" when the facility Location says so (type or an extension). */
async function facilityTypeOf(facilityId: string, token: string): Promise<FacilityType | undefined> {
  const res = await fetch(`${FHIR_BASE_URL}/Location/${encodeURIComponent(facilityId)}`, { headers: fhirHeaders(token), cache: "no-store" });
  if (!res.ok) return undefined;
  const loc = (await res.json()) as {
    type?: Array<{ text?: string; coding?: Array<{ code?: string; display?: string }> }>;
    extension?: Array<{ valueString?: string; valueCoding?: { code?: string; display?: string }; valueCodeableConcept?: { text?: string } }>;
  };
  const words = [
    ...(loc.type ?? []).flatMap((t) => [t.text, ...(t.coding ?? []).flatMap((c) => [c.code, c.display])]),
    ...(loc.extension ?? []).flatMap((e) => [e.valueString, e.valueCoding?.code, e.valueCoding?.display, e.valueCodeableConcept?.text]),
  ].map((w) => placeKey(w ?? ""));
  return FACILITY_TYPES.find((t) => words.includes(placeKey(t)));
}

/** The logged-in user's reporting site, as mobile prefills the form from the user. */
export async function reportingSite(profile: UserProfile, token: string): Promise<ReportingSite> {
  const role = profile.roles.find((r) => REPORTING_ROLES.includes(r)) ?? profile.roles.find((r) => /^[A-Z][A-Z_]+$/.test(r));
  const info = profile.locationInfo;
  const place = (id?: string, name?: string): Facility | undefined => (id ? { id, name: name || id } : undefined);
  const facility = place(info?.facility, info?.facilityName);
  return {
    role,
    county: place(info?.county, info?.countyName),
    subCounty: place(info?.subCounty, info?.subCountyName),
    ward: place(info?.ward, info?.wardName),
    facility,
    facilityType: facility ? await facilityTypeOf(facility.id, token).catch(() => undefined) : undefined,
  };
}

/* ── Duplicates ────────────────────────────────────────────────────────── */

export interface ExistingContact {
  patientId: string;
  encounterId: string;
  name: string;
}

/** The records already created for these rows under this case (same derived ids). */
export async function alreadyUploaded(index: IndexCase, rows: ContactInput[], token: string): Promise<Set<string>> {
  const ids = rows.map((r) => contactIds(index, r).encounterId);
  const found = new Set<string>();
  for (const part of chunk(ids, 50)) {
    const encs = await searchAll<{ id: string }>(`${FHIR_BASE_URL}/Encounter?_id=${part.join(",")}&_elements=id&_count=50`, token);
    for (const e of encs) found.add(e.id);
  }
  return found;
}

/** A VHF record for the same person (ID number, or name and phone), from any case. */
export async function findSamePerson(row: ImportedContact, token: string): Promise<ExistingContact | null> {
  const queries: string[] = [];
  if (row.idNumber) queries.push(`identifier=${encodeURIComponent(row.idNumber)}`);
  if (row.phone) queries.push(`phone=${encodeURIComponent(row.phone)}`);
  const key = personKey(row);
  for (const q of queries) {
    const patients = await searchAll<FhirPatient>(`${FHIR_BASE_URL}/Patient?${q}&_count=20`, token);
    for (const p of patients) {
      const encounterId = p.identifier?.find((i) => i.system === VHF_CASE_SLUG)?.value;
      if (!encounterId) continue;
      const n = p.name?.[0];
      const candidate = {
        givenNames: (n?.given ?? []).join(" "),
        familyName: n?.family ?? "",
        phone: p.telecom?.[0]?.value,
        idNumber: row.idNumber ? p.identifier?.find((i) => i.value === row.idNumber)?.value : undefined,
      };
      const same = row.idNumber ? candidate.idNumber === row.idNumber : personKey(candidate) === key && phoneKey(candidate.phone) === phoneKey(row.phone);
      if (same) return { patientId: p.id, encounterId, name: displayName(p) };
    }
  }
  return null;
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function postTransaction(bundle: TransactionBundle, token: string): Promise<void> {
  const res = await fetch(`${FHIR_BASE_URL}/`, {
    method: "POST",
    headers: { ...fhirHeaders(token), "Content-Type": "application/fhir+json" },
    body: JSON.stringify(bundle),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HAPI rejected the transaction (${res.status}): ${text.slice(0, 300)}`);
  }
}

/** The contact's case Encounter and Patient ids, checked to be a VHF record. */
export async function contactRecord(encounterId: string, token: string): Promise<{ patientId: string; encounterId: string } | null> {
  const res = await fetch(`${FHIR_BASE_URL}/Encounter/${encodeURIComponent(encounterId)}`, { headers: fhirHeaders(token), cache: "no-store" });
  if (!res.ok) return null;
  const enc = (await res.json()) as { id: string; subject?: { reference?: string }; reasonCode?: Array<{ coding?: Array<{ code?: string }> }> };
  if (enc.reasonCode?.[0]?.coding?.[0]?.code !== "VHF Case Information") return null;
  const patientId = enc.subject?.reference?.split("/")[1];
  return patientId ? { patientId, encounterId: enc.id } : null;
}

/** The index case's disease answer as a vhf-disease code (ebola / marburg / other). */
export async function caseDisease(encounterId: string, token: string): Promise<string | undefined> {
  const answers = await latestAnswers([encounterId], [L.disease], token);
  const shown = answers.get(encounterId)?.get(L.disease)?.toLowerCase();
  if (!shown) return undefined;
  if (shown.includes("ebola")) return "ebola";
  if (shown.includes("marburg")) return "marburg";
  return "other";
}

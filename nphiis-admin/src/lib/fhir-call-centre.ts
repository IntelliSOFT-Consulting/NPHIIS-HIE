// 719 call logs (alert / rumour log) in HAPI. A log is saved the way the
// mobile app saves an "Alert Rumor Log" case (AddClientViewModel.kt, ALERT_LOG):
// a Patient carrying an identifier with CALL_LOG_SYSTEM (value = the Encounter
// id), the Encounter, the QuestionnaireResponse, and one Observation per answer
// coded by questionnaire linkId. Call logs get no EPID (hie-auth skips them);
// a log can instead be linked to an existing case, kept as an Observation
// (LINKED_CASE_CODE) whose value is the case's EPID and whose focus is the case.
//
// Call-centre agents work nationally, so nothing here is limited by area.

import {
  CALL_LOG_FIELDS as F,
  CALL_LOG_REASON,
  CALL_LOG_SYSTEM,
  EAT_OFFSET_MS,
  type CallLog,
  type CallLogPayload,
  type CallLogSummary,
  type CaseCandidate,
  type LinkedCase,
  LOCATION_ITEMS,
  callLogItems,
  callLogSections,
  choiceDisplay,
  cleanPayload,
} from "./call-centre";
import type { QuestionnaireItem } from "./questionnaires";
import { MULTI_VALUE_SEPARATOR } from "./questionnaires";
import { FHIR_BASE_URL, fhirHeaders, searchAll, searchPage } from "./fhir-search";

const SNOMED = "http://snomed.info/sct";
/** Observation linking a call log to an existing case. */
export const LINKED_CASE_CODE = "linked-case-epid";
/** Set by hie-auth on every call log (lib/alert-log-id.ts). */
export const ALERT_LOG_ID_SYSTEM = "http://hie.org/identifiers/ALERT_LOG_ID";
const EPID_SYSTEM = "http://hie.org/identifiers/EPID";
const SYSTEM_CREATION = "system-creation";
const CASE_INFORMATION = "case-information";
const OBSERVATION_PAGE_SIZE = 1000;

type Resource = Record<string, any>;

export class CallLogNotFoundError extends Error {
  constructor(patientId: string) {
    super(`Call log ${patientId} not found`);
    this.name = "CallLogNotFoundError";
  }
}

/* ── Values ─────────────────────────────────────────────────────────────── */

/** "2026-10-21T09:05" (the form, Kenya time) → "2026-10-21T09:05:00+03:00". */
export function toFhirDateTime(v: string): string {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(v)) return v;
  const withSeconds = /T\d\d:\d\d$/.test(v) ? `${v}:00` : v;
  return `${withSeconds}+03:00`;
}

/** A FHIR dateTime → the form's "yyyy-mm-ddThh:mm" in Kenya time. */
export function toFormDateTime(v: string): string {
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return v;
  return new Date(ms + EAT_OFFSET_MS).toISOString().slice(0, 16);
}

/** "09:05" → "09:05:00". */
function toFhirTime(v: string): string {
  return /^\d\d:\d\d$/.test(v) ? `${v}:00` : v;
}

/** "yyyy-MM-dd HH:mm:ss" in Kenya time, as the app's system-creation identifier holds it. */
function creationStamp(now: Date): string {
  return new Date(now.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

interface AnsweredItem {
  item: QuestionnaireItem;
  /** QuestionnaireResponse answers. */
  answers: Resource[];
  /** Text stored on the Observation (what the mobile app extracts from the answer). */
  text: string;
}

/** Answers in form order, each with its FHIR answer values and Observation text. */
export function answeredItems(payload: CallLogPayload): AnsweredItem[] {
  const out: AnsweredItem[] = [];
  for (const item of Array.from(callLogItems().values())) {
    const loc = payload.locations[item.linkId];
    if (loc) {
      out.push({
        item,
        answers: [{ valueReference: { reference: `Location/${loc.id}`, display: loc.name } }],
        text: loc.name,
      });
      continue;
    }
    const v = payload.answers[item.linkId]?.trim();
    if (!v) continue;
    switch (item.type) {
      case "choice": {
        const codes = item.repeats ? v.split(MULTI_VALUE_SEPARATOR).filter(Boolean) : [v];
        const answers = codes.map((code) => {
          const coding = item.answerOption?.find((opt) => opt.valueCoding?.code === code)?.valueCoding;
          return { valueCoding: coding ? { ...coding } : { code, display: code } };
        });
        out.push({ item, answers, text: choiceDisplay(item, v) });
        break;
      }
      case "integer":
        out.push({ item, answers: [{ valueInteger: Number.parseInt(v, 10) }], text: String(Number.parseInt(v, 10)) });
        break;
      case "dateTime": {
        const dt = toFhirDateTime(v);
        out.push({ item, answers: [{ valueDateTime: dt }], text: dt });
        break;
      }
      case "time": {
        const t = toFhirTime(v);
        out.push({ item, answers: [{ valueTime: t }], text: t });
        break;
      }
      default:
        out.push({ item, answers: [{ valueString: v }], text: v });
    }
  }
  return out;
}

/** QuestionnaireResponse items nested like the form; groups without answers are left out. */
function responseItems(answered: AnsweredItem[]): Resource[] {
  const byLinkId = new Map(answered.map((a) => [a.item.linkId, a]));
  const walk = (items: QuestionnaireItem[]): Resource[] => {
    const out: Resource[] = [];
    for (const it of items) {
      if (it.type === "group") {
        const children = walk(it.item ?? []);
        if (children.length) out.push({ linkId: it.linkId, ...(it.text ? { text: it.text } : {}), item: children });
        continue;
      }
      const a = byLinkId.get(it.linkId);
      if (a) out.push({ linkId: it.linkId, ...(it.text ? { text: it.text } : {}), answer: a.answers });
    }
    return out;
  };
  return walk(callLogSections());
}

/* ── Resources ──────────────────────────────────────────────────────────── */

/** No reporting facility is picked on a call log, so the managing location is the app's "unknown" one. */
function managingLocation(resource: string) {
  const url = `http://example.org/fhir/StructureDefinition/${resource}-managingLocation`;
  return {
    tag: { system: url, code: "Location/unknown", display: "Unknown Facility" },
    extension: { url, valueReference: { reference: "Location/unknown", display: "Unknown Facility" } },
  };
}

function stamped(resource: string, body: Resource): Resource {
  const loc = managingLocation(resource);
  return { ...body, meta: { tag: [loc.tag] }, extension: [loc.extension] };
}

function creationIdentifier(stamp: string) {
  return {
    system: SYSTEM_CREATION,
    value: stamp,
    type: {
      coding: [{ system: SYSTEM_CREATION, code: "system_creation", display: "System Creation" }],
      text: stamp,
    },
  };
}

function answerOf(payload: CallLogPayload, linkId: string): string | undefined {
  const v = payload.answers[linkId]?.trim();
  return v ? v : undefined;
}

/**
 * Name, sex, phone and address of the person the call is about (the caller,
 * when they call about themselves); family "Alert" when no name is known.
 */
export function personFields(payload: CallLogPayload): Pick<Resource, "name" | "gender" | "telecom" | "address"> {
  const self = answerOf(payload, F.callingAbout) === "self";
  const first = answerOf(payload, F.personName) ?? (self ? answerOf(payload, F.callerName) : undefined);
  const surname = answerOf(payload, F.personSurname);
  const name: Resource = {};
  if (surname) name.family = surname;
  if (first) name.given = [first];
  if (!surname && !first) name.family = "Alert";

  const sex = answerOf(payload, F.personSex);
  const mobile = answerOf(payload, F.personMobile) ?? (self ? answerOf(payload, F.callerMobile) : undefined);
  const county = payload.locations[F.county]?.name ?? "";
  const subCounty = payload.locations[F.subCounty]?.name ?? "";
  const address: Resource = {};
  const line: string[] = [];
  if (subCounty) {
    address.state = subCounty;
    line.push(subCounty);
  }
  if (county) {
    address.city = county;
    line.push(county);
  }
  if (line.length) address.line = line;

  return {
    name: [name],
    gender: sex ? (sex === "male" || sex === "female" ? sex : "unknown") : undefined,
    telecom: mobile ? [{ system: "phone", value: mobile, use: "mobile" }] : undefined,
    address: line.length ? [address] : undefined,
  };
}

function withPerson(patient: Resource, payload: CallLogPayload): Resource {
  const out: Resource = { ...patient };
  for (const [k, v] of Object.entries(personFields(payload))) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

function answerObservation(
  id: string,
  a: { linkId: string; display: string; text: string },
  refs: { patientId: string; encounterId: string; practitionerId?: string; issued: string },
): Resource {
  return stamped("observation", {
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [{ system: SNOMED, code: a.linkId, display: a.display }], text: a.text },
    valueString: a.text,
    subject: { reference: `Patient/${refs.patientId}` },
    encounter: { reference: `Encounter/${refs.encounterId}` },
    ...(refs.practitionerId ? { performer: [{ reference: `Practitioner/${refs.practitionerId}` }] } : {}),
    issued: refs.issued,
  });
}

function linkedCaseObservation(
  id: string,
  linked: LinkedCase,
  refs: { patientId: string; encounterId: string; practitionerId?: string; issued: string },
): Resource {
  const obs = answerObservation(id, { linkId: LINKED_CASE_CODE, display: "Linked case EPID", text: linked.epid }, refs);
  return { ...obs, focus: [{ reference: `Patient/${linked.patientId}`, ...(linked.name ? { display: linked.name } : {}) }] };
}

export interface BundleEntry {
  fullUrl?: string;
  resource?: Resource;
  request: { method: "PUT" | "DELETE"; url: string };
}

export interface TransactionBundle {
  resourceType: "Bundle";
  type: "transaction";
  entry: BundleEntry[];
}

const put = (resource: Resource): BundleEntry => ({
  fullUrl: `${resource.resourceType}/${resource.id}`,
  resource,
  request: { method: "PUT", url: `${resource.resourceType}/${resource.id}` },
});

export interface CreateContext {
  practitionerId?: string;
  now?: Date;
  newId?: () => string;
}

/** The transaction that saves a new call log. Ids are client-assigned (PUT), as the mobile sync does. */
export function buildCreateBundle(input: CallLogPayload, ctx: CreateContext = {}): TransactionBundle {
  const payload = cleanPayload(input);
  const now = ctx.now ?? new Date();
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const issued = now.toISOString();
  const stamp = creationStamp(now);
  const patientId = newId();
  const encounterId = newId();
  const responseId = newId();
  const practitioner = ctx.practitionerId ? { reference: `Practitioner/${ctx.practitionerId}` } : undefined;
  const answered = answeredItems(payload);

  const patient = withPerson(
    stamped("patient", {
      resourceType: "Patient",
      id: patientId,
      active: true,
      identifier: [
        creationIdentifier(stamp),
        {
          system: CALL_LOG_SYSTEM,
          value: encounterId,
          type: { coding: [{ system: CALL_LOG_SYSTEM, code: CALL_LOG_SYSTEM, display: CALL_LOG_SYSTEM }], text: encounterId },
        },
      ],
      ...(practitioner ? { generalPractitioner: [practitioner] } : {}),
    }),
    payload,
  );

  const encounter = stamped("encounter", {
    resourceType: "Encounter",
    id: encounterId,
    status: "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "FLD", display: "field" },
    subject: { reference: `Patient/${patientId}` },
    identifier: [creationIdentifier(stamp)],
    reasonCode: [
      { coding: [{ code: CALL_LOG_REASON }] },
      { coding: [{ system: CASE_INFORMATION, code: CASE_INFORMATION, display: CASE_INFORMATION }], text: CASE_INFORMATION },
    ],
    ...(practitioner ? { participant: [{ individual: practitioner }] } : {}),
  });

  const response = stamped("questionnaire", {
    resourceType: "QuestionnaireResponse",
    id: responseId,
    status: "completed",
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
    authored: issued,
    ...(practitioner ? { author: practitioner } : {}),
    item: responseItems(answered),
  });

  const refs = { patientId, encounterId, practitionerId: ctx.practitionerId, issued };
  const observations = [
    ...(payload.linkedCase ? [linkedCaseObservation(newId(), payload.linkedCase, refs)] : []),
    ...answered.map((a) =>
      answerObservation(newId(), { linkId: a.item.linkId, display: a.item.text ?? a.item.linkId, text: a.text }, refs),
    ),
  ];

  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [put(patient), put(encounter), put(response), ...observations.map(put)],
  };
}

/* ── Reading ────────────────────────────────────────────────────────────── */

async function getResource(path: string, token: string): Promise<Resource | null> {
  const res = await fetch(`${FHIR_BASE_URL}/${path}`, { headers: fhirHeaders(token), cache: "no-store" });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`FHIR read ${path} failed (${res.status})`);
  return (await res.json()) as Resource;
}

async function postTransaction(bundle: TransactionBundle, token: string): Promise<void> {
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

function callLogEncounterId(patient: Resource): string | undefined {
  return patient.identifier?.find((i: Resource) => i.system === CALL_LOG_SYSTEM)?.value;
}

function officialEpid(patient: Resource): string | undefined {
  const id = patient.identifier?.find(
    (i: Resource) =>
      i.use === "official" &&
      (i.system === EPID_SYSTEM || i.type?.coding?.some((c: Resource) => c.system === EPID_SYSTEM)),
  );
  return id?.value;
}

const obsCode = (o: Resource): string | undefined => o.code?.coding?.[0]?.code;
const obsValue = (o: Resource): string | undefined =>
  o.valueString ?? o.valueCodeableConcept?.text ?? o.valueCodeableConcept?.coding?.[0]?.display ?? o.valueDateTime;
const subjectId = (o: Resource): string => (o.subject?.reference ?? "").replace(/^Patient\//, "");

/** Latest Observation per code (by lastUpdated). */
function latestByCode(observations: Resource[]): Map<string, Resource> {
  const sorted = [...observations].sort((a, b) =>
    (a.meta?.lastUpdated ?? "").localeCompare(b.meta?.lastUpdated ?? ""),
  );
  const latest = new Map<string, Resource>();
  for (const o of sorted) {
    const code = obsCode(o);
    if (code) latest.set(code, o);
  }
  return latest;
}

const SUMMARY_CODES = [
  LINKED_CASE_CODE,
  F.date,
  F.agent,
  F.callerName,
  F.callerMobile,
  F.callingAbout,
  F.county,
  F.subCounty,
  F.pathway,
  F.symptoms,
  F.classification,
  F.routedAction,
  F.actionStatus,
];

export function toSummary(patient: Resource, observations: Resource[]): CallLogSummary {
  const latest = latestByCode(observations);
  const value = (code: string) => {
    const o = latest.get(code);
    return o ? obsValue(o) : undefined;
  };
  return {
    patientId: patient.id,
    logId: patient.identifier?.find((i: Resource) => i.system === ALERT_LOG_ID_SYSTEM)?.value,
    epid: value(LINKED_CASE_CODE),
    callDate: value(F.date) ?? patient.meta?.lastUpdated,
    agent: value(F.agent),
    callerName: value(F.callerName),
    callerMobile: value(F.callerMobile),
    callingAbout: value(F.callingAbout),
    county: value(F.county) ?? patient.address?.[0]?.city,
    subCounty: value(F.subCounty) ?? patient.address?.[0]?.state,
    pathway: value(F.pathway),
    symptoms: value(F.symptoms),
    classification: value(F.classification),
    routedAction: value(F.routedAction),
    actionStatus: value(F.actionStatus),
  };
}

/** Option codes for a choice answer saved as display text ("Fever, Vomiting"). Displays may contain commas. */
function codesFromDisplay(item: QuestionnaireItem, text: string): string[] {
  const options = (item.answerOption ?? [])
    .map((o) => o.valueCoding)
    .filter((c): c is { code: string; display: string } => Boolean(c))
    .sort((a, b) => b.display.length - a.display.length);
  let rest = text;
  const found: Array<{ code: string; at: number }> = [];
  for (const o of options) {
    const at = rest.indexOf(o.display);
    if (at >= 0) {
      found.push({ code: o.code, at });
      rest = rest.slice(0, at) + " ".repeat(o.display.length) + rest.slice(at + o.display.length);
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.code);
}

/** The form's answers from a QuestionnaireResponse. */
export function payloadFromResponse(response: Resource): CallLogPayload {
  const items = callLogItems();
  const payload: CallLogPayload = { answers: {}, locations: {} };
  const walk = (list: Resource[] = []) => {
    for (const ri of list) {
      walk(ri.item);
      const item = items.get(ri.linkId);
      const answers: Resource[] = ri.answer ?? [];
      if (!item || answers.length === 0) continue;
      const first = answers[0];
      if (first.valueReference) {
        payload.locations[item.linkId] = {
          id: String(first.valueReference.reference ?? "").replace(/^Location\//, ""),
          name: first.valueReference.display ?? "",
        };
      } else if (first.valueCoding) {
        payload.answers[item.linkId] = answers
          .map((a) => a.valueCoding?.code)
          .filter(Boolean)
          .join(MULTI_VALUE_SEPARATOR);
      } else if (first.valueDateTime !== undefined) {
        payload.answers[item.linkId] = toFormDateTime(first.valueDateTime);
      } else if (first.valueTime !== undefined) {
        payload.answers[item.linkId] = String(first.valueTime).slice(0, 5);
      } else {
        const v = first.valueString ?? first.valueInteger ?? first.valueDecimal ?? first.valueBoolean ?? first.valueDate;
        if (v !== undefined) payload.answers[item.linkId] = String(v);
      }
    }
  };
  walk(response.item);
  return payload;
}

/** The form's answers from the per-answer Observations, for logs whose response is missing. */
export function payloadFromObservations(observations: Resource[]): CallLogPayload {
  const items = callLogItems();
  const payload: CallLogPayload = { answers: {}, locations: {} };
  for (const [code, o] of Array.from(latestByCode(observations))) {
    const item = items.get(code);
    const text = obsValue(o);
    if (!item || !text) continue;
    if (LOCATION_ITEMS[code]) payload.locations[code] = { id: "", name: text };
    else if (item.type === "choice") payload.answers[code] = codesFromDisplay(item, text).join(MULTI_VALUE_SEPARATOR);
    else if (item.type === "dateTime") payload.answers[code] = toFormDateTime(text);
    else if (item.type === "time") payload.answers[code] = text.slice(0, 5);
    else payload.answers[code] = text;
  }
  return payload;
}

export interface LoadedCallLog {
  patient: Resource;
  encounter: Resource | null;
  encounterId: string;
  response: Resource | null;
  observations: Resource[];
}

async function loadCallLog(patientId: string, token: string): Promise<LoadedCallLog> {
  const patient = await getResource(`Patient/${encodeURIComponent(patientId)}`, token);
  const encounterId = patient ? callLogEncounterId(patient) : undefined;
  if (!patient || !encounterId || patient.active === false) throw new CallLogNotFoundError(patientId);
  const encRef = `Encounter/${encounterId}`;
  const [encounter, responses, observations] = await Promise.all([
    getResource(encRef, token),
    searchAll<Resource>(`${FHIR_BASE_URL}/QuestionnaireResponse?${new URLSearchParams({ encounter: encRef, _sort: "-_lastUpdated" })}`, token),
    searchAll<Resource>(
      `${FHIR_BASE_URL}/Observation?${new URLSearchParams({ encounter: encRef, _count: String(OBSERVATION_PAGE_SIZE) })}`,
      token,
    ),
  ]);
  return { patient, encounter, encounterId, response: responses[0] ?? null, observations };
}

/** The case a call log is linked to, from its latest link Observation. */
export function linkedCaseOf(observations: Resource[]): LinkedCase | null {
  const o = latestByCode(observations).get(LINKED_CASE_CODE);
  const epid = o ? obsValue(o) : undefined;
  const focus = o?.focus?.[0];
  const patientId = String(focus?.reference ?? "").replace(/^Patient\//, "");
  return o && epid && patientId ? { patientId, epid, ...(focus.display ? { name: focus.display } : {}) } : null;
}

export async function getCallLog(patientId: string, token: string): Promise<CallLog> {
  const log = await loadCallLog(patientId, token);
  const payload = log.response ? payloadFromResponse(log.response) : payloadFromObservations(log.observations);
  return { ...payload, linkedCase: linkedCaseOf(log.observations), summary: toSummary(log.patient, log.observations) };
}

/* ── Writing ────────────────────────────────────────────────────────────── */

export async function createCallLog(
  payload: CallLogPayload,
  ctx: { practitionerId?: string },
  token: string,
): Promise<string> {
  const bundle = buildCreateBundle(payload, ctx);
  await postTransaction(bundle, token);
  return bundle.entry[0].resource!.id as string;
}

/**
 * The transaction that saves an edited call log: the Patient's person fields,
 * the response, and the answer Observations (changed ones updated, new ones
 * added, cleared ones deleted), and the linked case (set, changed or removed).
 */
export function buildUpdateBundle(
  log: LoadedCallLog,
  input: CallLogPayload,
  ctx: CreateContext = {},
): TransactionBundle {
  const payload = cleanPayload(input);
  const now = ctx.now ?? new Date();
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const issued = now.toISOString();
  const answered = answeredItems(payload);
  const practitionerId = ctx.practitionerId;
  const entries: BundleEntry[] = [put(withPerson(log.patient, payload))];

  const response: Resource = log.response
    ? { ...log.response, status: "completed", item: responseItems(answered) }
    : stamped("questionnaire", {
        resourceType: "QuestionnaireResponse",
        id: newId(),
        status: "completed",
        subject: { reference: `Patient/${log.patient.id}` },
        encounter: { reference: `Encounter/${log.encounterId}` },
        authored: issued,
        ...(practitionerId ? { author: { reference: `Practitioner/${practitionerId}` } } : {}),
        item: responseItems(answered),
      });
  entries.push(put(response));

  const formCodes = new Set(callLogItems().keys());
  const existing = latestByCode(log.observations.filter((o) => formCodes.has(obsCode(o) ?? "")));
  const refs = { patientId: log.patient.id, encounterId: log.encounterId, practitionerId, issued };
  for (const a of answered) {
    const old = existing.get(a.item.linkId);
    existing.delete(a.item.linkId);
    if (old && obsValue(old) === a.text) continue;
    const display = a.item.text ?? a.item.linkId;
    const fresh = answerObservation(old?.id ?? newId(), { linkId: a.item.linkId, display, text: a.text }, refs);
    entries.push(put(old ? { ...old, code: fresh.code, valueString: a.text, issued, status: "final" } : fresh));
  }
  // Answers that were cleared, or whose question is no longer asked.
  for (const o of Array.from(existing.values())) {
    entries.push({ request: { method: "DELETE", url: `Observation/${o.id}` } });
  }

  const links = log.observations.filter((o) => obsCode(o) === LINKED_CASE_CODE);
  const current = linkedCaseOf(log.observations);
  const wanted = payload.linkedCase ?? null;
  const same = current && wanted && current.patientId === wanted.patientId && current.epid === wanted.epid;
  if (!same) {
    // One link at most: the latest is rewritten (or removed), any older ones removed.
    const keep = wanted ? latestByCode(links).get(LINKED_CASE_CODE) : undefined;
    for (const o of links) if (o !== keep) entries.push({ request: { method: "DELETE", url: `Observation/${o.id}` } });
    if (wanted) entries.push(put(linkedCaseObservation(keep?.id ?? newId(), wanted, refs)));
  }
  return { resourceType: "Bundle", type: "transaction", entry: entries };
}

export async function updateCallLog(
  patientId: string,
  payload: CallLogPayload,
  ctx: { practitionerId?: string },
  token: string,
): Promise<void> {
  const log = await loadCallLog(patientId, token);
  await postTransaction(buildUpdateBundle(log, payload, ctx), token);
}

/**
 * Removes a call log from the list. Nothing is erased: the Patient is made
 * inactive and the Encounter marked entered-in-error, so the record and its
 * history stay in HAPI.
 */
export async function deleteCallLog(patientId: string, token: string): Promise<void> {
  const log = await loadCallLog(patientId, token);
  const entries: BundleEntry[] = [put({ ...log.patient, active: false })];
  if (log.encounter) entries.push(put({ ...log.encounter, status: "entered-in-error" }));
  await postTransaction({ resourceType: "Bundle", type: "transaction", entry: entries }, token);
}

/* ── Listing ────────────────────────────────────────────────────────────── */

export interface CallLogQuery {
  page: number;
  pageSize: number;
  search?: string;
  /** Option codes of the call pathway / action status questions. */
  pathway?: string;
  status?: string;
}

export interface CallLogPage {
  logs: CallLogSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// Answers the search box looks in.
const SEARCH_CODES = [
  LINKED_CASE_CODE,
  F.callerName,
  F.callerMobile,
  F.personName,
  F.personSurname,
  F.personMobile,
  F.county,
  F.subCounty,
  F.village,
  F.location,
  F.agent,
  F.description,
];

async function idsMatching(term: string, token: string): Promise<Set<string>> {
  const [observations, byLogId] = await Promise.all([
    searchAll<Resource>(
      `${FHIR_BASE_URL}/Observation?${new URLSearchParams({
        code: SEARCH_CODES.join(","),
        "value-string:contains": term,
        _elements: "subject",
        _count: String(OBSERVATION_PAGE_SIZE),
      })}`,
      token,
    ),
    // The Alert Log ID lives on the Patient (exact match).
    searchAll<Resource>(
      `${FHIR_BASE_URL}/Patient?${new URLSearchParams({ identifier: `${ALERT_LOG_ID_SYSTEM}|${term.toUpperCase()}`, _elements: "id" })}`,
      token,
    ),
  ]);
  return new Set([...observations.map(subjectId), ...byLogId.map((p) => p.id as string)].filter(Boolean));
}

/** Logs whose current answer to `linkId` is the option `code`. */
async function idsAnswering(linkId: string, code: string, token: string): Promise<Set<string>> {
  const item = callLogItems().get(linkId);
  const display = item ? choiceDisplay(item, code) : code;
  const observations = await searchAll<Resource>(
    `${FHIR_BASE_URL}/Observation?${new URLSearchParams({
      code: linkId,
      _elements: "subject,valueString,meta",
      _count: String(OBSERVATION_PAGE_SIZE),
    })}`,
    token,
  );
  observations.sort((a, b) => (a.meta?.lastUpdated ?? "").localeCompare(b.meta?.lastUpdated ?? ""));
  const latest = new Map<string, string | undefined>();
  for (const o of observations) latest.set(subjectId(o), obsValue(o));
  return new Set(Array.from(latest).filter(([, v]) => v === display).map(([id]) => id));
}

function intersect(a: Set<string> | undefined, b: Set<string>): Set<string> {
  return a ? new Set(Array.from(b).filter((id) => a.has(id))) : b;
}

/** One page of call logs, newest first. Search and filters resolve to ids first. */
export async function listCallLogs(token: string, query: CallLogQuery): Promise<CallLogPage> {
  const { page, pageSize } = query;
  const empty: CallLogPage = { logs: [], total: 0, page, pageSize };

  const [matching, byPathway, byStatus] = await Promise.all([
    query.search ? idsMatching(query.search, token) : undefined,
    query.pathway ? idsAnswering(F.pathway, query.pathway, token) : undefined,
    query.status ? idsAnswering(F.actionStatus, query.status, token) : undefined,
  ]);
  let only: Set<string> | undefined;
  for (const s of [matching, byPathway, byStatus]) if (s) only = intersect(only, s);
  if (only && only.size === 0) return empty;

  const params = new URLSearchParams({
    identifier: `${CALL_LOG_SYSTEM}|`,
    "active:not": "false",
    _sort: "-_lastUpdated",
    _count: String(pageSize),
    _offset: String((page - 1) * pageSize),
    _total: "accurate",
  });
  if (only) params.set("_id", Array.from(only).join(","));

  const { resources, total } = await searchPage<Resource>("Patient", params, token);
  const patients = resources.filter((p) => p.id);
  if (patients.length === 0) return { ...empty, total };

  const observations = await searchAll<Resource>(
    `${FHIR_BASE_URL}/Observation?${new URLSearchParams({
      subject: patients.map((p) => `Patient/${p.id}`).join(","),
      code: SUMMARY_CODES.join(","),
      _count: String(OBSERVATION_PAGE_SIZE),
    })}`,
    token,
  );
  const bySubject = new Map<string, Resource[]>();
  for (const o of observations) bySubject.set(subjectId(o), [...(bySubject.get(subjectId(o)) ?? []), o]);

  return {
    logs: patients.map((p) => toSummary(p, bySubject.get(p.id) ?? [])),
    total,
    page,
    pageSize,
  };
}


/* ── Linking a case ─────────────────────────────────────────────────────── */

const CASE_SEARCH_LIMIT = 20;

function displayName(p: Resource): string {
  const n = p.name?.[0];
  return [...(n?.given ?? []), n?.family].filter(Boolean).join(" ") || n?.text || "Unnamed";
}

/** A Patient with an official EPID, as a case to link; null for anything else (call logs included). */
export function toCaseCandidate(p: Resource): CaseCandidate | null {
  const epid = officialEpid(p);
  if (!p?.id || !epid || callLogEncounterId(p)) return null;
  return {
    patientId: p.id,
    epid,
    name: displayName(p),
    phone: p.telecom?.[0]?.value,
    county: p.address?.[0]?.city,
    subCounty: p.address?.[0]?.state,
  };
}

/**
 * Cases (any disease) with an EPID, found by EPID, phone number or name. `query` is
 * what parseCaseQuery made of the typed text.
 */
export async function searchCases(
  query: { kind: "id"; value: string } | { kind: "phone"; variants: string[] } | { kind: "name"; terms: string[] },
  token: string,
): Promise<CaseCandidate[]> {
  const params = new URLSearchParams({ _count: String(CASE_SEARCH_LIMIT * 2) });
  if (query.kind === "id") params.set("identifier", query.value);
  else if (query.kind === "phone") params.set("phone", query.variants.join(","));
  else for (const t of query.terms) params.append("name", t);
  const res = await fetch(`${FHIR_BASE_URL}/Patient?${params}`, { headers: fhirHeaders(token), cache: "no-store" });
  if (!res.ok) throw new Error(`FHIR search failed (${res.status})`);
  const bundle = (await res.json()) as { entry?: Array<{ resource?: Resource }> };
  return (bundle.entry ?? [])
    .map((e) => (e.resource ? toCaseCandidate(e.resource) : null))
    .filter((c): c is CaseCandidate => !!c)
    .slice(0, CASE_SEARCH_LIMIT);
}

export class LinkedCaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedCaseError";
  }
}

/** The linked case as HAPI has it now: the Patient must exist and carry that EPID. */
export async function verifyLinkedCase(linked: LinkedCase, token: string): Promise<LinkedCase> {
  const patient = await getResource(`Patient/${encodeURIComponent(linked.patientId)}`, token);
  const found = patient ? toCaseCandidate(patient) : null;
  if (!found) throw new LinkedCaseError("The linked case was not found or has no EPID");
  if (found.epid !== linked.epid) throw new LinkedCaseError(`The linked case's EPID is now ${found.epid}; link it again`);
  return { patientId: found.patientId, epid: found.epid, name: found.name };
}

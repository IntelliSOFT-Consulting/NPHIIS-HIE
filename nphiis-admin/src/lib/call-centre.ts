// Client-safe types and form logic for the Call Centre module (the alert
// log, "alert-rumor-log.json"). The FHIR access lives in `fhir-call-centre.ts`
// (server-only).

import alertRumorLog from "@/questionnaires/alert-rumor-log.json";
import {
  type AnswerMap,
  type FhirQuestionnaire,
  type QuestionnaireItem,
  isHidden,
  isItemEnabled,
  labelFor,
  splitMultiValue,
} from "./questionnaires";

// Copied verbatim from the mobile app (nphiis/src/main/assets/alert-rumor-log.json on
// android-fhir jk-surveillance); keep them in sync so both save and read the same answers.
export const CALL_LOG_FORM = alertRumorLog as unknown as FhirQuestionnaire;

/** Encounter.reasonCode and the slug used as the Patient's case identifier system (mobile CaseTypes.ALERT_LOG). */
export const CALL_LOG_REASON = "Alert Rumor Log";
export const CALL_LOG_SYSTEM = "alert-rumor-log";

/** "Reporting site": filled from the user's profile on mobile; no variant applies to call-centre agents. */
const REPORTING_SITE_GROUP = "151479012557";

export const CALL_LOG_FIELDS = {
  date: "alert-date",
  source: "alert-source-type",
  callerName: "alert-reporter-name",
  callerMobile: "alert-reporter-mobile",
  county: "a4-county",
  subCounty: "a3-sub-county",
  ward: "a2-ward",
  village: "alert-village",
  personName: "873240407472",
  personSurname: "486402457213",
  personSex: "929966324957",
  personMobile: "alert-mobile",
  vitalStatus: "alert-vital-status",
  meetsDefinition: "alert-meets-case-definition",
  /** Free text on the form; the web picker fills it from the DHA Facility Registry. */
  facility: "alert-facility",
  description: "alert-description",
} as const;

/** Filled by the system, not typed: the date the alert was logged. */
export const AUTO_FIELDS: ReadonlySet<string> = new Set([CALL_LOG_FIELDS.date]);

/** The agent ID saved on a log: "Jane Wanjiku (12345678)", from the logged-in account. */
export function agentLabel(name?: string, username?: string): string | undefined {
  const n = name?.trim();
  const u = username?.trim();
  if (n && u && n !== u) return `${n} (${u})`;
  return n || u || undefined;
}

/** Location questions, each filtered by the one before it. */
export const LOCATION_ITEMS: Record<string, { level: "county" | "subcounty" | "ward"; parent?: string }> = {
  [CALL_LOG_FIELDS.county]: { level: "county" },
  [CALL_LOG_FIELDS.subCounty]: { level: "subcounty", parent: CALL_LOG_FIELDS.county },
  [CALL_LOG_FIELDS.ward]: { level: "ward", parent: CALL_LOG_FIELDS.subCounty },
};

export interface LocationAnswer {
  id: string;
  name: string;
}

/** An existing case a call log is linked to. Call logs get no EPID of their own; the case's EPID is shown. */
export interface LinkedCase {
  patientId: string;
  epid: string;
  name?: string;
}

/** A case found by the Call Centre case search. */
export interface CaseCandidate extends LinkedCase {
  phone?: string;
  county?: string;
  subCounty?: string;
}

/**
 * What the form sends: answers keyed by linkId (choice = option code, repeats joined by ";"),
 * picked locations, and the case the call is linked to (null or absent: none).
 */
export interface CallLogPayload {
  answers: AnswerMap;
  locations: Record<string, LocationAnswer>;
  linkedCase?: LinkedCase | null;
}

/** One row of the call log list. */
export interface CallLogSummary {
  patientId: string;
  /** The log's own ID (KEN-NAI-EME-2026-ALR-001), given by the server shortly after saving. */
  logId?: string;
  /** EPID of the linked case, if any. */
  epid?: string;
  callDate?: string;
  callerName?: string;
  callerMobile?: string;
  source?: string;
  patientName?: string;
  county?: string;
  subCounty?: string;
  vitalStatus?: string;
  meetsDefinition?: string;
}

export interface CallLog extends CallLogPayload {
  summary: CallLogSummary;
}

export const SOURCE_OPTIONS = optionsOf(CALL_LOG_FIELDS.source);
export const MEETS_DEFINITION_OPTIONS = optionsOf(CALL_LOG_FIELDS.meetsDefinition);

function optionsOf(linkId: string): Array<{ code: string; display: string }> {
  const item = findItem(CALL_LOG_FORM.item ?? [], linkId);
  return (item?.answerOption ?? [])
    .map((o) => o.valueCoding)
    .filter((c): c is { code: string; display: string } => Boolean(c));
}

function findItem(items: QuestionnaireItem[], linkId: string): QuestionnaireItem | undefined {
  for (const it of items) {
    if (it.linkId === linkId) return it;
    const found = findItem(it.item ?? [], linkId);
    if (found) return found;
  }
  return undefined;
}

/**
 * A section's heading without the form's "1."-style number. Sections that do not apply
 * are hidden, so the numbers would skip (1, then 6).
 */
export function sectionTitle(text: string): string {
  return text.replace(/^\s*\d+\.\s*/, "");
}

/** The form's sections (top-level groups), without the reporting-site group. */
export function callLogSections(): QuestionnaireItem[] {
  return (CALL_LOG_FORM.item ?? []).filter((it) => it.linkId !== REPORTING_SITE_GROUP);
}

/** Answer of a location question as the form keeps it in `answers`: the Location id. */
function withLocations(payload: CallLogPayload): AnswerMap {
  const out: AnswerMap = { ...payload.answers };
  for (const linkId of Object.keys(LOCATION_ITEMS)) {
    const loc = payload.locations[linkId];
    if (loc?.id) out[linkId] = loc.id;
    else delete out[linkId];
  }
  return out;
}

/**
 * Questions currently shown, in form order: enabled, not hidden, inside an
 * enabled group. Display items are included (they carry guidance text).
 */
export function visibleItems(answers: AnswerMap): QuestionnaireItem[] {
  const out: QuestionnaireItem[] = [];
  const walk = (items: QuestionnaireItem[]) => {
    for (const it of items) {
      if (isHidden(it) || !isItemEnabled(it, answers)) continue;
      if (it.type === "group") walk(it.item ?? []);
      else out.push(it);
    }
  };
  walk(callLogSections());
  return out;
}

/** True when a question is shown for these answers. */
export function isVisible(linkId: string, answers: AnswerMap): boolean {
  return visibleItems(answers).some((it) => it.linkId === linkId);
}

/** The payload with answers to questions that are no longer shown removed. */
export function cleanPayload(payload: CallLogPayload): CallLogPayload {
  let answers = withLocations(payload);
  // Clearing one answer can hide further questions, so repeat until stable.
  for (let i = 0; i < 5; i++) {
    const shown = new Set(visibleItems(answers).map((it) => it.linkId));
    const next: AnswerMap = {};
    for (const [k, v] of Object.entries(answers)) {
      if (shown.has(k) && v !== "") next[k] = v;
    }
    if (Object.keys(next).length === Object.keys(answers).length) break;
    answers = next;
  }
  const locations: Record<string, LocationAnswer> = {};
  for (const linkId of Object.keys(LOCATION_ITEMS)) {
    if (answers[linkId] && payload.locations[linkId]) locations[linkId] = payload.locations[linkId];
    delete answers[linkId];
  }
  return { answers, locations, linkedCase: payload.linkedCase ?? null };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Kenya has no daylight saving: East Africa Time is always UTC+3. */
export const EAT_OFFSET_MS = 3 * 3_600_000;

/** Milliseconds of a dateTime; "2026-10-21T10:15" (no offset, as the form keeps it) is Kenya time on any server. */
export function parseKenyaDateTime(v: string): number {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(v)) return Date.parse(v);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return Number.NaN;
  return Date.parse(`${v.length === 16 ? `${v}:00` : v}+03:00`);
}

/** Today's date as "yyyy-mm-dd" in Kenya. */
export function todayInKenya(): string {
  return new Date(Date.now() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Now as the form's "yyyy-mm-ddThh:mm" in Kenya time. */
export function nowInKenya(): string {
  return new Date(Date.now() + EAT_OFFSET_MS).toISOString().slice(0, 16);
}

/** The current time as "hh:mm" in Kenya. */
export function nowTimeInKenya(): string {
  return nowInKenya().slice(11, 16);
}

/** Problems with a payload, keyed by linkId. Empty when it can be saved. */
export function validateCallLog(payload: CallLogPayload): Record<string, string> {
  const answers = withLocations(payload);
  const errors: Record<string, string> = {};
  for (const it of visibleItems(answers)) {
    if (it.type === "display") continue;
    const v = (answers[it.linkId] ?? "").trim();
    if (!v) {
      if (it.required) errors[it.linkId] = `${labelFor(it)} is required`;
      continue;
    }
    if (it.type === "integer" && !/^\d+$/.test(v)) errors[it.linkId] = "Must be a whole number";
    if (it.type === "dateTime") {
      const ms = parseKenyaDateTime(v);
      if (Number.isNaN(ms)) errors[it.linkId] = "Enter a valid date and time";
      else if (ms > Date.now() + 5 * 60_000) errors[it.linkId] = "Cannot be in the future";
    }
    if (it.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) errors[it.linkId] = "Enter a valid date";
      else if (v > todayInKenya()) errors[it.linkId] = "Cannot be in the future";
    }
    if (it.type === "time" && !TIME_RE.test(v)) errors[it.linkId] = "Enter a valid time";
    if (it.type === "choice") {
      const codes = new Set((it.answerOption ?? []).map((o) => o.valueCoding?.code));
      const picked = it.repeats ? splitMultiValue(v) : [v];
      if (picked.some((c) => !codes.has(c))) errors[it.linkId] = "Select one of the options";
    }
  }
  return errors;
}

/** Display text of a choice answer (repeats joined by ", ", as the mobile app stores them). */
export function choiceDisplay(item: QuestionnaireItem, value: string): string {
  const codes = item.repeats ? splitMultiValue(value) : [value];
  return codes
    .map((code) => item.answerOption?.find((o) => o.valueCoding?.code === code)?.valueCoding?.display ?? code)
    .join(", ");
}

/** Every answerable item of the form (including hidden ones), by linkId. */
export function callLogItems(): Map<string, QuestionnaireItem> {
  const map = new Map<string, QuestionnaireItem>();
  const walk = (items: QuestionnaireItem[]) => {
    for (const it of items) {
      if (it.type !== "group" && it.type !== "display") map.set(it.linkId, it);
      walk(it.item ?? []);
    }
  };
  walk(callLogSections());
  return map;
}

/** The value shown to people for an answer: option display, location name, or the text itself. */
export function answerText(payload: CallLogPayload, linkId: string): string | undefined {
  const loc = payload.locations[linkId];
  if (loc) return loc.name;
  const v = payload.answers[linkId];
  if (!v) return undefined;
  const item = callLogItems().get(linkId);
  return item?.type === "choice" ? choiceDisplay(item, v) : v;
}

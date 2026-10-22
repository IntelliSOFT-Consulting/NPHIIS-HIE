import { observationValues } from "./nphl-lab";
import {
  VHF_CONTACT_LINK_IDS,
  VHF_FOLLOW_UP_LINK_IDS,
  VHF_FOLLOW_UP_WINDOW_DAYS,
  VHF_MONITORING_LINK_IDS,
  VHF_REASONS,
} from "./vhf-link-ids";

/**
 * A VHF contact's 21-day follow-up, worked out from what was captured: the contact's "Date of
 * contact" (day 0), its "VHF Contact Follow Up" child records and the latest "VHF Contact
 * Monitoring" status. Nothing is stored; it is recalculated on every read. The day rules follow
 * the mobile app (android-fhir VhfContactTracker.kt) so both show the same day and status.
 */

/**
 * "Type of case" as a lower-case code: mobile stores the choice's display ("Contact"), admin
 * may store the code ("contact"). Null when not answered.
 */
export function normalizeCaseType(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  return v ? v : null;
}

/**
 * Codes of the contact-status CodeSystem (List.entry.flag). "transferred" is only set on a
 * case's List: the contact was exposed again by a newer case and is followed up on that list.
 */
export type ContactStatus = "active" | "flagged" | "completed" | "converted" | "lost" | "died" | "transferred";

/** Consecutive missed days, up to yesterday, after which an open contact counts as lost. */
export const LOST_AFTER_CONSECUTIVE_MISSED = 3;

export type ContactVisit = {
  encounterId: string;
  day: number | null;
  date: string | null;
  symptomatic: boolean;
};

export type DayState = "seen" | "symptomatic" | "missed" | "due" | "upcoming";

export type ContactFollowUp = {
  encounterId: string;
  caseType: string | null;
  /** "Date of contact"; null when not captured. */
  exposureDate: string | null;
  /** Day 0: the date of contact, else the registration date. */
  dayZero: string;
  /**
   * Set when a newer case was linked after an earlier one: the day that link was recorded.
   * Follow-up starts again from it; earlier visits and monitoring records no longer count.
   */
  restartedOn: string | null;
  daysSinceExposure: number;
  lastDay: string;
  status: ContactStatus;
  /** Latest monitoring status as captured ("Lost to follow up"), when any. */
  monitoringStatus: string | null;
  dueToday: boolean;
  missedDays: number[];
  firstSymptomaticDay: number | null;
  days: Array<{ day: number; date: string; state: DayState }>;
};

export type ContactRecord = {
  encounterId: string;
  /** The contact's case-form Observations. */
  observations: any[];
  /** "yyyy-MM-dd" the record was created, used when the date of contact is missing. */
  registeredDate: string;
  /** Child Encounters (partOf the case Encounter), each with its Observations. */
  children: Array<{ encounter: any; observations: any[] }>;
};

const DAY_MS = 86_400_000;

function toDay(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (text.length < 10 || !/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  return text.slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function reasonOf(encounter: any): string {
  return String(encounter?.reasonCode?.[0]?.coding?.[0]?.code ?? "");
}

function createdAt(encounter: any): string {
  return (
    encounter?.identifier?.find((i: any) => i?.system === "system-creation")?.value ??
    encounter?.meta?.lastUpdated ??
    ""
  );
}

/** Monitoring status text ("Completed follow up (released)", "Became a suspected case", ...) as a status. */
export function monitoringToStatus(value: string | null | undefined): ContactStatus | null {
  const v = value?.trim().toLowerCase() ?? "";
  if (!v || v.includes("under")) return null;
  if (v.includes("complete")) return "completed";
  if (v.includes("case")) return "converted";
  if (v.includes("lost")) return "lost";
  if (v.includes("died") || v.includes("dead")) return "died";
  return null;
}

function capturedAt(o: any): string {
  return String(o?.issued ?? o?.effectiveDateTime ?? o?.meta?.lastUpdated ?? "");
}

const codeOf = (o: any): string => String(o?.code?.coding?.[0]?.code ?? "");

/** "Contact Link to Case" answers, oldest first. */
export function linkAnswersOf(observations: any[]): any[] {
  return observations
    .filter((o) => codeOf(o) === VHF_CONTACT_LINK_IDS.sourceCaseEpid)
    .sort((a, b) => capturedAt(a).localeCompare(capturedAt(b)));
}

function linkKeys(o: any): string[] {
  const focus = (o?.focus ?? []).map((f: any) => String(f?.reference ?? "")).filter((r: string) => r.startsWith("Encounter/"));
  // Mobile's picker stores "EPID  Name (Type)"; a typed answer is the EPID itself.
  const epid = String(o?.valueString ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  return [...focus, ...(epid ? [epid] : [])];
}

/** Whether two "Contact Link to Case" answers name the same case (same focus or same EPID). */
export function sameLinkedCase(a: any, b: any): boolean {
  const keys = new Set(linkKeys(a));
  return linkKeys(b).some((k) => keys.has(k));
}

/** The latest "Contact Link to Case" answer: the case now following the contact up. */
export function latestLinkOf(observations: any[]): any | null {
  return linkAnswersOf(observations).pop() ?? null;
}

/**
 * When the contact moved to a newer case: the first answer of the latest run of answers naming
 * the current case, if an answer naming another case came before it. Null if only one case.
 */
function restartLink(observations: any[]): any | null {
  const links = linkAnswersOf(observations);
  const current = links[links.length - 1];
  if (!current) return null;
  let i = links.length - 1;
  while (i > 0 && sameLinkedCase(links[i - 1], current)) i--;
  return i > 0 ? links[i] : null;
}

/** EAT date of a timestamp ("2026-10-01T22:00:00Z" is 2 October in Kenya); null if unreadable. */
function kenyaDayOf(timestamp: string): string | null {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? toDay(timestamp) : kenyaToday(new Date(ms));
}

/**
 * Date of contact for a follow-up that restarted: the latest answer captured with or after the
 * newer link (a minute's slack: they come from one form save), else the day of that link.
 */
function restartDayZero(observations: any[], link: any, linkDay: string): string {
  const linkMs = Date.parse(capturedAt(link));
  const answers = observations
    .filter((o) => codeOf(o) === VHF_CONTACT_LINK_IDS.contactDate)
    .filter((o) => {
      const ms = Date.parse(capturedAt(o));
      if (Number.isNaN(ms) || Number.isNaN(linkMs)) return (kenyaDayOf(capturedAt(o)) ?? "") >= linkDay;
      return ms >= linkMs - 60_000;
    });
  return toDay(observationValues(answers).get(VHF_CONTACT_LINK_IDS.contactDate)) ?? linkDay;
}

/** Visits recorded on the "VHF Contact Follow Up" child records. */
export function visitsOf(record: ContactRecord, exposureDate: string | null): ContactVisit[] {
  return record.children
    .filter((c) => reasonOf(c.encounter) === VHF_REASONS.followUp || hasDay(c.observations))
    .filter((c) => reasonOf(c.encounter) !== VHF_REASONS.monitoring)
    .map((c) => {
      const answers = observationValues(c.observations);
      const date = toDay(answers.get(VHF_FOLLOW_UP_LINK_IDS.date));
      const entered = Number.parseInt(answers.get(VHF_FOLLOW_UP_LINK_IDS.day) ?? "", 10);
      // As on mobile: the follow-up date decides the day when the date of contact is known.
      const day = date && exposureDate ? daysBetween(exposureDate, date) : Number.isNaN(entered) ? null : entered;
      return {
        encounterId: String(c.encounter?.id ?? ""),
        day,
        date,
        symptomatic: (answers.get(VHF_FOLLOW_UP_LINK_IDS.symptomatic) ?? "").trim().toLowerCase() === "yes",
      };
    });
}

/** Day a visit's record was created, for visits that have no follow-up date. */
function createdOn(record: ContactRecord, visit: ContactVisit): string {
  const child = record.children.find((c) => String(c.encounter?.id ?? "") === visit.encounterId);
  return createdAt(child?.encounter).slice(0, 10);
}

/** Follow-ups are found by their "Day of follow up" answer too, whatever reason the record has. */
function hasDay(observations: any[]): boolean {
  return observations.some((o) => o?.code?.coding?.[0]?.code === VHF_FOLLOW_UP_LINK_IDS.day);
}

function latestMonitoringStatus(record: ContactRecord, since: string | null = null): string | null {
  const latest = record.children
    .filter((c) => reasonOf(c.encounter) === VHF_REASONS.monitoring)
    .filter((c) => !since || createdAt(c.encounter).slice(0, 10) >= since)
    .sort((a, b) => createdAt(a.encounter).localeCompare(createdAt(b.encounter)))
    .pop();
  return latest ? observationValues(latest.observations).get(VHF_MONITORING_LINK_IDS.status) ?? null : null;
}

export function contactFollowUp(record: ContactRecord, today: string): ContactFollowUp {
  const window = VHF_FOLLOW_UP_WINDOW_DAYS;
  const answers = observationValues(record.observations);
  const caseType = normalizeCaseType(answers.get(VHF_CONTACT_LINK_IDS.caseType));
  const restart = restartLink(record.observations);
  const restartedOn = restart ? kenyaDayOf(capturedAt(restart)) ?? today : null;
  // Moved to a newer case: day 0 is the date of contact given with that link, else the link's day.
  const exposureDate = restartedOn
    ? restartDayZero(record.observations, restart, restartedOn)
    : toDay(answers.get(VHF_CONTACT_LINK_IDS.contactDate));
  const dayZero = exposureDate ?? record.registeredDate;
  const daysSinceExposure = daysBetween(dayZero, today);
  const visits = visitsOf(record, exposureDate).filter(
    (v) => !restartedOn || (v.day != null && v.day >= 1 && (v.date ? v.date >= dayZero : createdOn(record, v) >= restartedOn)),
  );
  const recorded = new Map<number, ContactVisit>();
  for (const v of visits) {
    if (v.day == null) continue;
    const prev = recorded.get(v.day);
    if (!prev || v.symptomatic) recorded.set(v.day, v);
  }
  const monitoringStatus = latestMonitoringStatus(record, restartedOn);
  const closedAs = monitoringToStatus(monitoringStatus);

  const missedDays: number[] = [];
  for (let d = 1; d <= Math.min(daysSinceExposure - 1, window); d++) if (!recorded.has(d)) missedDays.push(d);
  const firstSymptomaticDay =
    visits.filter((v) => v.symptomatic && v.day != null).map((v) => v.day as number).sort((a, b) => a - b)[0] ?? null;
  const windowComplete = daysSinceExposure > window || (daysSinceExposure === window && recorded.has(window));

  let trailingMissed = 0;
  for (let d = Math.min(daysSinceExposure - 1, window); d >= 1 && !recorded.has(d); d--) trailingMissed++;

  const status: ContactStatus =
    caseType && caseType !== "contact"
      ? "converted"
      : closedAs ??
        (firstSymptomaticDay != null
          ? "flagged"
          : windowComplete
            ? "completed"
            : trailingMissed >= LOST_AFTER_CONSECUTIVE_MISSED
              ? "lost"
              : "active");

  const open = status === "active" || status === "lost";
  const dueToday =
    caseType === "contact" && open && daysSinceExposure >= 1 && daysSinceExposure <= window && !recorded.has(daysSinceExposure);

  const days = Array.from({ length: window }, (_, i) => {
    const day = i + 1;
    const visit = recorded.get(day);
    const state: DayState = visit
      ? visit.symptomatic
        ? "symptomatic"
        : "seen"
      : day < daysSinceExposure
        ? "missed"
        : day === daysSinceExposure
          ? "due"
          : "upcoming";
    return { day, date: addDays(dayZero, day), state };
  });

  return {
    encounterId: record.encounterId,
    caseType,
    exposureDate,
    dayZero,
    restartedOn,
    daysSinceExposure,
    lastDay: addDays(dayZero, window),
    status,
    monitoringStatus,
    dueToday,
    missedDays,
    firstSymptomaticDay,
    days,
  };
}

/** Today in Kenya (EAT, UTC+3) as yyyy-MM-dd. */
export function kenyaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

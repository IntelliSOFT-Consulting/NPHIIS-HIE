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

/** Codes of the contact-status CodeSystem (List.entry.flag). */
export type ContactStatus = "active" | "flagged" | "completed" | "converted" | "lost" | "died";

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

/** Follow-ups are found by their "Day of follow up" answer too, whatever reason the record has. */
function hasDay(observations: any[]): boolean {
  return observations.some((o) => o?.code?.coding?.[0]?.code === VHF_FOLLOW_UP_LINK_IDS.day);
}

function latestMonitoringStatus(record: ContactRecord): string | null {
  const latest = record.children
    .filter((c) => reasonOf(c.encounter) === VHF_REASONS.monitoring)
    .sort((a, b) => createdAt(a.encounter).localeCompare(createdAt(b.encounter)))
    .pop();
  return latest ? observationValues(latest.observations).get(VHF_MONITORING_LINK_IDS.status) ?? null : null;
}

export function contactFollowUp(record: ContactRecord, today: string): ContactFollowUp {
  const window = VHF_FOLLOW_UP_WINDOW_DAYS;
  const answers = observationValues(record.observations);
  const caseType = normalizeCaseType(answers.get(VHF_CONTACT_LINK_IDS.caseType));
  const exposureDate = toDay(answers.get(VHF_CONTACT_LINK_IDS.contactDate));
  const dayZero = exposureDate ?? record.registeredDate;
  const daysSinceExposure = daysBetween(dayZero, today);
  const visits = visitsOf(record, exposureDate);
  const recorded = new Map<number, ContactVisit>();
  for (const v of visits) {
    if (v.day == null) continue;
    const prev = recorded.get(v.day);
    if (!prev || v.symptomatic) recorded.set(v.day, v);
  }
  const monitoringStatus = latestMonitoringStatus(record);
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

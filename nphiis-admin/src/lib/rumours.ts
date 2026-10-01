// Client-safe types and constants for rumour triage. The FHIR access lives in
// `fhir-rumours.ts` (server-only).

export const RUMOUR_PRIORITIES = ["High", "Medium", "Low"] as const;
export type RumourPriority = (typeof RUMOUR_PRIORITIES)[number];

export function isRumourPriority(value: unknown): value is RumourPriority {
  return RUMOUR_PRIORITIES.includes(value as RumourPriority);
}

export interface RumourReport {
  patientId: string;
  epid?: string;
  reportedAt?: string;
  county?: string;
  subCounty?: string;
  ward?: string;
  village?: string;
  reporterCadre?: string;
  agency?: string;
  harmfulPractice?: string;
  rumour?: string;
  source?: string;
  investigated?: string;
  investigationResult?: string;
  conclusion?: string;
  priority?: RumourPriority;
  prioritySetAt?: string;
}

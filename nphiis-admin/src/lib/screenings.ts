// Client-safe types for screened people. The FHIR access lives in
// `fhir-screenings.ts` (server-only).

import type { SpecimenStatus } from './specimens';

export const SCREENING_OUTCOMES = ['cleared', 'referred', 'suspected'] as const;
export type ScreeningOutcome = (typeof SCREENING_OUTCOMES)[number];

export const SCREENING_OUTCOME_LABEL: Record<ScreeningOutcome, string> = {
  cleared: 'Cleared',
  referred: 'Referred',
  suspected: 'Suspected',
};

export function isScreeningOutcome(value: unknown): value is ScreeningOutcome {
  return SCREENING_OUTCOMES.includes(value as ScreeningOutcome);
}

/** How far a screened person has gone: screened only, a VHF case, specimen at NPHL, result back. */
export const FOLLOW_UP_STAGES = ['screened', 'case', 'specimen', 'result'] as const;
export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number];

export const FOLLOW_UP_LABEL: Record<FollowUpStage, string> = {
  screened: 'Screened only',
  case: 'VHF case',
  specimen: 'Specimen at NPHL',
  result: 'Lab result',
};

export const SCREENING_TYPES = ['entry', 'exit'] as const;
export type ScreeningType = (typeof SCREENING_TYPES)[number];

export const SCREENING_TYPE_LABEL: Record<ScreeningType, string> = {
  entry: 'Entry',
  exit: 'Exit',
};

export interface Trip {
  country: string;
  city?: string;
  departureDate?: string;
  arrivalDate?: string;
  purpose?: string;
}

export interface Screening {
  id: string;
  screenedAt?: string;
  /** Responses saved before exit screening have no tag and are entry. */
  screeningType: ScreeningType;
  outcome?: ScreeningOutcome;
  pointOfEntry?: string;
  pointOfEntryType?: string;
  temperatureCelsius?: number;
  /** Symptoms answered "present", with onset date when given. */
  symptoms: Array<{ code: string; onsetDate?: string; note?: string }>;
  hasTravelled?: boolean;
  trips: Trip[];
}

export interface ScreenedSpecimen {
  specimenId: string;
  label: string;
  status?: SpecimenStatus;
  statusText?: string;
  result?: string;
  submittedAt?: string;
}

export interface ScreenedPerson {
  patientId: string;
  screeningNumbers: string[];
  name?: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  nationality?: string;
  county?: string;
  subCounty?: string;
  /** Travel documents and IDs, e.g. "Passport 40350008". */
  identifiers: string[];
  /** Newest first. Empty when the person was screened on the mobile app only. */
  screenings: Screening[];
  epid?: string;
  specimens: ScreenedSpecimen[];
  stage: FollowUpStage;
  lastActivity?: string;
}

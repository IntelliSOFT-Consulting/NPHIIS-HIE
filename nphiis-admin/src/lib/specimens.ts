// Client-safe types for specimens submitted to NPHL. The FHIR access lives in
// `fhir-specimens.ts` (server-only).

/** Task.businessStatus codes written by hie-auth (nphl-lab.ts). */
export const SPECIMEN_STATUSES = [
  'awaiting-epid',
  'submission-failed',
  'awaiting-result',
  'preliminary-result',
  'final-result',
  'specimen-rejected',
] as const;
export type SpecimenStatus = (typeof SPECIMEN_STATUSES)[number];

export const SPECIMEN_STATUS_LABEL: Record<SpecimenStatus, string> = {
  'awaiting-epid': 'Awaiting EPID',
  'submission-failed': 'Submission failed',
  'awaiting-result': 'Awaiting result',
  'preliminary-result': 'Preliminary result',
  'final-result': 'Final result',
  'specimen-rejected': 'Rejected',
};

export function isSpecimenStatus(value: unknown): value is SpecimenStatus {
  return SPECIMEN_STATUSES.includes(value as SpecimenStatus);
}

export interface LabTest {
  name: string;
  result: string;
}

export interface SubmittedSpecimen {
  taskId: string;
  specimenId: string;
  /** Tube label NPHL matches results on; the FHIR id when mobile sent none. */
  label: string;
  labelIsFhirId: boolean;
  epid?: string;
  patientName?: string;
  county?: string;
  subCounty?: string;
  facility?: string;
  sampleType?: string;
  collectedAt?: string;
  submittedAt?: string;
  updatedAt?: string;
  status?: SpecimenStatus;
  statusText?: string;
  /** Why the Task is on hold, failed, or rejected. */
  statusReason?: string;
  result?: string;
  resultType?: 'Final' | 'Preliminary';
  resultDate?: string;
  testingLab?: string;
  tests: LabTest[];
  rejectedBy?: string;
  rejectedOn?: string;
}

export type PullSource =
  | { cases: number; errors: number }
  | { rows: number; open: number; updates: number; matched: number }
  | { error: string }
  | { busy: true }
  | { skipped: string };

/** One line on what a pull did, from hie-auth's POST /lab/pull response. */
export function describePull(body: { nphl?: PullSource; staging?: PullSource }): {
  ok: boolean;
  message: string;
} {
  const parts: string[] = [];
  let ok = true;
  const { nphl, staging } = body;
  if (nphl && 'cases' in nphl) {
    parts.push(`Checked ${nphl.cases} open case${nphl.cases === 1 ? '' : 's'} with NPHL`);
    if (nphl.errors) {
      ok = false;
      parts.push(`${nphl.errors} could not be sent (see each row's status)`);
    }
  } else if (nphl && 'busy' in nphl) {
    parts.push('An NPHL pull is already running');
  }
  if (staging && 'matched' in staging) {
    parts.push(`${staging.matched} result${staging.matched === 1 ? '' : 's'} from the lab staging API`);
  } else if (staging && 'error' in staging) {
    ok = false;
    parts.push(`Lab staging API failed: ${staging.error}`);
  } else if (staging && 'busy' in staging) {
    parts.push('A lab staging pull is already running');
  }
  if (!parts.length) return { ok: false, message: 'No NPHL result source is configured.' };
  return { ok, message: `${parts.join('; ')}.` };
}

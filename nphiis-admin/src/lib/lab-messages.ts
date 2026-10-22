// Lab results entered in the portal, as the messages the lab system sends to
// hie-auth's POST /lab/results (docs/deployment.md, "Lab results endpoint").
// The single-entry form and the CSV upload both build these, and hie-auth runs
// them through the same parser and workflow as the lab system's.

import Papa from 'papaparse';

export const UPDATE_KINDS = ['received', 'in-testing', 'result', 'rejected', 'note'] as const;
export type UpdateKind = (typeof UPDATE_KINDS)[number];

export const UPDATE_KIND_LABEL: Record<UpdateKind, string> = {
  received: 'Received at lab',
  'in-testing': 'Testing started',
  result: 'Result',
  rejected: 'Rejected',
  note: 'Note',
};

export const TEST_RESULTS = ['Positive', 'Negative'] as const;
export type TestResult = (typeof TEST_RESULTS)[number];

export interface TestEntry {
  name: string;
  result: string;
}

export interface SpecimenUpdate {
  /** The specimen's tube label (its Task identifier), as the lab system sends it. */
  specimenId: string;
  kind: UpdateKind;
  /** yyyy-mm-dd. */
  date?: string;
  laboratory?: string;
  /** The lab's accession number for the specimen. */
  labNumber?: string;
  resultType?: 'Preliminary' | 'Final';
  tests?: TestEntry[];
  rejectionReason?: string;
  note?: string;
}

export type LabMessage = Record<string, string>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-mm-dd from yyyy-mm-dd or d/m/yyyy; null when it is neither. */
export function normaliseDate(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (ISO_DATE.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

function normaliseResult(raw: string): TestResult | null {
  const v = raw.trim().toLowerCase();
  return TEST_RESULTS.find((r) => r.toLowerCase() === v) ?? null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** What is missing or wrong in an update, or null when it can be sent. */
export function validateUpdate(u: SpecimenUpdate): string | null {
  if (!u.specimenId.trim()) return 'Specimen ID is required';
  if (!UPDATE_KINDS.includes(u.kind)) return `Unknown update "${u.kind}"`;
  if (u.date !== undefined && u.date !== '') {
    if (!ISO_DATE.test(u.date)) return 'Date must be yyyy-mm-dd or dd/mm/yyyy';
    if (u.date > today()) return 'Date cannot be in the future';
  }
  if ((u.kind === 'received' || u.kind === 'result') && !u.date) {
    return u.kind === 'received' ? 'Date received is required' : 'Result date is required';
  }
  if (u.kind === 'result') {
    if (!u.resultType) return 'Choose Preliminary or Final';
    const tests = u.tests ?? [];
    if (!tests.length) return 'Add at least one test result';
    for (const t of tests) {
      if (!t.name.trim()) return 'Every test needs a name';
      if (!normaliseResult(t.result)) return `Result for ${t.name} must be Positive or Negative`;
    }
  }
  if (u.kind === 'rejected' && !u.rejectionReason?.trim()) return 'Rejection reason is required';
  if (u.kind === 'note' && !u.note?.trim()) return 'Note text is required';
  return null;
}

function compact(m: Record<string, string | undefined>): LabMessage {
  return Object.fromEntries(
    Object.entries(m).filter((e): e is [string, string] => !!e[1]?.trim()).map(([k, v]) => [k, v.trim()]),
  );
}

/** The lab API messages for one update; a result is one line-list row per test. */
export function messagesFor(u: SpecimenUpdate): LabMessage[] {
  const common = { specimenIdentifier: u.specimenId, caseIdentifier: u.labNumber };
  switch (u.kind) {
    case 'received':
    case 'in-testing':
      return [compact({ messageType: u.kind, ...common, date: u.date, laboratory: u.laboratory })];
    case 'rejected':
      return [
        compact({
          messageType: 'rejected',
          ...common,
          rejection_reason: u.rejectionReason,
          date_rejected: u.date,
          testingLabName: u.laboratory,
        }),
      ];
    case 'note':
      return [compact({ messageType: 'note', specimenIdentifier: u.specimenId, text: u.note, date: u.date, laboratory: u.laboratory })];
    case 'result':
      return (u.tests ?? []).map((t) =>
        compact({
          messageType: 'result',
          ...common,
          testName: t.name,
          conclusion: normaliseResult(t.result) ?? t.result,
          resultType: u.resultType,
          effectiveDateTime: u.date,
          testingLabName: u.laboratory,
        }),
      );
  }
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

/** Columns the upload reads; a result row carries one test. */
export const CSV_COLUMNS = [
  'Specimen ID',
  'Update',
  'Date',
  'Laboratory',
  'Lab Number',
  'Result Type',
  'Test',
  'Result',
  'Rejection Reason',
  'Note',
] as const;

/** For identifying each specimen only: the upload ignores these. */
export const CSV_REFERENCE_COLUMNS = ['EPID', 'Patient Name', 'Sample Type', 'Collected', 'Status'] as const;

const UPDATE_ALIASES: Record<string, UpdateKind> = {
  received: 'received',
  'received at lab': 'received',
  'in-testing': 'in-testing',
  'in testing': 'in-testing',
  testing: 'in-testing',
  'testing started': 'in-testing',
  result: 'result',
  rejected: 'rejected',
  rejection: 'rejected',
  note: 'note',
};

export interface CsvRowUpdate {
  /** 1-based, counting the header row, as a spreadsheet shows it. */
  row: number;
  update: SpecimenUpdate;
}

export interface CsvRowProblem {
  row: number;
  specimenId: string;
  error: string;
}

function cell(row: Record<string, string>, column: string): string {
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === column.toLowerCase());
  return (key ? row[key] : '')?.trim() ?? '';
}

/**
 * Reads uploaded rows. A row with no Update is a template row left blank and is
 * skipped; one that cannot be sent is a problem, with its row number.
 */
export function updatesFromCsvRows(rows: Array<Record<string, string>>): {
  updates: CsvRowUpdate[];
  problems: CsvRowProblem[];
  skipped: number;
} {
  const updates: CsvRowUpdate[] = [];
  const problems: CsvRowProblem[] = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    const row = i + 2;
    const specimenId = cell(r, 'Specimen ID');
    const rawKind = cell(r, 'Update');
    if (!rawKind) {
      skipped++;
      return;
    }
    const kind = UPDATE_ALIASES[rawKind.toLowerCase()];
    if (!kind) {
      problems.push({ row, specimenId, error: `Unknown update "${rawKind}"; use ${UPDATE_KINDS.join(', ')}` });
      return;
    }
    const rawDate = cell(r, 'Date');
    const date = normaliseDate(rawDate);
    const rawType = cell(r, 'Result Type').toLowerCase();
    const update: SpecimenUpdate = {
      specimenId,
      kind,
      date: date ?? (rawDate ? rawDate : undefined),
      laboratory: cell(r, 'Laboratory') || undefined,
      labNumber: cell(r, 'Lab Number') || undefined,
      resultType: rawType === 'final' ? 'Final' : rawType === 'preliminary' ? 'Preliminary' : undefined,
      tests: kind === 'result' ? [{ name: cell(r, 'Test'), result: cell(r, 'Result') }] : undefined,
      rejectionReason: cell(r, 'Rejection Reason') || undefined,
      note: cell(r, 'Note') || undefined,
    };
    const error = validateUpdate(update);
    if (error) problems.push({ row, specimenId, error });
    else updates.push({ row, update });
  });
  return { updates, problems, skipped };
}

export interface TemplateSpecimen {
  label: string;
  epid?: string;
  patientName?: string;
  sampleType?: string;
  collectedAt?: string;
  statusText?: string;
}

export function specimenTemplateCsv(specimens: TemplateSpecimen[]): string {
  const fields = [CSV_COLUMNS[0], ...CSV_REFERENCE_COLUMNS, ...CSV_COLUMNS.slice(1)];
  const blank = CSV_COLUMNS.slice(1).map(() => '');
  return (
    Papa.unparse({
      fields,
      data: specimens.map((s) => [
        s.label,
        s.epid ?? '',
        s.patientName ?? '',
        s.sampleType ?? '',
        s.collectedAt?.slice(0, 10) ?? '',
        s.statusText ?? '',
        ...blank,
      ]),
    }) + '\n'
  );
}

/* ── hie-auth's response ─────────────────────────────────────────────────── */

export interface UpdateOutcome {
  specimenId: string;
  kind?: string;
  matched: boolean;
  status?: string;
  businessStatus?: string;
  error?: string;
}

export interface UpdatesResponse {
  received: number;
  results: UpdateOutcome[];
  invalid: Array<{ index: number; specimenId?: string; error: string }>;
}

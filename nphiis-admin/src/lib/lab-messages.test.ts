import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import {
  messagesFor,
  normaliseDate,
  specimenTemplateCsv,
  updatesFromCsvRows,
  validateUpdate,
  type SpecimenUpdate,
} from './lab-messages';

const base: SpecimenUpdate = { specimenId: 'TUBE-1', kind: 'received', date: '2026-10-15' };

describe('validateUpdate', () => {
  it('needs a date for a receipt and a result', () => {
    expect(validateUpdate({ ...base, date: undefined })).toMatch(/Date received/);
    expect(validateUpdate({ ...base, kind: 'in-testing', date: undefined })).toBeNull();
  });

  it('refuses a future date', () => {
    expect(validateUpdate({ ...base, date: '2999-01-01' })).toMatch(/future/);
  });

  it('needs a result type and Positive/Negative tests for a result', () => {
    const result: SpecimenUpdate = { ...base, kind: 'result', tests: [{ name: 'PCR', result: 'Positive' }] };
    expect(validateUpdate(result)).toMatch(/Preliminary or Final/);
    expect(validateUpdate({ ...result, resultType: 'Final' })).toBeNull();
    expect(validateUpdate({ ...result, resultType: 'Final', tests: [{ name: 'PCR', result: 'Pending' }] })).toMatch(
      /Positive or Negative/,
    );
    expect(validateUpdate({ ...result, resultType: 'Final', tests: [] })).toMatch(/at least one test/);
  });

  it('needs a reason for a rejection and text for a note', () => {
    expect(validateUpdate({ ...base, kind: 'rejected' })).toMatch(/reason/);
    expect(validateUpdate({ ...base, kind: 'note' })).toMatch(/Note text/);
  });
});

describe('messagesFor', () => {
  it('sends a result as one line-list row per test, as the lab system does', () => {
    expect(
      messagesFor({
        specimenId: 'TUBE-1',
        kind: 'result',
        date: '2026-10-15',
        laboratory: 'NVRL',
        labNumber: 'NVRL/1051/26',
        resultType: 'Preliminary',
        tests: [
          { name: 'PCR', result: 'negative' },
          { name: 'ELISA', result: 'Positive' },
        ],
      }),
    ).toEqual([
      {
        messageType: 'result',
        specimenIdentifier: 'TUBE-1',
        caseIdentifier: 'NVRL/1051/26',
        testName: 'PCR',
        conclusion: 'Negative',
        resultType: 'Preliminary',
        effectiveDateTime: '2026-10-15',
        testingLabName: 'NVRL',
      },
      expect.objectContaining({ testName: 'ELISA', conclusion: 'Positive' }),
    ]);
  });

  it('sends progress, rejections and notes with only the fields given', () => {
    expect(messagesFor(base)).toEqual([{ messageType: 'received', specimenIdentifier: 'TUBE-1', date: '2026-10-15' }]);
    expect(messagesFor({ ...base, kind: 'rejected', rejectionReason: 'Haemolysed', laboratory: 'NVRL' })).toEqual([
      {
        messageType: 'rejected',
        specimenIdentifier: 'TUBE-1',
        rejection_reason: 'Haemolysed',
        date_rejected: '2026-10-15',
        testingLabName: 'NVRL',
      },
    ]);
    expect(messagesFor({ specimenId: 'TUBE-1', kind: 'note', note: ' Repeat sample ' })).toEqual([
      { messageType: 'note', specimenIdentifier: 'TUBE-1', text: 'Repeat sample' },
    ]);
  });
});

describe('normaliseDate', () => {
  it('reads ISO and d/m/yyyy dates', () => {
    expect(normaliseDate('2026-10-15')).toBe('2026-10-15');
    expect(normaliseDate('5/9/2026')).toBe('2026-09-05');
    expect(normaliseDate('Oct 5')).toBeNull();
    expect(normaliseDate('')).toBeNull();
  });
});

describe('CSV', () => {
  it('reads the template back: blank rows skipped, bad rows reported with their row number', () => {
    const csv = specimenTemplateCsv([{ label: 'TUBE-1', epid: 'KEN-1', patientName: 'A B', collectedAt: '2026-10-10T08:00:00Z' }]);
    const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
    expect(rows[0]).toMatchObject({ 'Specimen ID': 'TUBE-1', EPID: 'KEN-1', Collected: '2026-10-10', Update: '' });

    const filled = [
      ...rows,
      { 'Specimen ID': 'TUBE-1', Update: 'Received', Date: '15/10/2026' },
      { 'Specimen ID': 'TUBE-1', Update: 'result', Date: '2026-10-16', 'Result Type': 'final', Test: 'PCR', Result: 'Negative' },
      { 'Specimen ID': 'TUBE-2', Update: 'result', Date: '2026-10-16', Test: 'PCR', Result: 'Negative' },
      { 'Specimen ID': 'TUBE-3', Update: 'shipped' },
    ];
    const { updates, problems, skipped } = updatesFromCsvRows(filled);
    expect(skipped).toBe(1);
    expect(updates.map((u) => [u.row, u.update.kind, u.update.date])).toEqual([
      [3, 'received', '2026-10-15'],
      [4, 'result', '2026-10-16'],
    ]);
    expect(updates[1].update).toMatchObject({ resultType: 'Final', tests: [{ name: 'PCR', result: 'Negative' }] });
    expect(problems).toEqual([
      { row: 5, specimenId: 'TUBE-2', error: 'Choose Preliminary or Final' },
      { row: 6, specimenId: 'TUBE-3', error: expect.stringMatching(/Unknown update "shipped"/) },
    ]);
  });

  it('matches column names regardless of case and spacing', () => {
    const { updates } = updatesFromCsvRows([{ ' specimen id ': 'TUBE-1', UPDATE: 'in testing' }]);
    expect(updates[0].update).toMatchObject({ specimenId: 'TUBE-1', kind: 'in-testing' });
  });
});

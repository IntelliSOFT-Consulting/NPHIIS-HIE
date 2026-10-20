'use client';

import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { useAuthedFetch } from '@/lib/auth-context';
import {
  FIELD_LABELS,
  FOLLOW_UP_WINDOW_DAYS,
  missingRequired,
  parseLineList,
  TEMPLATE_HEADERS,
  TEMPLATE_INSTRUCTIONS,
  type ColumnMapping,
  type ParsedSheet,
  type TargetField,
} from '@/lib/contact-import';
import type { Board } from '@/lib/fhir-contacts';
import type { UploadAction, UploadRowResult } from '@/app/api/contacts/upload/route';
import { Alert } from '../ui/Alert';
import { Select } from '../ui/Field';

type Table = unknown[][];

const ACTION: Record<UploadAction, { label: string; chip: string }> = {
  create: { label: 'New contact', chip: 'bg-emerald-100 text-emerald-800' },
  'link-existing': { label: 'Already registered: add to this case', chip: 'bg-nphi-50 text-nphi-800' },
  exists: { label: 'Already on this list', chip: 'bg-gray-200 text-gray-700' },
  skip: { label: 'Skipped', chip: 'bg-accent-50 text-accent-700' },
};

const FIELD_OPTIONS = [
  ...(Object.keys(FIELD_LABELS) as TargetField[])
    .filter((f) => f !== 'day')
    .map((f) => ({ value: f, label: FIELD_LABELS[f] })),
  ...Array.from({ length: FOLLOW_UP_WINDOW_DAYS }, (_, i) => ({ value: `day:${i + 1}`, label: `Follow-up day ${i + 1}` })),
];

const optionOf = (c: ColumnMapping) => (c.field === 'day' ? `day:${c.day}` : c.field);

/** Downloads the blank MoH line list as .xlsx: a Contacts sheet (first, so an upload of the
 *  filled-in file reads it) and an Instructions sheet. */
async function saveExcelTemplate() {
  const XLSX = await import('xlsx');
  const contacts = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]]);
  contacts['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: /^Day \d+$/.test(h) ? 6 : Math.min(Math.max(h.length + 2, 10), 32) }));
  const instructions = XLSX.utils.aoa_to_sheet(TEMPLATE_INSTRUCTIONS.map((row) => [...row]));
  instructions['!cols'] = [{ wch: 24 }, { wch: 110 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, contacts, 'Contacts');
  XLSX.utils.book_append_sheet(book, instructions, 'Instructions');
  XLSX.writeFile(book, 'vhf-contact-line-list.xlsx', { compression: true });
}

/** Downloads the blank MoH line list as .csv (header row only; the Excel one has the instructions). */
function saveCsvTemplate() {
  const blob = new Blob([`\uFEFF${Papa.unparse([[...TEMPLATE_HEADERS]])}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vhf-contact-line-list.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function readTable(file: File): Promise<{ sheets: string[]; tables: Record<string, Table> }> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const parsed = Papa.parse<unknown[]>(text, { skipEmptyLines: false });
    return { sheets: ['CSV'], tables: { CSV: parsed.data } };
  }
  const XLSX = await import('xlsx');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const tables: Record<string, Table> = {};
  for (const name of book.SheetNames) {
    tables[name] = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: true, defval: '' });
  }
  return { sheets: book.SheetNames, tables };
}

export default function ContactUploadWizard({
  indexEncounterId,
  caseLabel,
  onSaved,
}: {
  indexEncounterId: string;
  caseLabel: string;
  onSaved: (board: Board) => void;
}) {
  const authedFetch = useAuthedFetch();
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<Record<string, Table>>({});
  const [sheetName, setSheetName] = useState('');
  const [columns, setColumns] = useState<ColumnMapping[] | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [results, setResults] = useState<UploadRowResult[] | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'checking' | 'saving'>('');
  const [error, setError] = useState<string | null>(null);

  const table = tables[sheetName];
  const sheet: ParsedSheet | null = useMemo(
    () => (table ? parseLineList(table, columns ?? undefined) : null),
    [table, columns],
  );
  const importable = useMemo(
    () => (sheet?.rows ?? []).filter((r) => r.errors.length === 0 && !r.duplicateOfRow),
    [sheet],
  );
  const resultByRow = useMemo(() => new Map((results ?? []).map((r) => [r.rowNumber, r])), [results]);
  const missing = sheet ? missingRequired(sheet.columns) : [];
  const toSave = (results ?? []).filter((r) => r.action === 'create' || r.action === 'link-existing').length;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy('reading');
    setError(null);
    setResults(null);
    setColumns(null);
    try {
      const read = await readTable(file);
      setFileName(file.name);
      setTables(read.tables);
      // The first sheet with rows.
      setSheetName(read.sheets.find((s) => (read.tables[s]?.length ?? 0) > 1) ?? read.sheets[0]);
    } catch (e) {
      setError(`Could not read ${file.name}: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const send = async (commit: boolean) => {
    setBusy(commit ? 'saving' : 'checking');
    setError(null);
    try {
      const res = await authedFetch('/api/contacts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indexEncounterId, commit, rows: importable.map((r) => r.contact) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setResults(body.results as UploadRowResult[]);
      if (commit) {
        const failed = (body.results as UploadRowResult[]).filter((r) => r.error);
        if (failed.length) setError(`${failed.length} row(s) could not be saved: ${failed[0].error}`);
        else onSaved(body.board as Board);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const setColumn = (index: number, value: string) => {
    const base = columns ?? sheet?.columns ?? [];
    setResults(null);
    setColumns(
      base.map((c) =>
        c.index !== index
          ? c
          : value.startsWith('day:')
            ? { ...c, field: 'day', day: Number(value.slice(4)) }
            : { ...c, field: value as TargetField, day: undefined },
      ),
    );
  };

  return (
    <div className="card p-5 space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p className="font-semibold text-nphi-900">Upload contacts of {caseLabel}</p>
          <p className="text-sm text-gray-600">
            The MoH contact line list (.xlsx or .csv). Columns are matched automatically; every row becomes a contact of this case,
            followed up for 21 days from its date of exposure. Day columns coded 1 / 2 are saved as follow ups.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm whitespace-nowrap" onClick={() => void saveExcelTemplate()}>
            Download Excel template
          </button>
          <button type="button" className="btn-secondary text-sm whitespace-nowrap" onClick={saveCsvTemplate}>
            Download CSV template
          </button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <label className="btn-primary cursor-pointer w-fit">
          {busy === 'reading' ? 'Reading…' : fileName ? 'Choose another file' : 'Choose file'}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {fileName && <span className="text-sm text-gray-600">{fileName}</span>}
        {Object.keys(tables).length > 1 && (
          <div className="sm:w-56">
            <Select
              value={sheetName}
              onChange={(v) => {
                setSheetName(v);
                setColumns(null);
                setResults(null);
              }}
              options={Object.keys(tables).map((s) => ({ value: s, label: `Sheet: ${s}` }))}
            />
          </div>
        )}
      </div>

      {sheet && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <span className="font-semibold">{sheet.rows.length}</span> rows read (header on row {sheet.headerRow + 1})
            </span>
            <span>
              <span className="font-semibold">{importable.length}</span> ready
            </span>
            <span>
              Days: <span className="font-semibold">{sheet.columns.filter((c) => c.field === 'day').length}</span> columns
            </span>
            <button type="button" className="text-nphi-700 underline" onClick={() => setShowMapping((s) => !s)}>
              {showMapping ? 'Hide column matching' : 'Check column matching (optional)'}
            </button>
          </div>

          {missing.length > 0 && (
            <Alert variant="warning">No column was matched to {missing.join(', ')}. Open column matching and pick it.</Alert>
          )}

          {showMapping && (
            <div className="overflow-x-auto border border-nphi-100 rounded-lg">
              <table className="min-w-full text-sm divide-y divide-nphi-100">
                <thead className="bg-gray-50/80">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium text-gray-600">Sheet column</th>
                    <th className="px-3 py-2 font-medium text-gray-600">First value</th>
                    <th className="px-3 py-2 font-medium text-gray-600 w-72">Saved as</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nphi-100">
                  {sheet.columns.map((c) => (
                    <tr key={c.index}>
                      <td className="px-3 py-2 text-gray-800">{c.header || <span className="text-gray-400">(blank, column {c.index + 1})</span>}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-xs truncate">
                        {String((table?.[sheet.headerRow + 1] ?? [])[c.index] ?? '') || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Select value={optionOf(c)} onChange={(v) => setColumn(c.index, v)} options={FIELD_OPTIONS} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-gray-500">
                &quot;Keep as a note&quot; saves the value with the contact (e.g. quarantine facility, comorbidities). &quot;Days post
                exposure&quot; and &quot;Days in quarantine&quot; are worked out, not imported.
              </p>
            </div>
          )}

          <div className="overflow-x-auto border border-nphi-100 rounded-lg max-h-[28rem]">
            <table className="min-w-full text-sm divide-y divide-nphi-100">
              <thead className="bg-gray-50/80 sticky top-0">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium text-gray-600">Row</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Name</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Phone</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Date of contact</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Residence</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Follow ups</th>
                  <th className="px-3 py-2 font-medium text-gray-600">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nphi-100">
                {sheet.rows.map((r) => {
                  const server = resultByRow.get(r.rowNumber);
                  const c = r.contact;
                  const problems = [...r.errors, ...r.warnings, ...(server?.problems ?? [])];
                  return (
                    <tr key={r.rowNumber} className="align-top">
                      <td className="px-3 py-2 text-gray-500">{r.rowNumber}</td>
                      <td className="px-3 py-2 text-gray-900">{`${c.givenNames} ${c.givenNames === c.familyName ? '' : c.familyName}`.trim() || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{c.phone ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{c.contactDate ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {server?.residence ?? ([c.subCountyName, c.countyName].filter(Boolean).join(', ') || '—')}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {c.followUps?.length
                          ? `${c.followUps.length} day(s)${c.followUps.some((f) => f.symptomatic) ? ', symptomatic' : ''}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.errors.length ? (
                          <span className={`chip ${ACTION.skip.chip}`}>Not imported</span>
                        ) : r.duplicateOfRow ? (
                          <span className={`chip ${ACTION.exists.chip}`}>Same person as row {r.duplicateOfRow}</span>
                        ) : server ? (
                          <span className={`chip ${ACTION[server.action].chip}`}>
                            {server.saved ? 'Saved' : ACTION[server.action].label}
                            {server.existingName ? ` (${server.existingName})` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Not checked</span>
                        )}
                        {(problems.length > 0 || server?.error) && (
                          <ul className="mt-1 space-y-0.5 text-[11px] text-amber-800">
                            {problems.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                            {server?.error && <li className="text-accent-700">{server.error}</li>}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              className="btn-secondary"
              disabled={!!busy || importable.length === 0 || missing.length > 0}
              onClick={() => send(false)}
            >
              {busy === 'checking' ? 'Checking…' : 'Check rows'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!!busy || !results || toSave === 0}
              onClick={() => send(true)}
            >
              {busy === 'saving' ? 'Saving…' : `Save ${toSave} contact${toSave === 1 ? '' : 's'}`}
            </button>
            {!results && importable.length > 0 && (
              <span className="text-xs text-gray-500">Check rows first: places are matched and duplicates found on the server.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import {
  FIELD_LABELS,
  FOLLOW_UP_WINDOW_DAYS,
  missingRequired,
  parseLineList,
  TEMPLATE_HEADERS,
  TEMPLATE_INSTRUCTIONS,
  type ColumnMapping,
  type ImportedContact,
  type TargetField,
} from '@/lib/contact-import';
import { buildDrafts, draftKey, draftName, HAND_ROW_BASE, savable, type Draft } from '@/lib/contact-drafts';
import type { Board } from '@/lib/fhir-contacts';
import type { UploadAction, UploadRowResult } from '@/app/api/contacts/upload/route';
import { Alert } from '../ui/Alert';
import { Select } from '../ui/Field';
import Spinner from '../ui/Spinner';
import ContactForm from './ContactForm';

type Table = unknown[][];
type SaveAction = Extract<UploadAction, 'create' | 'link-existing' | 'restore' | 'update'>;
const SAVE_ACTIONS: UploadAction[] = ['create', 'link-existing', 'restore', 'update'];
const isSaveState = (s: RowState) => s === 'checking' || SAVE_ACTIONS.includes(s as UploadAction);

export interface SaveSummary {
  created: number;
  linked: number;
  restored: number;
  updated: number;
}

/* ── Templates and files ────────────────────────────────────────────────── */

/** The blank MoH line list as .xlsx: a Contacts sheet (first, so an upload of the filled-in file reads it) and an Instructions sheet. */
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

/** The blank line list as .csv (header row only; the Excel one has the instructions). */
function saveCsvTemplate() {
  const blob = new Blob([`﻿${Papa.unparse([[...TEMPLATE_HEADERS]])}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vhf-contact-line-list.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function readTable(file: File): Promise<{ sheets: string[]; tables: Record<string, Table> }> {
  if (/\.csv$/i.test(file.name)) {
    const parsed = Papa.parse<unknown[]>(await file.text(), { skipEmptyLines: false });
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

const FIELD_OPTIONS = [
  ...(Object.keys(FIELD_LABELS) as TargetField[]).filter((f) => f !== 'day').map((f) => ({ value: f, label: FIELD_LABELS[f] })),
  ...Array.from({ length: FOLLOW_UP_WINDOW_DAYS }, (_, i) => ({ value: `day:${i + 1}`, label: `Follow-up day ${i + 1}` })),
];
const optionOf = (c: ColumnMapping) => (c.field === 'day' ? `day:${c.day}` : c.field);

/* ── Row status ─────────────────────────────────────────────────────────── */

type RowState = 'fix' | 'duplicate' | 'on-list' | 'checking' | 'left-out' | SaveAction;

const STATE: Record<RowState, { label: string; chip: string }> = {
  fix: { label: 'Needs fixing', chip: 'bg-accent-50 text-accent-700' },
  duplicate: { label: 'Repeated', chip: 'bg-gray-200 text-gray-700' },
  'on-list': { label: 'Already on this list, nothing new', chip: 'bg-gray-200 text-gray-700' },
  checking: { label: 'Checking…', chip: 'bg-gray-100 text-gray-500' },
  'left-out': { label: 'Left out', chip: 'bg-gray-100 text-gray-500' },
  create: { label: 'New contact', chip: 'bg-emerald-100 text-emerald-800' },
  'link-existing': { label: 'Registered already: will be linked', chip: 'bg-nphi-50 text-nphi-800' },
  restore: { label: 'Taken off before: will be put back', chip: 'bg-purple-100 text-purple-800' },
  update: { label: 'On this list: will be updated', chip: 'bg-amber-100 text-amber-800' },
};

type Filter = 'all' | 'ready' | 'attention' | 'left-out';

function Stepper({ step }: { step: 1 | 2 }) {
  const items = ['Add contacts', 'Review and save'];
  return (
    <ol className="flex items-center gap-3 text-sm" aria-label="Steps">
      {items.map((label, i) => {
        const n = i + 1;
        const current = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className="h-px w-6 bg-gray-300" aria-hidden />}
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                current ? 'bg-nphi-700 text-white' : done ? 'bg-nphi-100 text-nphi-800' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {n}
            </span>
            <span className={current ? 'font-medium text-nphi-900' : 'text-gray-500'}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Adding contacts to a case in two steps: (1) upload a line list or enter contacts by hand,
 * (2) review the list (fix, edit, leave out or add rows) while each row is checked on the
 * server, then save. Nothing is written before Save.
 */
export default function AddContacts({
  indexEncounterId,
  caseLabel,
  startWith,
  onSaved,
  onClose,
}: {
  indexEncounterId: string;
  caseLabel: string;
  startWith: 'file' | 'hand';
  onSaved: (board: Board, summary: SaveSummary) => void;
  onClose: () => void;
}) {
  const authedFetch = useAuthedFetch();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [step, setStep] = useState<1 | 2>(startWith === 'hand' ? 2 : 1);

  // Source: a file and/or contacts entered by hand, plus edits.
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<Record<string, Table>>({});
  const [sheetName, setSheetName] = useState('');
  const [columns, setColumns] = useState<ColumnMapping[] | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [hand, setHand] = useState<ImportedContact[]>([]);
  const nextHand = useRef(HAND_ROW_BASE + 1);
  const [edits, setEdits] = useState<Map<number, ImportedContact>>(new Map());
  const [leftOut, setLeftOut] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<null | { rowNumber: number; initial?: ImportedContact }>(
    startWith === 'hand' ? { rowNumber: HAND_ROW_BASE } : null,
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  // Server checks, by row content: a row is re-checked only when it changes.
  const [checks, setChecks] = useState<Map<string, UploadRowResult>>(new Map());
  const inFlight = useRef(new Set<string>());
  const [checking, setChecking] = useState(0);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const table = tables[sheetName];
  const sheet = useMemo(() => (table ? parseLineList(table, columns ?? undefined) : null), [table, columns]);
  const missing = sheet ? missingRequired(sheet.columns) : [];
  const drafts = useMemo(() => buildDrafts(sheet?.rows ?? [], hand, edits, today), [sheet, hand, edits, today]);

  const stateOf = (d: Draft): RowState => {
    if (d.errors.length) return 'fix';
    if (d.duplicateOf) return 'duplicate';
    const r = checks.get(draftKey(d.contact));
    if (r?.action === 'exists') return 'on-list';
    if (r?.action === 'skip') return 'fix';
    if (leftOut.has(d.rowNumber)) return 'left-out';
    return r ? (r.action as SaveAction) : 'checking';
  };
  const states = new Map(drafts.map((d) => [d.rowNumber, stateOf(d)]));
  const counts = { all: drafts.length, ready: 0, attention: 0, 'left-out': 0 } as Record<Filter, number>;
  const summary: SaveSummary = { created: 0, linked: 0, restored: 0, updated: 0 };
  for (const s of Array.from(states.values())) {
    if (isSaveState(s)) counts.ready++;
    else if (s === 'fix' || s === 'duplicate') counts.attention++;
    else counts['left-out']++;
    if (s === 'create') summary.created++;
    if (s === 'link-existing') summary.linked++;
    if (s === 'restore') summary.restored++;
    if (s === 'update') summary.updated++;
  }
  const toSave = drafts.filter((d) => SAVE_ACTIONS.includes(states.get(d.rowNumber) as UploadAction));
  const shown = drafts.filter((d) => {
    const s = states.get(d.rowNumber)!;
    if (filter === 'ready') return isSaveState(s);
    if (filter === 'attention') return s === 'fix' || s === 'duplicate';
    if (filter === 'left-out') return s === 'left-out' || s === 'on-list';
    return true;
  });

  // Check new or changed rows on the server (places, people already registered), shortly after the list settles.
  const pending = useMemo(
    () => drafts.filter((d) => savable(d) && !leftOut.has(d.rowNumber) && !checks.has(draftKey(d.contact))),
    [drafts, leftOut, checks],
  );
  useEffect(() => {
    if (step !== 2 || saving) return;
    const rows = pending.filter((d) => !inFlight.current.has(draftKey(d.contact)));
    if (!rows.length) return;
    const timer = setTimeout(async () => {
      const keys = rows.map((d) => draftKey(d.contact));
      keys.forEach((k) => inFlight.current.add(k));
      setChecking((n) => n + 1);
      try {
        const res = await authedFetch('/api/contacts/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ indexEncounterId, commit: false, rows: rows.map((d) => d.contact) }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Check failed (${res.status})`);
        const byRow = new Map((body.results as UploadRowResult[]).map((r) => [r.rowNumber, r]));
        setChecks((prev) => {
          const next = new Map(prev);
          rows.forEach((d, i) => {
            const r = byRow.get(d.rowNumber);
            if (r) next.set(keys[i], r);
          });
          return next;
        });
        setCheckError(null);
      } catch (e) {
        setCheckError((e as Error).message);
      } finally {
        keys.forEach((k) => inFlight.current.delete(k));
        setChecking((n) => n - 1);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pending, step, saving, authedFetch, indexEncounterId]);

  const retryChecks = () => {
    setCheckError(null);
    setChecks((prev) => new Map(prev));
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError(`${file.name} is not an Excel or CSV file.`);
      return;
    }
    setReading(true);
    setError(null);
    try {
      const read = await readTable(file);
      setFileName(file.name);
      setTables(read.tables);
      setSheetName(read.sheets.find((s) => (read.tables[s]?.length ?? 0) > 1) ?? read.sheets[0]);
      setColumns(null);
      setEdits(new Map());
      setLeftOut(new Set());
      setFilter('all');
      setStep(2);
    } catch (e) {
      setError(`Could not read ${file.name}: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  };

  const removeFile = () => {
    setFileName('');
    setTables({});
    setSheetName('');
    setColumns(null);
    setEdits(new Map());
    setLeftOut((prev) => new Set(Array.from(prev).filter((n) => n >= HAND_ROW_BASE)));
  };

  const setColumn = (index: number, value: string) => {
    const base = columns ?? sheet?.columns ?? [];
    setColumns(
      base.map((c) =>
        c.index !== index ? c : value.startsWith('day:') ? { ...c, field: 'day', day: Number(value.slice(4)) } : { ...c, field: value as TargetField, day: undefined },
      ),
    );
  };

  const toggle = (rowNumber: number, include: boolean) =>
    setLeftOut((prev) => {
      const next = new Set(prev);
      if (include) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  const includable = drafts.filter((d) => {
    const s = states.get(d.rowNumber);
    return s !== 'fix' && s !== 'duplicate' && s !== 'on-list';
  });
  const allIncluded = includable.length > 0 && includable.every((d) => !leftOut.has(d.rowNumber));
  const toggleAll = () =>
    setLeftOut((prev) => {
      const next = new Set(prev);
      for (const d of includable) {
        if (allIncluded) next.add(d.rowNumber);
        else next.delete(d.rowNumber);
      }
      return next;
    });

  const submitForm = (contact: ImportedContact) => {
    if (contact.rowNumber >= HAND_ROW_BASE) {
      if (hand.some((c) => c.rowNumber === contact.rowNumber)) {
        setHand((prev) => prev.map((c) => (c.rowNumber === contact.rowNumber ? contact : c)));
      } else {
        setHand((prev) => [...prev, contact]);
        setFilter('all');
      }
    } else {
      setEdits((prev) => new Map(prev).set(contact.rowNumber, contact));
    }
    toggle(contact.rowNumber, true);
    setForm(null);
  };
  const openNew = () => {
    const rowNumber = nextHand.current++;
    setForm({ rowNumber });
  };
  const deleteHand = (rowNumber: number) => setHand((prev) => prev.filter((c) => c.rowNumber !== rowNumber));
  const undoEdit = (rowNumber: number) =>
    setEdits((prev) => {
      const next = new Map(prev);
      next.delete(rowNumber);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch('/api/contacts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indexEncounterId, commit: true, rows: toSave.map((d) => d.contact) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      const results = body.results as UploadRowResult[];
      const failed = results.filter((r) => r.error);
      if (failed.length) {
        // Keep the panel open with the failed rows; the saved ones now show as already on the list.
        const byRow = new Map(results.map((r) => [r.rowNumber, r]));
        setChecks((prev) => {
          const next = new Map(prev);
          for (const d of toSave) {
            const r = byRow.get(d.rowNumber);
            if (r) next.set(draftKey(d.contact), r.saved ? { ...r, action: 'exists' } : r);
          }
          return next;
        });
        setError(`${failed.length} contact${failed.length === 1 ? '' : 's'} could not be saved: ${failed[0].error}. The others were saved.`);
        return;
      }
      const done: SaveSummary = {
        created: results.filter((r) => r.action === 'create').length,
        linked: results.filter((r) => r.action === 'link-existing').length,
        restored: results.filter((r) => r.action === 'restore').length,
        updated: results.filter((r) => r.action === 'update').length,
      };
      onSaved(body.board as Board, done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void chooseFile(e.dataTransfer.files?.[0]);
    },
  };
  const fileInput = (
    <input
      type="file"
      accept=".xlsx,.xls,.csv"
      className="sr-only"
      onChange={(e) => {
        void chooseFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );
  const templates = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
      <DocumentArrowDownIcon className="h-4 w-4 text-gray-400" aria-hidden />
      Blank template:
      <button type="button" className="text-nphi-700 underline" onClick={() => void saveExcelTemplate()}>
        Excel (.xlsx)
      </button>
      <button type="button" className="text-nphi-700 underline" onClick={saveCsvTemplate}>
        CSV
      </button>
    </div>
  );

  const formPanel = (title: string) =>
    form && (
      <div className="rounded-xl border border-nphi-200 bg-nphi-50/40 p-4 space-y-3">
        <p className="font-medium text-nphi-900">{title}</p>
        <ContactForm
          key={form.rowNumber}
          initial={form.initial}
          rowNumber={form.rowNumber}
          submitLabel={form.initial ? 'Save changes' : 'Add to the list'}
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
        />
      </div>
    );

  return (
    <section className="card p-5 space-y-5" aria-label={`Add contacts to ${caseLabel}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-semibold text-nphi-900">Add contacts to {caseLabel}</p>
          <Stepper step={step} />
        </div>
        <button type="button" className="p-1 text-gray-400 hover:text-gray-700" onClick={onClose} aria-label="Close">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {step === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <label
            {...dropProps}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? 'border-nphi-600 bg-nphi-50' : 'border-gray-300 hover:border-nphi-400 hover:bg-gray-50'
            }`}
          >
            {reading ? <Spinner size="md" /> : <ArrowUpTrayIcon className="h-8 w-8 text-nphi-600" />}
            <span className="font-medium text-nphi-900">{reading ? 'Reading the file…' : 'Upload a line list'}</span>
            <span className="text-sm text-gray-600">Drop an Excel or CSV file here, or click to choose one.</span>
            <span className="text-xs text-gray-500">Columns are matched automatically. You review every row before anything is saved.</span>
            {fileInput}
          </label>
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 p-8 text-center">
            <UserPlusIcon className="h-8 w-8 text-nphi-600" />
            <span className="font-medium text-nphi-900">Enter contacts by hand</span>
            <span className="text-sm text-gray-600">For a few contacts. Each one gets the same checks as an upload.</span>
            <button
              type="button"
              className="btn-primary mt-2"
              onClick={() => {
                setStep(2);
                openNew();
              }}
            >
              Enter a contact
            </button>
          </div>
          <div className="md:col-span-2">{templates}</div>
        </div>
      )}

      {step === 2 && (
        <>
          {/* Sources */}
          <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {fileName ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 ring-1 ring-gray-200">
                    <ArrowUpTrayIcon className="h-4 w-4 text-gray-400" aria-hidden />
                    <span className="max-w-[16rem] truncate">{fileName}</span>
                    <button type="button" className="text-gray-400 hover:text-accent-700" onClick={removeFile} aria-label={`Remove ${fileName}`}>
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </span>
                  {Object.keys(tables).length > 1 && (
                    <div className="w-48">
                      <Select
                        value={sheetName}
                        onChange={(s) => {
                          setSheetName(s);
                          setColumns(null);
                          setEdits(new Map());
                        }}
                        options={Object.keys(tables).map((s) => ({ value: s, label: `Sheet: ${s}` }))}
                      />
                    </div>
                  )}
                  <button type="button" className="text-nphi-700 underline" onClick={() => setShowMapping((s) => !s)}>
                    {showMapping ? 'Hide column matching' : 'Column matching'}
                  </button>
                </>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-nphi-700 underline">
                  <ArrowUpTrayIcon className="h-4 w-4" aria-hidden />
                  Add from a file
                  {fileInput}
                </label>
              )}
            </div>
            <button type="button" className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={openNew} disabled={!!form && !form.initial}>
              <UserPlusIcon className="h-4 w-4" />
              Add a contact
            </button>
          </div>

          {missing.length > 0 && (
            <Alert variant="warning">No column was matched to {missing.join(', ')}. Open column matching and pick it.</Alert>
          )}

          {showMapping && sheet && (
            <div className="overflow-x-auto rounded-lg border border-nphi-100">
              <table className="min-w-full divide-y divide-nphi-100 text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium text-gray-600">Sheet column</th>
                    <th className="px-3 py-2 font-medium text-gray-600">First value</th>
                    <th className="w-72 px-3 py-2 font-medium text-gray-600">Saved as</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nphi-100">
                  {sheet.columns.map((c) => (
                    <tr key={c.index}>
                      <td className="px-3 py-2 text-gray-800">{c.header || <span className="text-gray-400">(blank, column {c.index + 1})</span>}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-gray-600">{String((table?.[sheet.headerRow + 1] ?? [])[c.index] ?? '') || '—'}</td>
                      <td className="px-3 py-2">
                        <Select value={optionOf(c)} onChange={(v) => setColumn(c.index, v)} options={FIELD_OPTIONS} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-gray-500">
                &quot;Keep as a note&quot; saves the value with the contact (e.g. quarantine facility, comorbidities).
              </p>
            </div>
          )}

          {form && !form.initial && formPanel('New contact')}

          {drafts.length === 0 ? (
            !form && (
              <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
                No contacts yet. Add one by hand or add them from a file.
              </div>
            )
          ) : (
            <>
              {/* Filters */}
              <div className="flex flex-wrap gap-2" role="tablist">
                {(
                  [
                    ['all', 'All'],
                    ['ready', 'Ready'],
                    ['attention', 'Need attention'],
                    ['left-out', 'Not added'],
                  ] as Array<[Filter, string]>
                ).map(([f, label]) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      filter === f ? 'border-nphi-600 bg-nphi-50 text-nphi-900' : 'border-nphi-100 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}{' '}
                    <span className={`font-semibold ${f === 'attention' && counts.attention ? 'text-accent-700' : ''}`}>{counts[f]}</span>
                  </button>
                ))}
              </div>

              <div className="max-h-[32rem] overflow-auto rounded-lg border border-nphi-100">
                <table className="min-w-full divide-y divide-nphi-100 text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="text-left">
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-nphi-700"
                          checked={allIncluded}
                          onChange={toggleAll}
                          disabled={includable.length === 0}
                          aria-label={allIncluded ? 'Leave all out' : 'Add all'}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium text-gray-600">Contact</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Phone</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Date of contact</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Residence</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Check</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nphi-100">
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                          No contacts in this view.
                        </td>
                      </tr>
                    )}
                    {shown.map((d) => {
                      const s = states.get(d.rowNumber)!;
                      const r = checks.get(draftKey(d.contact));
                      const c = d.contact;
                      const canToggle = s !== 'fix' && s !== 'duplicate' && s !== 'on-list';
                      const editing = form?.initial && form.rowNumber === d.rowNumber;
                      const notes = [
                        ...d.errors,
                        ...(r?.problems ?? []),
                        ...(s === 'fix' ? [] : d.warnings),
                        ...(r?.changes?.length && (s === 'update' || s === 'restore') ? [`Updates: ${r.changes.join(', ')}`] : []),
                        ...(r?.error ? [r.error] : []),
                      ];
                      return (
                        <Fragment key={d.rowNumber}>
                          <tr className={`align-top ${s === 'left-out' || s === 'on-list' ? 'bg-gray-50/60 text-gray-400' : ''}`}>
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-nphi-700 disabled:opacity-40"
                                checked={canToggle && s !== 'left-out'}
                                disabled={!canToggle}
                                onChange={(e) => toggle(d.rowNumber, e.target.checked)}
                                aria-label={`Add ${draftName(c) || 'this row'}`}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className={`font-medium ${s === 'left-out' || s === 'on-list' ? '' : 'text-gray-900'}`}>{draftName(c) || '—'}</div>
                              <div className="text-[11px] text-gray-500">
                                {d.source === 'hand' ? 'Entered by hand' : `Row ${d.rowNumber}${d.edited ? ' · edited' : ''}`}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">{c.phone ?? '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2.5">{c.contactDate ?? '—'}</td>
                            <td className="px-3 py-2.5">{r?.residence ?? ([c.subCountyName, c.countyName].filter(Boolean).join(', ') || '—')}</td>
                            <td className="px-3 py-2.5">
                              <span className={`chip ${STATE[s].chip}`}>
                                {s === 'duplicate' ? `Same person as ${d.duplicateOf}` : STATE[s].label}
                                {r?.existingName && (s === 'link-existing' || s === 'restore') ? ` (${r.existingName})` : ''}
                              </span>
                              {notes.length > 0 && (
                                <ul className={`mt-1 space-y-0.5 text-[11px] ${s === 'fix' ? 'text-accent-700' : 'text-amber-800'}`}>
                                  {notes.map((p) => (
                                    <li key={p}>{p}</li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                                    s === 'fix' ? 'bg-accent-50 text-accent-700 hover:bg-accent-100' : 'text-gray-600 hover:bg-gray-100'
                                  }`}
                                  onClick={() => setForm(editing ? null : { rowNumber: d.rowNumber, initial: c })}
                                >
                                  <PencilSquareIcon className="h-3.5 w-3.5" />
                                  {s === 'fix' ? 'Fix' : 'Edit'}
                                </button>
                                {d.edited && (
                                  <button type="button" className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" onClick={() => undoEdit(d.rowNumber)}>
                                    Undo edit
                                  </button>
                                )}
                                {d.source === 'hand' && (
                                  <button
                                    type="button"
                                    className="rounded-md p-1 text-gray-400 hover:bg-accent-50 hover:text-accent-700"
                                    onClick={() => deleteHand(d.rowNumber)}
                                    aria-label={`Delete ${draftName(c)}`}
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {editing && (
                            <tr>
                              <td colSpan={7} className="bg-nphi-50/30 px-3 py-3">
                                {formPanel(`Edit ${draftName(c) || (d.source === 'file' ? `row ${d.rowNumber}` : 'contact')}`)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {checkError && (
            <Alert variant="warning">
              Some rows could not be checked: {checkError}{' '}
              <button type="button" className="underline" onClick={retryChecks}>
                Try again
              </button>
            </Alert>
          )}

          {/* Save */}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-3 rounded-b-xl border-t border-gray-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600" aria-live="polite">
              {checking > 0 || pending.length > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" /> Checking {pending.length} contact{pending.length === 1 ? '' : 's'}…
                </span>
              ) : toSave.length === 0 ? (
                drafts.length ? 'Nothing to save yet.' : 'Add contacts to review them here.'
              ) : (
                [
                  summary.created && `${summary.created} new`,
                  summary.linked && `${summary.linked} already registered (linked to this case)`,
                  summary.restored && `${summary.restored} put back`,
                  summary.updated && `${summary.updated} on the list with new information`,
                ]
                  .filter(Boolean)
                  .join(' · ') + (counts['left-out'] + counts.attention ? ` · ${counts['left-out'] + counts.attention} not added` : '')
              )}
            </p>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={save}
                disabled={saving || checking > 0 || pending.length > 0 || toSave.length === 0 || missing.length > 0}
              >
                {saving ? 'Saving…' : `Save ${toSave.length || ''} contact${toSave.length === 1 ? '' : 's'}`.replace('  ', ' ')}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

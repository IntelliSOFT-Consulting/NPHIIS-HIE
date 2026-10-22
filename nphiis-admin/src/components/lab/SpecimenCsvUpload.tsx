'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Download02, UploadCloud02 } from '@untitled-ui/icons-react';
import { useAuthedFetch } from '@/lib/auth-context';
import {
  CSV_COLUMNS,
  UPDATE_KINDS,
  messagesFor,
  specimenTemplateCsv,
  updatesFromCsvRows,
  type CsvRowProblem,
  type LabMessage,
  type UpdatesResponse,
} from '@/lib/lab-messages';
import { SPECIMEN_STATUS_LABEL, isSpecimenStatus, type SubmittedSpecimen } from '@/lib/specimens';
import Spinner from '../ui/Spinner';
import { Alert } from '../ui/Alert';

function saveCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

interface RowOutcome {
  row: number;
  specimenId: string;
  ok: boolean;
  message: string;
}

/**
 * Lab results for many specimens from a CSV, one row per update (a result row
 * carries one test). Rows become the lab system's messages and go through the
 * same workflow as single entries; each row's outcome is listed.
 */
export default function SpecimenCsvUpload({ templateName }: { templateName: string }) {
  const authedFetch = useAuthedFetch();
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null);
  const [skipped, setSkipped] = useState(0);

  const downloadTemplate = async () => {
    setTemplateLoading(true);
    setTemplateNote(null);
    setTemplateError(null);
    try {
      const res = await authedFetch('/api/lab/open-specimens');
      const body = (await res.json()) as { specimens?: SubmittedSpecimen[]; error?: string };
      if (!res.ok || !body.specimens) throw new Error(body.error ?? `Request failed (${res.status})`);
      saveCsv(specimenTemplateCsv(body.specimens), `${templateName}-specimens-template.csv`);
      const n = body.specimens.length;
      setTemplateNote(
        `${n} specimen${n === 1 ? '' : 's'} waiting for a result pre-filled. Fill in Update (${UPDATE_KINDS.join(', ')}) ` +
          'and its columns; add a row per test for a result. Rows without an Update are skipped.',
      );
    } catch (err) {
      setTemplateError((err as Error).message);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setOutcomes(null);
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length) {
          setParseError(result.errors[0].message);
          setRows([]);
          return;
        }
        const headers = (result.meta.fields ?? []).map((h) => h.trim().toLowerCase());
        const missing = ['Specimen ID', 'Update'].filter((c) => !headers.includes(c.toLowerCase()));
        if (missing.length) {
          setParseError(`Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Download the template for the columns.`);
          setRows([]);
          return;
        }
        setRows(result.data);
      },
      error: (err) => setParseError(err.message),
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setOutcomes(null);
    setParseError(null);
    const { updates, problems, skipped: blank } = updatesFromCsvRows(rows);
    setSkipped(blank);
    const out: RowOutcome[] = problems.map((p: CsvRowProblem) => ({ row: p.row, specimenId: p.specimenId, ok: false, message: p.error }));
    try {
      if (updates.length) {
        // Row number of each message, by its index in the batch.
        const messages: LabMessage[] = [];
        const rowOf: number[] = [];
        for (const u of updates) {
          for (const m of messagesFor(u.update)) {
            messages.push(m);
            rowOf.push(u.row);
          }
        }
        const res = await authedFetch('/api/lab/specimen-updates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: messages }),
        });
        const body = (await res.json()) as UpdatesResponse | { error: string };
        if ('error' in body) throw new Error(body.error);

        const invalidRows = new Map(body.invalid.map((i) => [rowOf[i.index], i.error]));
        // hie-auth answers once per update, in order, by specimen and kind: a progress row
        // or a note each get their own; a specimen's result rows (one per test) share one.
        const queues = new Map<string, UpdatesResponse['results']>();
        for (const r of body.results) {
          const key = `${r.kind}|${r.specimenId}`;
          queues.set(key, [...(queues.get(key) ?? []), r]);
        }
        for (const u of updates) {
          const invalid = invalidRows.get(u.row);
          if (invalid) {
            out.push({ row: u.row, specimenId: u.update.specimenId, ok: false, message: invalid });
            continue;
          }
          const kind = u.update.kind === 'received' || u.update.kind === 'in-testing' ? 'progress' : u.update.kind;
          const queue = queues.get(`${kind}|${u.update.specimenId}`) ?? [];
          const o = kind === 'result' || kind === 'rejected' ? queue[0] : queue.shift();
          const status = o?.businessStatus && isSpecimenStatus(o.businessStatus) ? SPECIMEN_STATUS_LABEL[o.businessStatus] : o?.businessStatus;
          out.push({
            row: u.row,
            specimenId: u.update.specimenId,
            ok: !!o?.matched,
            message: o?.matched ? `Recorded. Status: ${status ?? '—'}` : (o?.error ?? 'Not recorded'),
          });
        }
      }
      setOutcomes(out.sort((a, b) => a.row - b.row));
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const failed = outcomes?.filter((o) => !o.ok) ?? [];
  const recorded = (outcomes?.length ?? 0) - failed.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 max-w-2xl">
          One row per update, keyed by Specimen ID (the tube label). Columns: {CSV_COLUMNS.join(', ')}.
        </p>
        <button onClick={() => void downloadTemplate()} disabled={templateLoading} className="btn-secondary">
          {templateLoading ? (
            <Spinner size="sm" label="Preparing…" />
          ) : (
            <>
              <Download02 className="h-4 w-4 mr-1.5" /> Download template
            </>
          )}
        </button>
      </div>

      {templateNote && <Alert variant="info">{templateNote}</Alert>}
      {templateError && (
        <Alert variant="error" title="Could not load the specimens waiting for results">
          {templateError}{' '}
          <button
            onClick={() => saveCsv(specimenTemplateCsv([]), `${templateName}-specimens-template.csv`)}
            className="underline font-medium"
          >
            Download a blank template instead
          </button>
        </Alert>
      )}

      {outcomes && (
        <div
          className={`rounded-xl border p-4 text-sm space-y-3 ${
            failed.length ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div>
            <span className="font-semibold">{recorded}</span> recorded
            {failed.length > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-accent-700">{failed.length}</span> not recorded
              </>
            )}
            {skipped > 0 && (
              <>
                {' · '}
                <span className="font-semibold">{skipped}</span> blank row{skipped === 1 ? '' : 's'} skipped
              </>
            )}
          </div>
          {failed.length > 0 && (
            <>
              <ul className="text-xs text-accent-800 max-h-48 overflow-y-auto pl-4 list-disc">
                {failed.map((o) => (
                  <li key={o.row}>
                    Row {o.row} (specimen {o.specimenId || '-'}): {o.message}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => saveCsv(Papa.unparse(failed), `${templateName}-specimen-failures.csv`)}
                className="text-xs underline text-nphi-700 hover:text-nphi-800"
              >
                Download failures as CSV
              </button>
            </>
          )}
        </div>
      )}

      <label className="block border-2 border-dashed border-nphi-200 rounded-2xl p-8 text-center cursor-pointer hover:bg-nphi-50/60 transition-colors">
        <UploadCloud02 className="h-9 w-9 mx-auto text-nphi-600" />
        <div className="mt-3 text-sm font-medium text-gray-700">{fileName || 'Click to upload or drag and drop'}</div>
        <div className="text-xs text-gray-500 mt-0.5">CSV files only</div>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </label>

      {parseError && <Alert variant="error">{parseError}</Alert>}

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            {rows.length} row{rows.length === 1 ? '' : 's'} loaded.
          </div>
          <button onClick={() => void submit()} disabled={submitting} className="btn-primary">
            {submitting ? <Spinner size="sm" className="text-white" label="Recording…" /> : `Record ${rows.length} rows`}
          </button>
        </div>
      )}
    </div>
  );
}

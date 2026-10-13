"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download02, UploadCloud02 } from "@untitled-ui/icons-react";
import { useAuth, useAuthedFetch } from "@/lib/auth-context";
import { hasAnyRole } from "@/lib/roles";
import { LAB_FORMS, getLabForm } from "@/lib/questionnaires";
import { type PendingLabCases, labTemplateCsv } from "@/lib/lab-template";
import Spinner from "../ui/Spinner";
import { Alert } from "../ui/Alert";
import { Field, Select } from "../ui/Field";

interface RowResult {
  row: number;
  epid: string;
  status: "accepted" | "rejected" | "flagged" | "skipped";
  reason?: string;
  existingCount?: number;
  existingLatest?: string;
}

interface UploadResponse {
  accepted: number;
  rejected: RowResult[];
  flagged: RowResult[];
  /** Pre-filled template rows left blank. */
  skipped: number;
  results: RowResult[];
}

function saveCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvUploadPanel() {
  const { roles, accessToken } = useAuth();
  const authedFetch = useAuthedFetch();
  const availableForms = useMemo(
    () => LAB_FORMS.filter((f) => hasAnyRole(roles, f.allowedRoles)),
    [roles],
  );

  const [formId, setFormId] = useState(availableForms[0]?.id ?? "");
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [importingFlagged, setImportingFlagged] = useState(false);
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const form = formId ? getLabForm(formId) : undefined;

  /** Template pre-filled with the cases that have no result for the form yet. */
  const downloadTemplate = async () => {
    if (!form) return;
    setTemplateLoading(true);
    setTemplateNote(null);
    setTemplateError(null);
    try {
      const res = await authedFetch(`/api/lab/pending-cases?formId=${encodeURIComponent(form.id)}`);
      const data = (await res.json()) as PendingLabCases | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Request failed (${res.status})`);
      }
      saveCsv(labTemplateCsv(form, data.cases), `${form.id}-template.csv`);
      const n = data.cases.length;
      setTemplateNote(
        `${n} case${n === 1 ? "" : "s"} without a result pre-filled.` +
          (data.withoutEpid
            ? ` ${data.withoutEpid} record${data.withoutEpid === 1 ? "" : "s"} without a complete EPID left out.`
            : "") +
          " Fill in the results you have; blank rows are skipped on upload.",
      );
    } catch (err) {
      setTemplateError((err as Error).message);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResponse(null);
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
        setRows(result.data);
      },
      error: (err) => setParseError(err.message),
    });
  };

  const submit = async () => {
    if (!form || rows.length === 0 || !accessToken) return;
    setSubmitting(true);
    setResponse(null);
    try {
      const res = await authedFetch("/api/lab/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: form.id, rows }),
      });
      const data = (await res.json()) as UploadResponse | { error: string };
      if (!res.ok) {
        setParseError("error" in data ? data.error : "Upload failed");
        return;
      }
      setResponse(data as UploadResponse);
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Second-pass import for the rows the first pass held back because their
   * case already had a result. Re-sends only those rows with `force: true`
   * and folds the outcome back into the existing summary.
   */
  const importFlagged = async () => {
    if (!form || !accessToken || !response?.flagged.length) return;
    // Flagged row numbers are 1-based with a header row, so the original CSV
    // index is `row - 2`.
    const flaggedRows = response.flagged
      .map((r) => rows[r.row - 2])
      .filter(Boolean);
    if (flaggedRows.length === 0) return;
    setImportingFlagged(true);
    try {
      const res = await authedFetch("/api/lab/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: form.id, rows: flaggedRows, force: true }),
      });
      const data = (await res.json()) as UploadResponse | { error: string };
      if (!res.ok) {
        setParseError("error" in data ? data.error : "Import failed");
        return;
      }
      const forced = data as UploadResponse;
      setResponse((prev) =>
        prev
          ? {
              accepted: prev.accepted + forced.accepted,
              rejected: [...prev.rejected, ...forced.rejected],
              flagged: [],
              skipped: prev.skipped + forced.skipped,
              // Replace the held-back rows with their forced outcomes so the
              // row total stays accurate instead of double-counting them.
              results: [
                ...prev.results.filter((r) => r.status !== 'flagged'),
                ...forced.results,
              ],
            }
          : forced,
      );
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setImportingFlagged(false);
    }
  };

  const downloadFailures = () => {
    if (!response?.rejected.length) return;
    const csv = Papa.unparse(
      response.rejected.map((r) => ({
        row: r.row,
        epid: r.epid,
        reason: r.reason,
      })),
    );
    saveCsv(csv, `${form?.id ?? "lab"}-failures.csv`);
  };

  if (availableForms.length === 0) {
    return (
      <div className="card p-6">
        <Alert variant="warning" title="No access">
          Your role does not have permission to upload lab results.
        </Alert>
      </div>
    );
  }

  // Sticky-style summary card rendered above everything else after a submit
  // so users don't have to scroll past a long row preview to find their
  // results.
  const ResultsSummary = () =>
    response ? (
      <div
        className={`rounded-xl border p-4 text-sm space-y-3 ${
          response.rejected.length === 0 && response.flagged.length === 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="font-semibold">{response.accepted}</span> imported
            {response.flagged.length > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-amber-700">
                  {response.flagged.length}
                </span>{' '}
                already have results
              </>
            )}
            {response.rejected.length > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-accent-700">
                  {response.rejected.length}
                </span>{' '}
                rejected
              </>
            )}
            {response.skipped > 0 && (
              <>
                {' · '}
                <span className="font-semibold">{response.skipped}</span> blank
                row{response.skipped === 1 ? '' : 's'} skipped
              </>
            )}
            <span className="text-xs text-gray-500 ml-2">
              of {response.results.length} row
              {response.results.length === 1 ? '' : 's'}
            </span>
          </div>
          {response.rejected.length > 0 && (
            <button
              onClick={downloadFailures}
              className="text-xs underline text-nphi-700 hover:text-nphi-800"
            >
              Download failures as CSV
            </button>
          )}
        </div>

        {response.flagged.length > 0 && (
          <div className="rounded-lg bg-white/70 border border-amber-200 p-3 space-y-2">
            <div className="text-xs text-amber-900">
              These rows were held back because the case already has a result
              for this form. The new rows above were imported. Import these
              anyway to add a separate result for each.
            </div>
            <ul className="text-xs text-amber-800 max-h-40 overflow-y-auto pl-4 list-disc">
              {response.flagged.slice(0, 50).map((r) => (
                <li key={r.row}>
                  Row {r.row} (EPID {r.epid || '-'})
                  {r.existingCount
                    ? ` — ${r.existingCount} existing result${
                        r.existingCount === 1 ? '' : 's'
                      }`
                    : ''}
                </li>
              ))}
              {response.flagged.length > 50 && (
                <li className="list-none italic text-gray-500">
                  …and {response.flagged.length - 50} more.
                </li>
              )}
            </ul>
            <button
              onClick={importFlagged}
              disabled={importingFlagged}
              className="btn-secondary"
            >
              {importingFlagged ? (
                <Spinner size="sm" label="Importing…" />
              ) : (
                `Import ${response.flagged.length} flagged row${
                  response.flagged.length === 1 ? '' : 's'
                } anyway`
              )}
            </button>
          </div>
        )}

        {response.rejected.length > 0 && (
          <ul className="text-xs text-accent-800 max-h-40 overflow-y-auto pl-4 list-disc">
            {response.rejected.slice(0, 50).map((r) => (
              <li key={r.row}>
                Row {r.row} (EPID {r.epid || '-'}): {r.reason}
              </li>
            ))}
            {response.rejected.length > 50 && (
              <li className="list-none italic text-gray-500">
                …and {response.rejected.length - 50} more (download CSV for the
                full list).
              </li>
            )}
          </ul>
        )}
      </div>
    ) : null;

  return (
    <div className="card p-6 space-y-5">
      <ResultsSummary />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="md:col-span-2">
          <Field label="Lab form" htmlFor="csv-form-select">
            <Select
              id="csv-form-select"
              value={formId}
              onChange={(v) => {
                setFormId(v);
                setRows([]);
                setResponse(null);
                setFileName("");
                setTemplateNote(null);
                setTemplateError(null);
              }}
              options={availableForms.map((f) => ({
                value: f.id,
                label: f.title,
              }))}
            />
          </Field>
        </div>
        <button
          onClick={downloadTemplate}
          disabled={!form || templateLoading}
          className="btn-secondary"
        >
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
      {templateError && form && (
        <Alert variant="error" title="Could not load the cases without results">
          {templateError}{" "}
          <button
            onClick={() => saveCsv(labTemplateCsv(form, []), `${form.id}-template.csv`)}
            className="underline font-medium"
          >
            Download a blank template instead
          </button>
        </Alert>
      )}

      <label className="block border-2 border-dashed border-nphi-200 rounded-2xl p-8 text-center cursor-pointer hover:bg-nphi-50/60 transition-colors">
        <UploadCloud02 className="h-9 w-9 mx-auto text-nphi-600" />
        <div className="mt-3 text-sm font-medium text-gray-700">
          {fileName || "Click to upload or drag and drop"}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">CSV files only</div>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>

      {parseError && <Alert variant="error">{parseError}</Alert>}

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">
            {rows.length} row{rows.length === 1 ? "" : "s"} loaded.
          </div>
          <div className="overflow-x-auto border border-nphi-100 rounded-xl">
            <table className="min-w-full text-xs">
              <thead className="bg-nphi-50/60">
                <tr>
                  {Object.keys(rows[0]).map((h) => (
                    <th
                      key={h}
                      className="px-2 py-1 text-left text-gray-700 font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {Object.keys(rows[0]).map((h) => (
                      <td key={h} className="px-2 py-1 text-gray-700">
                        {r[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 5 && (
              <div className="px-2 py-1 text-xs text-gray-500">
                Showing first 5 of {rows.length}.
              </div>
            )}
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? (
              <Spinner size="sm" className="text-white" label="Submitting…" />
            ) : (
              `Submit ${rows.length} rows`
            )}
          </button>
        </div>
      )}

    </div>
  );
}

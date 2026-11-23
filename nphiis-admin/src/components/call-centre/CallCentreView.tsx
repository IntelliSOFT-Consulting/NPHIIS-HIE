'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PhoneIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth, useAuthedFetch } from '@/lib/auth-context';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/pagination';
import {
  RISK_LEVEL_OPTIONS,
  SOURCE_OPTIONS,
  agentLabel,
  answerText,
  callLogSections,
  formOf,
  isLegacyForm,
  sectionTitle,
  type CallLog,
  type CallLogPayload,
  type CallLogSummary,
} from '@/lib/call-centre';
import { isHidden, labelFor, type QuestionnaireItem } from '@/lib/questionnaires';
import { Alert } from '../ui/Alert';
import { Select, TextInput } from '../ui/Field';
import { TableSkeleton } from '../ui/Skeleton';
import Spinner from '../ui/Spinner';
import CallLogForm from './CallLogForm';

const RISK_FILTER = [{ value: '', label: 'All risk levels' }, ...RISK_LEVEL_OPTIONS.map((o) => ({ value: o.code, label: o.display }))];
const SOURCE_FILTER = [{ value: '', label: 'All sources' }, ...SOURCE_OPTIONS.map((o) => ({ value: o.code, label: o.display }))];

const RISK_BADGE: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-800',
  Moderate: 'bg-amber-100 text-amber-800',
  High: 'bg-orange-100 text-orange-800',
  Critical: 'bg-red-100 text-red-800',
};

function RiskChip({ level }: { level?: string }) {
  if (!level) return <>—</>;
  return <span className={`chip ${RISK_BADGE[level] ?? 'bg-gray-100 text-gray-700'}`}>{level}</span>;
}

/** A dateTime in Kenya time; a date alone ("2026-11-23") without a time. */
function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(`${iso}T12:00:00+03:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { dateStyle: 'medium', timeZone: 'Africa/Nairobi' });
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' });
}

type Panel =
  | { kind: 'new' }
  | { kind: 'view'; patientId: string }
  | { kind: 'edit'; log: CallLog };

function Modal({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Kept in view below the scrolling body. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-nphi-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-card-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-nphi-100/60">
          <h3 className="text-lg font-semibold text-nphi-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-nphi-100/60">{footer}</div>}
      </div>
    </div>
  );
}

export default function CallCentreView() {
  const authedFetch = useAuthedFetch();
  const { user } = useAuth();
  const agentName = agentLabel(
    user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
    user?.username,
  );

  const [logs, setLogs] = useState<CallLogSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [risk, setRisk] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [reload, setReload] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (debouncedSearch) query.set('q', debouncedSearch);
        if (risk) query.set('risk', risk);
        if (source) query.set('source', source);
        const res = await authedFetch(`/api/call-centre?${query}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (!cancelled) {
          setLogs(body.logs as CallLogSummary[]);
          setTotal(body.total as number);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, page, pageSize, debouncedSearch, risk, source, reload]);

  /** Saves a log; returns the answers the server refused, if any. */
  const save = useCallback(
    async (payload: CallLogPayload, patientId?: string): Promise<Record<string, string> | void> => {
      const res = await authedFetch(patientId ? `/api/call-centre/${encodeURIComponent(patientId)}` : '/api/call-centre', {
        method: patientId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body.errors) return body.errors as Record<string, string>;
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setPanel(null);
      setNotice(patientId ? 'Alert log updated.' : 'Alert logged.');
      setReload((n) => n + 1);
    },
    [authedFetch],
  );

  const remove = useCallback(
    async (patientId: string) => {
      const res = await authedFetch(`/api/call-centre/${encodeURIComponent(patientId)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setPanel(null);
      setNotice('Alert log deleted.');
      setReload((n) => n + 1);
    },
    [authedFetch],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = !!(debouncedSearch || risk || source);

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1">
          <TextInput
            placeholder="Search log ID, linked EPID, reporter, phone, county, facility, officer or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="lg:w-60">
          <Select
            value={source}
            onChange={(v) => {
              setSource(v);
              setPage(1);
            }}
            options={SOURCE_FILTER}
          />
        </div>
        <div className="lg:w-48">
          <Select
            value={risk}
            onChange={(v) => {
              setRisk(v);
              setPage(1);
            }}
            options={RISK_FILTER}
          />
        </div>
        <button
          type="button"
          className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap"
          onClick={() => {
            setNotice(null);
            setPanel({ kind: 'new' });
          }}
        >
          <PlusIcon className="h-4 w-4" />
          Log an alert
        </button>
      </div>

      {!loaded ? (
        <TableSkeleton rows={6} cols={9} />
      ) : (
        <div className={`card overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {logs.length === 0 ? (
            <div className="text-center py-16 px-4">
              <PhoneIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-nphi-900">No alert logs</p>
              <p className="mt-1 text-sm text-gray-500">
                {filtered ? 'Adjust the search or filters.' : 'Alerts you log here, or on the mobile app, will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-nphi-100 text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">Log ID</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Received</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Linked case</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Reporter</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Location</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Source</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Symptoms</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Risk level</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Recommended action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nphi-100">
                  {logs.map((l) => (
                    <tr
                      key={l.patientId}
                      onClick={() => {
                        setNotice(null);
                        setPanel({ kind: 'view', patientId: l.patientId });
                      }}
                      className="cursor-pointer hover:bg-nphi-50/40 align-top"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-800 whitespace-nowrap">{l.logId ?? <span className="text-gray-400">Pending</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-800">{formatDateTime(l.receivedAt)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{l.epid ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div>{l.reporterName ?? '—'}</div>
                        {l.reporterMobile && <div className="text-xs text-gray-500">{l.reporterMobile}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{[l.county, l.subCounty].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{l.source ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{l.symptoms ?? '—'}</td>
                      <td className="px-4 py-3">
                        <RiskChip level={l.riskLevel} />
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{l.action ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loaded && total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
          <div className="text-gray-600">
            Total <span className="font-semibold text-nphi-900">{total}</span> alerts
            <span className="mx-2">·</span>
            Page {page} of {totalPages}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-gray-600">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-nphi-100 py-1.5 px-2 bg-white"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {panel?.kind === 'new' && (
        <Modal title="Log an alert" onClose={() => setPanel(null)}>
          <CallLogForm agentName={agentName} onSubmit={(p) => save(p)} onCancel={() => setPanel(null)} />
        </Modal>
      )}
      {panel?.kind === 'edit' && (
        <Modal title="Edit alert log" onClose={() => setPanel(null)}>
          <CallLogForm
            initial={panel.log}
            onSubmit={(p) => save(p, panel.log.summary.patientId)}
            onCancel={() => setPanel({ kind: 'view', patientId: panel.log.summary.patientId })}
          />
        </Modal>
      )}
      {panel?.kind === 'view' && (
        <CallLogDetails
          patientId={panel.patientId}
          onClose={() => setPanel(null)}
          onEdit={(log) => setPanel({ kind: 'edit', log })}
          onDelete={remove}
        />
      )}
    </div>
  );
}

/** Shorter labels for the read-only view; the form keeps the full questions. */
const SHORT_LABELS: Record<string, string> = {
  // Alert triage.
  'alert-identifier': 'Reference number',
  'alert-received-by': 'Received by',
  'alert-source-type': 'Source',
  'alert-source-type-other': 'Other source',
  'alert-mode': 'Mode of reporting',
  'alert-reporter-name': 'Reporter',
  'alert-reporter-mobile': 'Reporter phone',
  'alert-facility': 'Facility / community',
  'alert-description': 'What was reported',
  'alert-first-noticed': 'First noticed',
  'alert-suspected-cases': 'Suspected cases',
  'alert-deaths': 'Deaths',
  'alert-symptoms': 'Symptoms',
  'alert-symptoms-other': 'Other symptoms',
  'alert-confirmed': 'Confirmed by another source',
  'alert-confirmed-source': 'Confirming source',
  'alert-concerns': 'Public health concerns',
  'alert-likelihood': 'Likelihood score',
  'alert-impact': 'Impact score',
  'alert-actions': 'Recommended action',
  'alert-remarks': 'Officer remarks',
  'alert-officer-name': 'Officer',
  'alert-officer-signature': 'Signature',
  'alert-officer-date': 'Date signed',
};

/** Labels for answers of earlier alert logs. */
const LEGACY_SHORT_LABELS: Record<string, string> = {
  'alert-date': 'Date alerted',
  'alert-reporter-name': 'Reporter',
  'alert-reporter-mobile': 'Reporter phone',
  'alert-source-type': 'Source',
  'alert-source-type-other': 'Other source',
  'a4-county': 'County',
  'a3-sub-county': 'Sub-county',
  'a2-ward': 'Ward',
  'alert-village': 'Village / estate',
  '873240407472': 'Name',
  '492731638700': 'Age',
  '929966324957': 'Sex',
  'alert-mobile': 'Phone',
  'alert-home-country': 'Home country',
  'alert-facility': 'Reporting facility',
  'alert-description': 'Comments',
};

/** Shown in the summary strip, so not repeated below. */
const IN_SUMMARY = new Set([
  'alert-date',
  'alert-time',
  'alert-received-by',
  'alert-risk-level',
  // Earlier alert logs.
  'alert-vital-status',
  'alert-meets-case-definition',
]);
const SURNAME = '486402457213';
const FIRST_NAME = '873240407472';

type Row = { linkId: string; label: string; value: string; wide: boolean };

/** Answered questions of a section (nested groups flattened). */
function answeredIn(group: QuestionnaireItem, log: CallLog, legacy: boolean): Row[] {
  const out: Row[] = [];
  for (const it of group.item ?? []) {
    if (it.type === 'group') {
      out.push(...answeredIn(it, log, legacy));
      continue;
    }
    if (it.type === 'display' || IN_SUMMARY.has(it.linkId) || it.linkId === SURNAME) continue;
    let value = answerText(log, it.linkId);
    // First name and surname read as one name.
    if (it.linkId === FIRST_NAME) value = [value, answerText(log, SURNAME)].filter(Boolean).join(' ') || undefined;
    if ((it.type === 'dateTime' || it.type === 'date') && value) value = formatDateTime(value);
    if (!value) continue;
    out.push({
      linkId: it.linkId,
      label: (legacy ? LEGACY_SHORT_LABELS[it.linkId] : SHORT_LABELS[it.linkId]) ?? labelFor(it),
      value,
      wide: it.type === 'text' || value.length > 60,
    });
  }
  return out;
}


function CallLogDetails({
  patientId,
  onClose,
  onEdit,
  onDelete,
}: {
  patientId: string;
  onClose: () => void;
  onEdit: (log: CallLog) => void;
  onDelete: (patientId: string) => Promise<void>;
}) {
  const authedFetch = useAuthedFetch();
  const [log, setLog] = useState<CallLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`/api/call-centre/${encodeURIComponent(patientId)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (!cancelled) setLog(body as CallLog);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, patientId]);

  const footer = log && (
    <div className="flex flex-wrap justify-end gap-3">
      {confirming ? (
        <>
          <span className="text-sm text-gray-700 self-center mr-auto">Delete this alert log? It leaves the list.</span>
          <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={deleting}>
            Keep it
          </button>
          <button
            type="button"
            disabled={deleting}
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 disabled:opacity-60"
            onClick={async () => {
              setDeleting(true);
              try {
                await onDelete(patientId);
              } catch (e) {
                setError((e as Error).message);
                setDeleting(false);
                setConfirming(false);
              }
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium text-accent-700 bg-accent-50 hover:bg-accent-100"
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
          <button type="button" className="btn-primary" onClick={() => onEdit(log)}>
            Edit
          </button>
        </>
      )}
    </div>
  );

  const summary = log?.summary;
  const form = log ? formOf(log) : undefined;
  const legacy = !!log && !!form && isLegacyForm(form);

  return (
    <Modal title={log?.summary.logId ? `Alert log ${log.summary.logId}` : 'Alert log'} onClose={onClose} footer={footer}>
      {error && <Alert variant="error">{error}</Alert>}
      {!log && !error && <Spinner label="Loading…" />}
      {log && summary && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-2xl bg-nphi-50/60 px-4 py-3">
            <div>
              <dt className="text-xs text-gray-500">{legacy ? 'Date alerted' : 'Received'}</dt>
              <dd className="text-sm font-medium text-gray-900">{formatDateTime(summary.receivedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Linked case</dt>
              <dd className="text-sm font-medium text-gray-900">
                {log.linkedCase ? (
                  <span className="font-mono">{log.linkedCase.epid}</span>
                ) : (
                  <span className="font-normal text-gray-500">None</span>
                )}
              </dd>
            </div>
            {legacy ? (
              <>
                <div>
                  <dt className="text-xs text-gray-500">Vital status</dt>
                  <dd className="text-sm font-medium text-gray-900">{summary.vitalStatus ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Meets case definition</dt>
                  <dd className="text-sm font-medium text-gray-900">{summary.meetsDefinition ?? '—'}</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="text-xs text-gray-500">Received by</dt>
                  <dd className="text-sm font-medium text-gray-900">{summary.receivedBy ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Risk level</dt>
                  <dd className="text-sm">
                    <RiskChip level={summary.riskLevel} />
                  </dd>
                </div>
              </>
            )}
          </dl>

          {callLogSections(form)
            .filter((s) => !isHidden(s))
            .map((section) => {
              const rows = answeredIn(section, log, legacy);
              if (rows.length === 0) return null;
              return (
                <section key={section.linkId} className="space-y-2">
                  {section.text && (
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-nphi-700 border-b border-nphi-100/60 pb-1.5">
                      {sectionTitle(section.text)}
                    </h4>
                  )}
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
                    {rows.map((r) => (
                      <div key={r.linkId} className={r.wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
                        <dt className="text-xs text-gray-500">{r.label}</dt>
                        <dd className="text-sm font-medium text-gray-900 whitespace-pre-wrap break-words">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
        </div>
      )}
    </Modal>
  );
}

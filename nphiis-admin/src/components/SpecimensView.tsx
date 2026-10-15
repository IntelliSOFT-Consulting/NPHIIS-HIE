'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownTrayIcon, ArrowPathIcon, BeakerIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import {
  SPECIMEN_STATUSES,
  SPECIMEN_STATUS_LABEL,
  describePull,
  type SpecimenStatus,
  type SubmittedSpecimen,
} from '@/lib/specimens';
import { Alert } from './ui/Alert';
import { Select, TextInput } from './ui/Field';
import { TableSkeleton } from './ui/Skeleton';

const FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...SPECIMEN_STATUSES.map((s) => ({ value: s, label: SPECIMEN_STATUS_LABEL[s] })),
];

const PAGE_SIZES = [10, 25, 50, 100] as const;

const STATUS_BADGE: Record<SpecimenStatus, string> = {
  'awaiting-epid': 'bg-gray-100 text-gray-700',
  'submission-failed': 'bg-accent-50 text-accent-700',
  'awaiting-result': 'bg-sky-100 text-sky-800',
  'received-at-lab': 'bg-indigo-100 text-indigo-800',
  'in-testing': 'bg-violet-100 text-violet-800',
  'preliminary-result': 'bg-amber-100 text-amber-800',
  'final-result': 'bg-emerald-100 text-emerald-800',
  'specimen-rejected': 'bg-accent-50 text-accent-700',
};

const RESULT_BADGE: Record<string, string> = {
  Positive: 'bg-accent-50 text-accent-700',
  Negative: 'bg-emerald-100 text-emerald-800',
};

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function formatDateTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function matchesSearch(s: SubmittedSpecimen, term: string): boolean {
  if (!term) return true;
  return [s.label, s.epid, s.patientName, s.county, s.subCounty, s.facility, s.sampleType, s.result]
    .some((v) => v?.toLowerCase().includes(term));
}

export default function SpecimensView() {
  const authedFetch = useAuthedFetch();
  const [specimens, setSpecimens] = useState<SubmittedSpecimen[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullNotice, setPullNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SpecimenStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch('/api/specimens');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setSpecimens(body.specimens as SubmittedSpecimen[]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [authedFetch]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pullResults = async () => {
    setPulling(true);
    setPullNotice(null);
    try {
      const res = await authedFetch('/api/specimens/pull', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setPullNotice(describePull(body));
      await load();
    } catch (e) {
      setPullNotice({ ok: false, message: `Could not pull results: ${(e as Error).message}` });
    } finally {
      setPulling(false);
    }
  };

  const counts = useMemo(() => {
    const out = new Map<SpecimenStatus, number>();
    for (const s of specimens) if (s.status) out.set(s.status, (out.get(s.status) ?? 0) + 1);
    return out;
  }, [specimens]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return specimens.filter((s) => (!filter || s.status === filter) && matchesSearch(s, term));
  }, [specimens, filter, search]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  // Clamp so a page past the end (e.g. after narrowing the search) still shows rows.
  const page = Math.min(currentPage, totalPages);
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      {pullNotice && (
        <Alert variant={pullNotice.ok ? 'success' : 'warning'}>{pullNotice.message}</Alert>
      )}

      {!loading && specimens.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {SPECIMEN_STATUSES.filter((s) => counts.get(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setFilter(filter === s ? '' : s);
                setCurrentPage(1);
              }}
              className={`chip ${STATUS_BADGE[s]} ${filter === s ? 'ring-2 ring-nphi-600' : ''}`}
            >
              {SPECIMEN_STATUS_LABEL[s]} · {counts.get(s)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <TextInput
            placeholder="Search specimen ID, EPID, patient, location or result"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="sm:w-56">
          <Select
            value={filter}
            onChange={(v) => {
              setFilter(v as SpecimenStatus | '');
              setCurrentPage(1);
            }}
            options={FILTER_OPTIONS}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          type="button"
          onClick={pullResults}
          disabled={loading || pulling}
          className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
        >
          <ArrowDownTrayIcon className={`h-4 w-4 ${pulling ? 'animate-bounce' : ''}`} />
          {pulling ? 'Pulling…' : 'Pull results from NPHL'}
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : (
        <div className="card overflow-hidden">
          {visible.length === 0 ? (
            <div className="text-center py-16 px-4">
              <BeakerIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-nphi-900">No specimens</p>
              <p className="mt-1 text-sm text-gray-500">
                {specimens.length
                  ? 'Adjust the search or status filter.'
                  : 'VHF specimens submitted to NPHL will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-nphi-100 text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">Submitted</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Specimen ID</th>
                    <th className="px-4 py-3 font-medium text-gray-600">EPID</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Patient</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Sample</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nphi-100">
                  {pageRows.map((s) => (
                    <Fragment key={s.taskId}>
                      <tr
                        onClick={() => setExpandedId(expandedId === s.taskId ? null : s.taskId)}
                        className="cursor-pointer hover:bg-nphi-50/40 align-top"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                          {formatDate(s.submittedAt)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[14rem] truncate">
                          {s.label}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.epid ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div>{s.patientName ?? '—'}</div>
                          {(s.county || s.subCounty) && (
                            <div className="text-xs text-gray-500">
                              {[s.county, s.subCounty].filter(Boolean).join(' / ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{s.sampleType ?? '—'}</td>
                        <td className="px-4 py-3">
                          {s.status ? (
                            <span className={`chip whitespace-nowrap ${STATUS_BADGE[s.status]}`}>
                              {SPECIMEN_STATUS_LABEL[s.status]}
                            </span>
                          ) : (
                            <span className="text-gray-500">{s.statusText ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {s.result ? (
                            <span
                              className={`chip whitespace-nowrap ${RESULT_BADGE[s.result] ?? 'bg-gray-100 text-gray-700'}`}
                            >
                              {s.result}
                              {s.resultType === 'Preliminary' ? ' (prelim.)' : ''}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedId === s.taskId && <SpecimenDetails specimen={s} />}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
          <div className="text-gray-600">
            Total <span className="font-semibold text-nphi-900">{visible.length}</span> specimens
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
                  setCurrentPage(1);
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
              disabled={page <= 1}
              onClick={() => setCurrentPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setCurrentPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecimenDetails({ specimen: s }: { specimen: SubmittedSpecimen }) {
  const rows: Array<[string, string | undefined]> = [
    ['Status', s.statusText],
    ['Reason', s.statusReason],
    ['Facility', s.facility],
    ['Collected', formatDateTime(s.collectedAt)],
    ['Submitted to NPHL', formatDateTime(s.submittedAt)],
    ['Last updated', formatDateTime(s.updatedAt)],
    ['Result', s.result && `${s.result}${s.resultType ? ` (${s.resultType})` : ''}`],
    ['Result date', s.resultDate && formatDateTime(s.resultDate)],
    ['Testing laboratory', s.testingLab],
    ['Rejected by', s.rejectedBy],
    ['Rejected on', s.rejectedOn && formatDateTime(s.rejectedOn)],
  ];
  return (
    <tr className="bg-nphi-50/30">
      <td colSpan={7} className="px-4 py-4 space-y-4">
        {s.labelIsFhirId && (
          <Alert variant="warning">
            This specimen had no tube label, so it was sent to NPHL with its system ID. A result
            only comes back if the lab records the same ID.
          </Alert>
        )}
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {rows
            .filter(([, value]) => value && value !== '—')
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-gray-500">{label}</dt>
                <dd className="text-gray-800 whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
        </dl>
        {s.tests.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Tests</div>
            <table className="min-w-[20rem] text-sm">
              <tbody className="divide-y divide-nphi-100">
                {s.tests.map((t, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-6 text-gray-700">{t.name}</td>
                    <td className="py-1.5 font-medium text-gray-900">{t.result || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

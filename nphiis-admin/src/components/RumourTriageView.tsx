'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/pagination';
import {
  RUMOUR_PRIORITIES,
  type RumourPriority,
  type RumourReport,
} from '@/lib/rumours';
import { Alert } from './ui/Alert';
import { Select, TextInput } from './ui/Field';
import { TableSkeleton } from './ui/Skeleton';

const UNSET = 'unset';
type PriorityFilter = RumourPriority | typeof UNSET | '';

const FILTER_OPTIONS = [
  { value: '', label: 'All priorities' },
  ...RUMOUR_PRIORITIES.map((p) => ({ value: p, label: p })),
  { value: UNSET, label: 'Not prioritised' },
];

const PRIORITY_OPTIONS = RUMOUR_PRIORITIES.map((p) => ({ value: p, label: p }));

const BADGE: Record<RumourPriority, string> = {
  High: 'bg-accent-50 text-accent-700',
  Medium: 'bg-amber-100 text-amber-800',
  Low: 'bg-emerald-100 text-emerald-800',
};

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

export default function RumourTriageView() {
  const authedFetch = useAuthedFetch();
  const [rumours, setRumours] = useState<RumourReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<PriorityFilter>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

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
        if (filter) query.set('priority', filter);
        const res = await authedFetch(`/api/rumours?${query}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (!cancelled) {
          setRumours(body.rumours as RumourReport[]);
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
  }, [authedFetch, page, pageSize, debouncedSearch, filter]);

  const setPriority = useCallback(
    async (patientId: string, priority: RumourPriority) => {
      setSavingId(patientId);
      setError(null);
      try {
        const res = await authedFetch(`/api/rumours/${encodeURIComponent(patientId)}/priority`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        const prioritySetAt = new Date().toISOString();
        setRumours((prev) =>
          prev.map((r) => (r.patientId === patientId ? { ...r, priority, prioritySetAt } : r)),
        );
      } catch (e) {
        setError(`Could not save priority: ${(e as Error).message}`);
      } finally {
        setSavingId(null);
      }
    },
    [authedFetch],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = !!(debouncedSearch || filter);

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <TextInput
            placeholder="Search EPID, location, message or source"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <Select
            value={filter}
            onChange={(v) => {
              setFilter(v as PriorityFilter);
              setPage(1);
            }}
            options={FILTER_OPTIONS}
          />
        </div>
      </div>

      {!loaded ? (
        <TableSkeleton rows={6} cols={6} />
      ) : (
        <div className={`card overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {rumours.length === 0 ? (
            <div className="text-center py-16 px-4">
              <ChatBubbleLeftEllipsisIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-nphi-900">No rumour reports</p>
              <p className="mt-1 text-sm text-gray-500">
                {filtered
                  ? 'Adjust the search or priority filter.'
                  : 'Reports submitted from the mobile Rumor Tracking Tool will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-nphi-100 text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">Reported</th>
                    <th className="px-4 py-3 font-medium text-gray-600">EPID</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Location</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Source</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Report</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Investigated</th>
                    <th className="px-4 py-3 font-medium text-gray-600 w-44">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nphi-100">
                  {rumours.map((r) => (
                    <Fragment key={r.patientId}>
                      <tr
                        onClick={() => setExpandedId(expandedId === r.patientId ? null : r.patientId)}
                        className="cursor-pointer hover:bg-nphi-50/40 align-top"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-gray-800">{formatDate(r.reportedAt)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.epid ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {[r.county, r.subCounty].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{r.source ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                          {r.rumour ?? r.harmfulPractice ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.investigated ?? '—'}
                          {r.investigationResult ? ` · ${r.investigationResult}` : ''}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            {r.priority && <span className={`chip ${BADGE[r.priority]}`}>{r.priority}</span>}
                            <div className="flex-1 min-w-[7rem]">
                              <Select
                                value={r.priority ?? ''}
                                onChange={(v) => setPriority(r.patientId, v as RumourPriority)}
                                options={PRIORITY_OPTIONS}
                                placeholder="Set…"
                                disabled={savingId === r.patientId}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                      {expandedId === r.patientId && <RumourDetails report={r} />}
                    </Fragment>
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
            Total <span className="font-semibold text-nphi-900">{total}</span> reports
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
    </div>
  );
}

function RumourDetails({ report: r }: { report: RumourReport }) {
  const rows: Array<[string, string | undefined]> = [
    ['Ward', r.ward],
    ['Village / Community health unit', r.village],
    ['Reporting cadre', r.reporterCadre],
    ['Agency', r.agency],
    ['Rumour / misinformation reported', r.rumour],
    ['Harmful practice reported', r.harmfulPractice],
    ['Investigation result', r.investigationResult],
    ['Conclusion / recommendations', r.conclusion],
    ['Priority last set', r.prioritySetAt ? new Date(r.prioritySetAt).toLocaleString() : undefined],
  ];
  return (
    <tr className="bg-nphi-50/30">
      <td colSpan={7} className="px-4 py-4">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] uppercase tracking-wider text-gray-500">{label}</dt>
              <dd className="text-gray-800 whitespace-pre-wrap">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </td>
    </tr>
  );
}

'use client';

import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useState } from 'react';
import { callbackLogsApi, getAccessToken } from '@/lib/api';
import type { CallbackLog } from '@/types/callback-log';
import Spinner from '@/components/ui/Spinner';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/pagination';

const ROUTE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All routes' },
  { value: 'encounter-notification', label: 'Encounter notification' },
  { value: 'observation-notification', label: 'Observation notification' },
  { value: 'backfill-run', label: 'Backfill run' },
  { value: 'assign-ids', label: 'Assign IDs' },
  { value: 'retry-epid', label: 'Retry EPID' },
  { value: 'afp-follow-up', label: 'AFP follow-up' },
];

const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'skipped', label: 'Skipped' },
] as const;

const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: 'All resource types' },
  { value: 'Encounter', label: 'Encounter' },
  { value: 'Observation', label: 'Observation' },
] as const;

function outcomeBadgeClasses(outcome: CallbackLog['outcome']): string {
  switch (outcome) {
    case 'success':
      return 'bg-emerald-100 text-emerald-800';
    case 'error':
      return 'bg-red-100 text-red-800';
    case 'skipped':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function truncate(s: string | null | undefined, max: number): string {
  if (s == null || s === '') return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function CallbackLogList() {
  const [logs, setLogs] = useState<CallbackLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadNeutral, setLoadNeutral] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const [route, setRoute] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<CallbackLog | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  const loadLogs = useCallback(async () => {
    void refreshSeq;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setLoadNeutral(false);
      setPermissionDenied(false);
      setLoading(false);
      setLogs([]);
      return;
    }
    try {
      setLoading(true);
      setLoadNeutral(false);
      setPermissionDenied(false);
      const response = await callbackLogsApi.getLogs(accessToken, {
        page: currentPage,
        limit: pageSize,
        ...(outcome && { outcome }),
        ...(route && { route }),
        ...(resourceType && { resourceType }),
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
      });
      if (response.status === 'success') {
        setLogs(response.logs);
        setTotal(response.total);
        setTotalPages(response.totalPages);
      } else {
        setLogs([]);
        setLoadNeutral(true);
      }
    } catch (err: unknown) {
      console.error('Callback logs load error:', err);
      setLogs([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) setPermissionDenied(true);
      else setLoadNeutral(true);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    debouncedSearch,
    outcome,
    route,
    resourceType,
    refreshSeq,
  ]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <>
      <div className="space-y-6">
        <div className="bg-white rounded-3xl shadow-card border border-nphi-100/60 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-nphi-900">Subscription logs</h2>
              <p className="text-sm text-gray-600 mt-1">
                FHIR REST-hook callbacks and manual subscription-related actions audited in hie-auth.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshSeq((n) => n + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-nphi-50 text-nphi-900 hover:bg-nphi-100 border border-nphi-100 transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {!getAccessToken() && (
            <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Sign in again to view subscription logs.
            </p>
          )}

          {permissionDenied && (
            <p className="mt-4 text-sm text-nphi-900 bg-nphi-50 border border-nphi-100 rounded-xl px-4 py-3">
              Administrator access is required to view subscription logs.
            </p>
          )}

          {loadNeutral && !permissionDenied && getAccessToken() && (
            <p className="mt-4 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              Unable to load logs. Use Refresh to try again.
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by resource ID…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-nphi-100 focus:ring-2 focus:ring-accent-400 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 px-3 rounded-xl border border-nphi-100 text-sm bg-white"
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={route}
              onChange={(e) => {
                setRoute(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 px-3 rounded-xl border border-nphi-100 text-sm bg-white"
            >
              {ROUTE_OPTIONS.map((r) => (
                <option key={r.value || 'all-routes'} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 px-3 rounded-xl border border-nphi-100 text-sm bg-white xl:col-span-1 md:col-span-2"
            >
              {RESOURCE_TYPE_OPTIONS.map((r) => (
                <option key={r.value || 'all-types'} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-card border border-nphi-100/60 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20">
              <Spinner size="lg" label="Loading logs…" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 px-4">
              <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-nphi-900">No log entries</p>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? 'Adjust filters or clear search.' : 'Webhook callbacks will appear here after subscriptions run.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-nphi-100 text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Route</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Resource</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">HTTP</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Outcome</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nphi-100">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer hover:bg-accent-50/40 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{truncate(log.route, 40)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-nphi-800">{log.resourceType}</span>
                        <span className="block font-mono text-xs text-gray-600">
                          {log.resourceId ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{log.httpStatus}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${outcomeBadgeClasses(log.outcome)}`}>
                          {log.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.durationMs != null ? `${log.durationMs} ms` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && logs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
            <div className="text-gray-600">
              Total <span className="font-semibold text-nphi-900">{total}</span> entries
              <span className="mx-2">·</span>
              Page {currentPage} of {Math.max(totalPages, 1)}
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
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-nphi-900/40 backdrop-blur-sm">
          <div
            role="dialog"
            aria-labelledby="callback-log-detail-title"
            className="bg-white rounded-3xl shadow-card-lg w-full max-w-2xl max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-nphi-100/60">
              <h3 id="callback-log-detail-title" className="text-lg font-semibold text-nphi-900">
                Callback log detail
              </h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4 text-sm">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <dt className="text-gray-500">Time</dt>
                  <dd className="font-medium text-nphi-900">
                    {new Date(selectedLog.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Outcome</dt>
                  <dd>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${outcomeBadgeClasses(selectedLog.outcome)}`}>
                      {selectedLog.outcome}
                    </span>
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Route</dt>
                  <dd className="font-mono text-xs text-nphi-900 break-all">{selectedLog.route}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Resource type</dt>
                  <dd>{selectedLog.resourceType}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Resource ID</dt>
                  <dd className="font-mono text-xs">{selectedLog.resourceId ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">HTTP status</dt>
                  <dd>{selectedLog.httpStatus}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Duration</dt>
                  <dd>{selectedLog.durationMs != null ? `${selectedLog.durationMs} ms` : '—'}</dd>
                </div>
              </dl>

              {selectedLog.errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">Error message</p>
                  <p className="mt-2 text-sm text-red-900 whitespace-pre-wrap break-words">
                    {selectedLog.errorMessage}
                  </p>
                </div>
              )}

              {selectedLog.detail != null && Object.keys(selectedLog.detail).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Detail (JSON)</p>
                  <pre className="text-xs bg-gray-900 text-gray-100 rounded-xl p-4 overflow-x-auto max-h-56">
                    {JSON.stringify(selectedLog.detail, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

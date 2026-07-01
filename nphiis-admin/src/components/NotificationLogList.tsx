'use client';

import {
  ArrowPathIcon,
  BellAlertIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useState } from 'react';
import { getAccessToken, notificationLogsApi } from '@/lib/api';
import type { NotificationLog } from '@/types/notification-log';
import Spinner from '@/components/ui/Spinner';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
] as const;

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'AFP_FOLLOW_UP', label: 'AFP follow-up' },
  { value: 'CASE_SUBMISSION', label: 'Case submission' },
] as const;

function statusBadgeClasses(status: NotificationLog['status']): string {
  switch (status) {
    case 'SENT':
      return 'bg-emerald-100 text-emerald-800';
    case 'FAILED':
      return 'bg-red-100 text-red-800';
    case 'PENDING':
    default:
      return 'bg-amber-100 text-amber-800';
  }
}

function typeLabel(type: NotificationLog['type']): string {
  switch (type) {
    case 'CASE_SUBMISSION':
      return 'Case submission';
    case 'AFP_FOLLOW_UP':
    default:
      return 'AFP follow-up';
  }
}

function truncate(s: string | null | undefined, max: number): string {
  if (s == null || s === '') return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function NotificationLogList() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadNeutral, setLoadNeutral] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null);
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
      const response = await notificationLogsApi.getLogs(accessToken, {
        page: currentPage,
        limit: pageSize,
        ...(status && { status }),
        ...(type && { type }),
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
      });
      if (response.status === 'success') {
        setLogs(response.notifications);
        setTotal(response.total);
        setTotalPages(response.totalPages);
      } else {
        setLogs([]);
        setLoadNeutral(true);
      }
    } catch (err: unknown) {
      console.error('Notification logs load error:', err);
      setLogs([]);
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 403) setPermissionDenied(true);
      else setLoadNeutral(true);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, status, type, refreshSeq]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <>
      <div className="space-y-6">
        <div className="bg-white rounded-3xl shadow-card border border-nphi-100/60 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-nphi-900">Notification logs</h2>
              <p className="text-sm text-gray-600 mt-1">
                AFP follow-up reminders and case submission notifications stored in hie-auth.
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
              Sign in again to view notification logs.
            </p>
          )}

          {permissionDenied && (
            <p className="mt-4 text-sm text-nphi-900 bg-nphi-50 border border-nphi-100 rounded-xl px-4 py-3">
              Administrator access is required to view notification logs.
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
                placeholder="Search by encounter ID…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-nphi-100 focus:ring-2 focus:ring-accent-400 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 px-3 rounded-xl border border-nphi-100 text-sm bg-white"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all-statuses'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setCurrentPage(1);
              }}
              className="py-2 px-3 rounded-xl border border-nphi-100 text-sm bg-white"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value || 'all-types'} value={o.value}>
                  {o.label}
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
              <BellAlertIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-nphi-900">No notification records</p>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? 'Adjust filters or clear search.' : 'Notifications will appear here after they are created.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-nphi-100 text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Practitioner</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Encounter</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Due date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Email sent</th>
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
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {truncate(log.practitionerId, 24)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {truncate(log.encounterId, 24)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{typeLabel(log.type)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClasses(log.status)}`}
                        >
                          {log.status}
                          {log.status === 'FAILED' && log.failureReason && (
                            <ExclamationTriangleIcon
                              className="h-3.5 w-3.5 shrink-0"
                              title="Failure reason available"
                              aria-label="Failure reason available"
                            />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {new Date(log.dueDate).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {log.caseSubmissionEmailSentAt
                          ? new Date(log.caseSubmissionEmailSentAt).toLocaleString()
                          : '—'}
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
                  {[10, 25, 50, 100].map((n) => (
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
            aria-labelledby="notification-log-detail-title"
            className="bg-white rounded-3xl shadow-card-lg w-full max-w-2xl max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-nphi-100/60">
              <h3 id="notification-log-detail-title" className="text-lg font-semibold text-nphi-900">
                Notification detail
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
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium text-nphi-900">
                    {new Date(selectedLog.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Updated</dt>
                  <dd className="font-medium text-nphi-900">
                    {new Date(selectedLog.updatedAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClasses(selectedLog.status)}`}
                    >
                      {selectedLog.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Type</dt>
                  <dd>{typeLabel(selectedLog.type)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Practitioner ID</dt>
                  <dd className="font-mono text-xs break-all">{selectedLog.practitionerId}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Encounter ID</dt>
                  <dd className="font-mono text-xs break-all">{selectedLog.encounterId}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Due date</dt>
                  <dd>{new Date(selectedLog.dueDate).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Investigation date</dt>
                  <dd>
                    {selectedLog.investigationDate
                      ? new Date(selectedLog.investigationDate).toLocaleString()
                      : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Email sent</dt>
                  <dd>
                    {selectedLog.caseSubmissionEmailSentAt
                      ? new Date(selectedLog.caseSubmissionEmailSentAt).toLocaleString()
                      : '—'}
                  </dd>
                </div>
                {selectedLog.failureReason && (
                  <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">
                      Failure reason
                    </p>
                    <p className="mt-2 text-sm text-red-900 whitespace-pre-wrap break-words">
                      {selectedLog.failureReason}
                    </p>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Title</dt>
                  <dd className="font-medium text-nphi-900">{selectedLog.title}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Body</dt>
                  <dd className="whitespace-pre-wrap break-words text-gray-800">{selectedLog.body}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

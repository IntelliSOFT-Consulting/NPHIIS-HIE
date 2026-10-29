'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { epidRetryApi, getAccessToken } from '@/lib/api';
import type { EpidRetryResult, MissingEpidEncounter } from '@/types/notification-log';
import Spinner from '@/components/ui/Spinner';

const MAX_BATCH = 50;
const PAGE_SIZE = 25;

const DISEASES = [
  { value: '', label: 'All diseases' },
  { value: 'VHF', label: 'VHF' },
  { value: 'MEA', label: 'Measles' },
  { value: 'AFP', label: 'AFP' },
  { value: 'MOH505', label: 'MOH 505' },
];

type Filters = { condition: string; from: string; to: string; q: string };
const EMPTY_FILTERS: Filters = { condition: '', from: '', to: '', q: '' };

function parseEncounterIds(raw: string): string[] {
  const ids = raw.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

function resultBadgeClasses(ok: boolean): string {
  return ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';
}

function formatCreatedAt(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function EpidRetryPanel() {
  const [encounters, setEncounters] = useState<MissingEpidEncounter[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  /** Search box text; copied into filters.q once typing pauses. */
  const [searchInput, setSearchInput] = useState('');

  const [manualInput, setManualInput] = useState('');
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [results, setResults] = useState<EpidRetryResult[]>([]);
  const [orderedEncounterIds, setOrderedEncounterIds] = useState<string[]>([]);

  const parsedManualIds = useMemo(() => parseEncounterIds(manualInput), [manualInput]);
  const manualTooMany = parsedManualIds.length > MAX_BATCH;
  const currentCursor = cursorStack[cursorIndex] ?? null;

  const loadEncounters = useCallback(async () => {
    void refreshSeq;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setPermissionDenied(false);
      setListError(null);
      setListLoading(false);
      setEncounters([]);
      return;
    }

    try {
      setListLoading(true);
      setListError(null);
      setPermissionDenied(false);
      const response = await epidRetryApi.listMissing(accessToken, {
        limit: PAGE_SIZE,
        cursor: currentCursor,
        ...filters,
      });
      if (response.status === 'success') {
        setEncounters(response.encounters);
        setNextCursor(response.nextCursor);
        setHasMore(response.hasMore);
        setSelectedIds(new Set());
      } else {
        setEncounters([]);
        setListError('Unable to load encounters missing EPID.');
      }
    } catch (err: unknown) {
      setEncounters([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setPermissionDenied(true);
      } else {
        setListError(
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            (err as Error)?.message ??
            'Unable to load encounters missing EPID.',
        );
      }
    } finally {
      setListLoading(false);
    }
  }, [currentCursor, refreshSeq, filters]);

  useEffect(() => {
    loadEncounters();
  }, [loadEncounters]);

  /** Any filter change starts again from the first page. */
  const updateFilters = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setCursorStack([null]);
    setCursorIndex(0);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== filters.q) updateFilters({ q: searchInput.trim() });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filtersActive =
    filters.condition !== '' || filters.from !== '' || filters.to !== '' || filters.q !== '';

  const clearFilters = () => {
    setSearchInput('');
    updateFilters(EMPTY_FILTERS);
  };

  const pageEncounterIds = useMemo(
    () => encounters.map((row) => row.encounterId),
    [encounters],
  );
  const allOnPageSelected =
    pageEncounterIds.length > 0 && pageEncounterIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const selectionOverLimit = selectedCount > MAX_BATCH;

  const toggleRow = (encounterId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(encounterId)) {
        next.delete(encounterId);
      } else if (next.size < MAX_BATCH) {
        next.add(encounterId);
      }
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageEncounterIds) next.delete(id);
        return next;
      }
      for (const id of pageEncounterIds) {
        if (next.size >= MAX_BATCH) break;
        next.add(id);
      }
      return next;
    });
  };

  const runRetry = async (encounterIds: string[]) => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      setRetryError('Sign in again to retry EPID assignment.');
      return;
    }
    if (encounterIds.length === 0) {
      setRetryError('Select at least one encounter.');
      return;
    }
    if (encounterIds.length > MAX_BATCH) {
      setRetryError(`At most ${MAX_BATCH} encounter IDs per request.`);
      return;
    }

    setRetryLoading(true);
    setRetryError(null);
    setResults([]);
    setOrderedEncounterIds([]);

    try {
      const response = await epidRetryApi.retry(accessToken, encounterIds);
      setResults(response.results ?? []);
      setOrderedEncounterIds(response.orderedEncounterIds ?? []);
      setSelectedIds(new Set());
      setRefreshSeq((n) => n + 1);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as Error)?.message ??
        'Failed to retry EPID assignment.';
      if (status === 403) {
        setRetryError('Administrator access is required to retry EPID assignment.');
      } else {
        setRetryError(message);
      }
    } finally {
      setRetryLoading(false);
    }
  };

  const handleRetrySelected = () => {
    runRetry(Array.from(selectedIds));
  };

  const handleManualRetry = () => {
    runRetry(parsedManualIds);
  };

  const handleRefresh = () => {
    setCursorStack([null]);
    setCursorIndex(0);
    setRefreshSeq((n) => n + 1);
  };

  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorStack((stack) => {
      const trimmed = stack.slice(0, cursorIndex + 1);
      return [...trimmed, nextCursor];
    });
    setCursorIndex((i) => i + 1);
  };

  const handlePreviousPage = () => {
    if (cursorIndex <= 0) return;
    setCursorIndex((i) => i - 1);
  };

  const successCount = results.filter((r) => r.ok).length;
  const failedCount = results.filter((r) => !r.ok).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-card border border-nphi-100/60 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-nphi-900">Encounters missing EPID</h2>
            <p className="text-sm text-gray-600 mt-1">
              Select encounters whose patients do not yet have an official EPID, then retry assignment
              (max {MAX_BATCH} per request).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-nphi-50 text-nphi-900 hover:bg-nphi-100 border border-nphi-100 transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleRetrySelected}
              disabled={
                retryLoading ||
                selectedCount === 0 ||
                selectionOverLimit ||
                !getAccessToken()
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-nphi-gradient text-white shadow-sm disabled:opacity-50"
            >
              {retryLoading ? <Spinner size="sm" /> : <ArrowPathIcon className="h-4 w-4" />}
              Retry selected
            </button>
          </div>
        </div>

        {!getAccessToken() && (
          <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Sign in again to view encounters missing EPID.
          </p>
        )}

        {permissionDenied && (
          <p className="mt-4 text-sm text-nphi-900 bg-nphi-50 border border-nphi-100 rounded-xl px-4 py-3">
            Administrator access is required to view encounters missing EPID.
          </p>
        )}

        {listError && !permissionDenied && getAccessToken() && (
          <p className="mt-4 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            {listError}
          </p>
        )}

        {retryError && (
          <p className="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {retryError}
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Search
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, patient / encounter ID, contact ID…"
              className="rounded-xl border border-nphi-100 px-3 py-2 text-sm font-normal text-gray-900 focus:ring-2 focus:ring-accent-400 focus:border-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Disease
            <select
              value={filters.condition}
              onChange={(e) => updateFilters({ condition: e.target.value })}
              className="rounded-xl border border-nphi-100 px-3 py-2 text-sm font-normal text-gray-900 bg-white focus:ring-2 focus:ring-accent-400 focus:border-transparent"
            >
              {DISEASES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Created from
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => updateFilters({ from: e.target.value })}
              className="rounded-xl border border-nphi-100 px-3 py-2 text-sm font-normal text-gray-900 focus:ring-2 focus:ring-accent-400 focus:border-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Created to
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => updateFilters({ to: e.target.value })}
              className="rounded-xl border border-nphi-100 px-3 py-2 text-sm font-normal text-gray-900 focus:ring-2 focus:ring-accent-400 focus:border-transparent"
            />
          </label>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive && searchInput === ''}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-nphi-100 text-nphi-900 hover:bg-gray-50 disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
          <span>
            {selectedCount} selected
            {selectionOverLimit ? (
              <span className="text-red-700"> · exceeds limit of {MAX_BATCH}</span>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={cursorIndex <= 0 || listLoading}
              onClick={handlePreviousPage}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!hasMore || !nextCursor || listLoading}
              onClick={handleNextPage}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-card border border-nphi-100/60 overflow-hidden">
        {listLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" label="Scanning encounters…" />
          </div>
        ) : encounters.length === 0 ? (
          <div className="text-center py-16 px-4">
            <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-nphi-900">
              {filtersActive ? 'No encounters match these filters' : 'No encounters missing EPID'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {hasMore
                ? 'Try the next page or refresh to scan further.'
                : 'All scanned encounters already have an official EPID on the patient.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-nphi-100 text-sm">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                      aria-label="Select all on page"
                      className="rounded border-nphi-200 text-accent-600 focus:ring-accent-400"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Encounter ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nphi-100">
                {encounters.map((row) => {
                  const checked = selectedIds.has(row.encounterId);
                  const disabled = !checked && selectedIds.size >= MAX_BATCH;
                  return (
                    <tr
                      key={row.encounterId}
                      className={`hover:bg-accent-50/40 transition-colors ${checked ? 'bg-accent-50/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleRow(row.encounterId)}
                          aria-label={`Select encounter ${row.encounterId}`}
                          className="rounded border-nphi-200 text-accent-600 focus:ring-accent-400 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-800">{row.encounterId}</td>
                      <td className="px-4 py-3">
                        {row.patientName && (
                          <div className="text-sm text-gray-900">{row.patientName}</div>
                        )}
                        <div className="font-mono text-xs text-gray-500">{row.patientId}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {formatCreatedAt(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.conditionLabel ?? row.conditionCode ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className="bg-white rounded-3xl shadow-card border border-nphi-100/60 p-6">
        <summary className="cursor-pointer text-sm font-medium text-nphi-900">
          Add encounter IDs manually
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-600">
            Enter one or more encounter IDs separated by commas or new lines (max {MAX_BATCH}).
          </p>
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            rows={5}
            placeholder={'Encounter IDs, e.g.\nabc-123\nxyz-456'}
            className="w-full rounded-xl border border-nphi-100 px-4 py-3 text-sm focus:ring-2 focus:ring-accent-400 focus:border-transparent font-mono"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              {parsedManualIds.length} encounter ID{parsedManualIds.length === 1 ? '' : 's'} parsed
              {manualTooMany ? (
                <span className="text-red-700"> · exceeds limit of {MAX_BATCH}</span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={handleManualRetry}
              disabled={
                retryLoading ||
                manualTooMany ||
                parsedManualIds.length === 0 ||
                !getAccessToken()
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-nphi-50 text-nphi-900 hover:bg-nphi-100 border border-nphi-100 transition-colors disabled:opacity-50"
            >
              {retryLoading ? <Spinner size="sm" /> : <ArrowPathIcon className="h-4 w-4" />}
              Retry manual IDs
            </button>
          </div>
        </div>
      </details>

      {results.length > 0 && (
        <div className="bg-white rounded-3xl shadow-card border border-nphi-100/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-nphi-100/60 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-nphi-900">Results</h3>
              <p className="text-sm text-gray-600">
                {successCount} succeeded · {failedCount} failed
              </p>
            </div>
            {orderedEncounterIds.length > 0 && (
              <p className="text-xs text-gray-500">
                Processed in v1 history order ({orderedEncounterIds.length} encounters)
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-nphi-100 text-sm">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Encounter ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Outcome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nphi-100">
                {results.map((result) => (
                  <tr key={result.encounterId}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{result.encounterId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${resultBadgeClasses(result.ok)}`}
                      >
                        {result.ok ? (
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                        ) : (
                          <XCircleIcon className="h-3.5 w-3.5" />
                        )}
                        {result.ok ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {result.error ?? (result.ok ? 'EPID assigned or already present' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

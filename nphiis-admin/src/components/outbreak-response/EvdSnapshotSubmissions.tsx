'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthedFetch } from '@/lib/auth-context';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/pagination';
import { isIsoDate, todayInKenya, type SnapshotSummary } from '@/lib/evd-snapshot';
import { Alert } from '../ui/Alert';
import { DateInput, Select } from '../ui/Field';
import { TableSkeleton } from '../ui/Skeleton';

const API = '/api/outbreak-response/evd-snapshot';

interface Status {
  date: string;
  expected: number;
  submitted: number;
  onTime: number;
  missing: Array<{ id: string; name: string; county: string }>;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' });
}

export default function EvdSnapshotSubmissions({
  refreshKey,
  onEdit,
}: {
  /** Changes when a snapshot was just saved, to reload. */
  refreshKey: number;
  onEdit: (id: string) => void;
}) {
  const authedFetch = useAuthedFetch();
  const [date, setDate] = useState(todayInKenya());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [rows, setRows] = useState<SnapshotSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (isIsoDate(date)) q.set('date', date);
      const listRes = await authedFetch(`${API}?${q}`);
      const list = await listRes.json().catch(() => ({}));
      if (!listRes.ok) throw new Error(list.error || `Could not load snapshots (${listRes.status})`);
      setRows(list.snapshots ?? []);
      setTotal(list.total ?? 0);
      if (isIsoDate(date)) {
        const sRes = await authedFetch(`${API}?${new URLSearchParams({ view: 'status', date })}`);
        setStatus(sRes.ok ? await sRes.json() : null);
      } else {
        setStatus(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [authedFetch, date, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pct = status && status.expected ? Math.round((status.submitted / status.expected) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-56">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Reporting date</label>
          <DateInput
            value={date}
            onChange={(v) => {
              setDate(v);
              setPage(1);
            }}
            noFuture
          />
        </div>
        <button type="button" className="btn-secondary" onClick={() => { setDate(''); setPage(1); }}>
          All dates
        </button>
        <button type="button" className="btn-secondary" onClick={() => { setDate(todayInKenya()); setPage(1); }}>
          Today
        </button>
      </div>

      {status && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Sub-counties reporting for {date}</p>
              <p className="text-2xl font-semibold text-nphi-900">
                {status.submitted} <span className="text-base font-normal text-gray-500">of {status.expected} ({pct}%)</span>
              </p>
              <p className="text-xs text-gray-500">{status.onTime} on time (by 09:00 EAT)</p>
            </div>
            {status.missing.length > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setShowMissing((s) => !s)}>
                {showMissing ? 'Hide' : 'Show'} {status.missing.length} not yet reported
              </button>
            )}
          </div>
          <div className="mt-3 h-2 rounded-full bg-nphi-50 overflow-hidden" aria-hidden>
            <div className="h-full bg-nphi-600" style={{ width: `${pct}%` }} />
          </div>
          {showMissing && (
            <ul className="mt-4 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-sm text-gray-700 max-h-64 overflow-y-auto">
              {status.missing.map((m) => (
                <li key={m.id}>
                  {m.name} <span className="text-gray-400">· {m.county}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={7} />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No snapshots {isIsoDate(date) ? `for ${date}` : 'yet'}.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-nphi-50/60 text-left text-xs uppercase tracking-wide text-nphi-800">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">County</th>
                <th className="px-4 py-3">Sub-county</th>
                <th className="px-4 py-3">Focal person</th>
                <th className="px-4 py-3 text-right">Suspected</th>
                <th className="px-4 py-3 text-right">Lab +</th>
                <th className="px-4 py-3 text-right">Contacts lost</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-nphi-100/60">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-nphi-50/40">
                  <td className="px-4 py-3 whitespace-nowrap">{s.reportingDate}</td>
                  <td className="px-4 py-3">{s.county}</td>
                  <td className="px-4 py-3">{s.subCounty}</td>
                  <td className="px-4 py-3">
                    {s.focalPerson}
                    <div className="text-xs text-gray-500">{s.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.counts['a-suspected-cases']}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.counts['a-lab-positive']}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.counts['b-contacts-lost']}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(s.submittedAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.onTime ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {s.onTime ? 'On time' : 'Late'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="text-nphi-700 hover:underline" onClick={() => onEdit(s.id)}>
                      View / edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <span>{total} snapshot{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-3">
          <div className="w-24">
            <Select
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} / page` }))}
            />
          </div>
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

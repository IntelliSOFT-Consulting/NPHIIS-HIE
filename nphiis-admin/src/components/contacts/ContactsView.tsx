'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { UserGroupIcon, ArrowUpTrayIcon, UserPlusIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import type { Board, BoardContact, ContactStatus, DayState, RemovedContact } from '@/lib/fhir-contacts';
import { Alert } from '../ui/Alert';
import { Select, TextInput } from '../ui/Field';
import { TableSkeleton } from '../ui/Skeleton';
import AddContacts, { type SaveSummary } from './AddContacts';
import FollowUpForm from './FollowUpForm';

const STATUS: Record<ContactStatus, { label: string; chip: string }> = {
  active: { label: 'Under follow up', chip: 'bg-nphi-50 text-nphi-800' },
  flagged: { label: 'Symptomatic', chip: 'bg-accent-50 text-accent-700' },
  completed: { label: 'Completed', chip: 'bg-emerald-100 text-emerald-800' },
  converted: { label: 'Became a case', chip: 'bg-purple-100 text-purple-800' },
  lost: { label: 'Lost to follow up', chip: 'bg-amber-100 text-amber-800' },
  died: { label: 'Died', chip: 'bg-gray-200 text-gray-700' },
};

const DAY_CELL: Record<DayState, string> = {
  seen: 'bg-emerald-500',
  symptomatic: 'bg-accent-600',
  missed: 'bg-amber-400',
  due: 'bg-white ring-2 ring-nphi-600',
  upcoming: 'bg-gray-200',
};
const DAY_LABEL: Record<DayState, string> = {
  seen: 'followed up, no symptoms',
  symptomatic: 'symptomatic',
  missed: 'missed',
  due: 'due today',
  upcoming: 'upcoming',
};

type Filter = '' | 'due' | 'missed' | 'flagged';
const FILTERS: Array<{ value: Filter; label: string; test: (c: BoardContact) => boolean }> = [
  { value: '', label: 'All', test: () => true },
  { value: 'due', label: 'Due today', test: (c) => c.dueToday },
  { value: 'missed', label: 'Missed days', test: (c) => c.missedDays.length > 0 && (c.status === 'active' || c.status === 'lost') },
  { value: 'flagged', label: 'Symptomatic', test: (c) => c.status === 'flagged' },
];

const PAGE_SIZES = [10, 25, 50, 100];
const norm = (t?: string | null) => (t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const digits = (t?: string | null) => (t ?? '').replace(/\D/g, '');

const formatDay = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString() : '—');

function DayGrid({ contact }: { contact: BoardContact }) {
  return (
    <div className="flex gap-0.5" aria-label="21-day follow up">
      {contact.days.map((d) => (
        <span
          key={d.day}
          title={`Day ${d.day} (${formatDay(d.date)}): ${DAY_LABEL[d.state]}`}
          className={`h-3.5 w-2.5 rounded-sm ${DAY_CELL[d.state]}`}
        />
      ))}
    </div>
  );
}

export default function ContactsView() {
  const authedFetch = useAuthedFetch();
  const [query, setQuery] = useState('');
  const [caseId, setCaseId] = useState('');
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ContactStatus>('');
  const [relationshipFilter, setRelationshipFilter] = useState('');
  const [countyFilter, setCountyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | 'file' | 'hand'>(null);
  // Contacts ticked for removal, and the ones just removed (for Undo).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [undo, setUndo] = useState<string[] | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  // Remember the case looked up last (per browser).
  useEffect(() => {
    try {
      const last = window.localStorage.getItem('contacts.lastCase');
      if (last) {
        setQuery(last);
        setCaseId(last);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await authedFetch(`/api/contacts?id=${encodeURIComponent(caseId)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (!cancelled) setBoard(body as Board);
        try {
          window.localStorage.setItem('contacts.lastCase', caseId);
        } catch {
          /* storage unavailable */
        }
      } catch (e) {
        if (!cancelled) {
          setBoard(null);
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, caseId]);

  const post = useCallback(
    async (url: string, payload: unknown) => {
      const res = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      return body;
    },
    [authedFetch],
  );

  const reload = useCallback(async () => {
    if (!board) return;
    setBoard((await post(`/api/contacts/lists/${board.indexCase.encounterId}`, {})) as Board);
  }, [board, post]);

  const convert = useCallback(
    async (c: BoardContact) => {
      if (!board) return;
      if (!window.confirm(`Convert ${c.name} to a suspected case? This gives the record a Case ID, sends it to NPHL and alerts the national team.`)) return;
      setBusyId(c.encounterId);
      setError(null);
      try {
        await post(`/api/contacts/${c.encounterId}/convert`, { indexEncounterId: board.indexCase.encounterId, caseType: 'suspected' });
        setNotice(`${c.name} is now a suspected case. Record their symptoms and sample on the case form.`);
        await reload();
      } catch (e) {
        setError(`Could not convert: ${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [board, post, reload],
  );

  const plural = (n: number) => `${n} contact${n === 1 ? '' : 's'}`;

  /** Takes contacts off the case's list. Reversible (Undo, or Put back below the list). */
  const remove = useCallback(
    async (ids: string[]) => {
      if (!board || !ids.length) return;
      const names = board.contacts.filter((c) => ids.includes(c.encounterId)).map((c) => c.name);
      setBusyId(ids.length === 1 ? ids[0] : 'bulk');
      setError(null);
      try {
        setBoard((await post(`/api/contacts/lists/${board.indexCase.encounterId}`, { remove: ids })) as Board);
        setSelected(new Set());
        setConfirmRemove(false);
        setNotice(`${ids.length === 1 ? names[0] : plural(ids.length)} taken off this case's list.`);
        setUndo(ids);
      } catch (e) {
        setError(`Could not remove: ${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [board, post],
  );

  /** Puts contacts taken off the list back on it. */
  const restore = useCallback(
    async (ids: string[]) => {
      if (!board || !ids.length) return;
      const names = board.removed.filter((c) => ids.includes(c.encounterId)).map((c) => c.name);
      setBusyId(ids.length === 1 ? ids[0] : 'bulk');
      setError(null);
      try {
        setBoard((await post(`/api/contacts/lists/${board.indexCase.encounterId}`, { restore: ids })) as Board);
        setNotice(`${ids.length === 1 && names[0] ? names[0] : plural(ids.length)} back on this case's list.`);
        setUndo(null);
      } catch (e) {
        setError(`Could not put back: ${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [board, post],
  );

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, board?.contacts.filter(f.test).length ?? 0])) as Record<Filter, number>,
    [board],
  );
  const options = useMemo(() => {
    const values = (pick: (c: BoardContact) => string | undefined) =>
      Array.from(new Set((board?.contacts ?? []).map(pick).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b));
    return { relationships: values((c) => c.relationship), counties: values((c) => c.county) };
  }, [board]);

  const shown = useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)!.test;
    const q = norm(search);
    const qDigits = digits(search);
    return (board?.contacts ?? []).filter(
      (c) =>
        test(c) &&
        (!statusFilter || c.status === statusFilter) &&
        (!relationshipFilter || c.relationship === relationshipFilter) &&
        (!countyFilter || c.county === countyFilter) &&
        (!q ||
          norm(c.name).includes(q) ||
          norm(c.contactId).includes(q) ||
          norm(c.epid).includes(q) ||
          (qDigits.length >= 3 && digits(c.phone).includes(qDigits.replace(/^(254|0)/, '')))),
    );
  }, [board, filter, search, statusFilter, relationshipFilter, countyFilter]);

  // Back to the first page whenever the filters change.
  useEffect(() => setPage(1), [filter, search, statusFilter, relationshipFilter, countyFilter, pageSize, board?.indexCase.encounterId]);
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filtersOn = !!(search || statusFilter || relationshipFilter || countyFilter);
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setRelationshipFilter('');
    setCountyFilter('');
    setFilter('');
  };

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && (
        <Alert variant="success">
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {notice}
            {undo && (
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium underline"
                onClick={() => restore(undo)}
                disabled={!!busyId}
              >
                <ArrowUturnLeftIcon className="h-3.5 w-3.5" /> Undo
              </button>
            )}
          </span>
        </Alert>
      )}

      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(null);
          setUndo(null);
          setAdding(null);
          setSelected(new Set());
          setCaseId(query.trim());
        }}
      >
        <div className="flex-1">
          <TextInput
            placeholder="Case EPID or Case ID, e.g. KEN-NAI-KIB-2026-VHF-001 or KEN-2026-001"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={!query.trim() || loading}>
          Show contacts
        </button>
      </form>

      {loading && !board && <TableSkeleton rows={6} cols={7} />}

      {!caseId && !board && (
        <div className="card text-center py-16 px-4">
          <UserGroupIcon className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-nphi-900">Find a VHF case</p>
          <p className="mt-1 text-sm text-gray-500">
            Enter a case&apos;s EPID or Case ID to see its contacts and their 21-day follow up, or to upload a contact line list.
          </p>
        </div>
      )}

      {board && (
        <>
          <div className="card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500">Contacts of</p>
              <p className="text-lg font-semibold text-nphi-900">{board.indexCase.name}</p>
              <p className="font-mono text-xs text-gray-600">
                {[board.indexCase.epid, board.indexCase.caseId].filter(Boolean).join(' · ')}
                {board.indexCase.caseType ? ` · ${board.indexCase.caseType}` : ''}
                {board.listStatus === 'retired' ? ' · follow up of all contacts ended' : ''}
              </p>
            </div>
            {board.indexCase.caseType !== 'contact' && !adding && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => setAdding('hand')}>
                  <UserPlusIcon className="h-4 w-4" />
                  Add a contact
                </button>
                <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => setAdding('file')}>
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Upload line list
                </button>
              </div>
            )}
          </div>

          {board.indexCase.caseType === 'contact' && (
            <Alert variant="warning">This record is itself a contact. Add contacts to the case it was exposed to.</Alert>
          )}

          {adding && (
            <AddContacts
              key={adding}
              startWith={adding}
              indexEncounterId={board.indexCase.encounterId}
              caseLabel={board.indexCase.epid ?? board.indexCase.caseId ?? board.indexCase.name}
              onClose={() => setAdding(null)}
              onSaved={(next, saved: SaveSummary) => {
                setBoard(next);
                setAdding(null);
                setUndo(null);
                const parts = [
                  saved.created && `${plural(saved.created)} added`,
                  saved.linked && `${plural(saved.linked)} already registered, now linked to this case`,
                  saved.restored && `${plural(saved.restored)} put back`,
                ].filter(Boolean);
                setNotice(`${parts.join(', ')}.${saved.created ? ' Contact IDs are assigned within a few minutes.' : ''}`);
              }}
            />
          )}

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  filter === f.value ? 'border-nphi-600 bg-nphi-50 text-nphi-900' : 'border-nphi-100 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label} <span className="font-semibold">{counts[f.value]}</span>
              </button>
            ))}
            {board.outsideScope > 0 && (
              <span className="px-3 py-1.5 text-sm text-gray-500">
                + {board.outsideScope} contact{board.outsideScope === 1 ? '' : 's'} living outside your area
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-center">
            <TextInput
              type="search"
              placeholder="Search name, phone or Contact ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search contacts"
            />
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as '' | ContactStatus)}
              options={[{ value: '', label: 'All statuses' }, ...(Object.keys(STATUS) as ContactStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))]}
            />
            <Select
              value={relationshipFilter}
              onChange={setRelationshipFilter}
              options={[{ value: '', label: 'All relationships' }, ...options.relationships.map((r) => ({ value: r, label: r }))]}
              disabled={options.relationships.length === 0}
            />
            <Select
              value={countyFilter}
              onChange={setCountyFilter}
              options={[{ value: '', label: 'All counties' }, ...options.counties.map((c) => ({ value: c, label: c }))]}
              disabled={options.counties.length === 0}
            />
            <button type="button" className="text-sm text-nphi-700 underline disabled:text-gray-400 disabled:no-underline" onClick={clearFilters} disabled={!filtersOn && !filter}>
              Clear filters
            </button>
          </div>

          {selected.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-xl border border-nphi-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              {confirmRemove ? (
                <>
                  <p className="text-sm text-gray-800">
                    Take {plural(selected.size)} off this case&apos;s list? Use this for duplicates or people who were not in contact. You can put them back later.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => setConfirmRemove(false)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary !bg-accent-600 hover:!bg-accent-700 !py-1.5 text-sm"
                      disabled={busyId === 'bulk'}
                      onClick={() => remove(Array.from(selected))}
                    >
                      {busyId === 'bulk' ? 'Removing…' : `Remove ${plural(selected.size)}`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-nphi-900">{selected.size} selected</p>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => setSelected(new Set())}>
                      Clear
                    </button>
                    <button type="button" className="btn-secondary !py-1.5 text-sm text-accent-700" onClick={() => setConfirmRemove(true)}>
                      Remove from this case
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className={`card overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {shown.length === 0 ? (
              <div className="text-center py-12 px-4 text-sm text-gray-500">
                {board.contacts.length === 0 ? (
                  'No contacts listed for this case yet.'
                ) : (
                  <>
                    No contacts match these filters.{' '}
                    <button type="button" className="text-nphi-700 underline" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-nphi-100 text-sm">
                  <thead className="bg-gray-50/80">
                    <tr className="text-left">
                      <th className="w-10 pl-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-nphi-700"
                          checked={pageRows.length > 0 && pageRows.every((c) => selected.has(c.encounterId))}
                          onChange={(e) => {
                            setConfirmRemove(false);
                            setSelected((prev) => {
                              const next = new Set(prev);
                              for (const c of pageRows) {
                                if (e.target.checked) next.add(c.encounterId);
                                else next.delete(c.encounterId);
                              }
                              return next;
                            });
                          }}
                          aria-label="Select all contacts on this page"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium text-gray-600">Contact</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Phone</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Relationship</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Date of contact</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Day</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Follow up (days 1–21)</th>
                      <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 font-medium text-gray-600 w-64" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nphi-100">
                    {pageRows.map((c) => {
                      const open = c.status === 'active' || c.status === 'lost' || c.status === 'flagged';
                      return (
                        <Fragment key={c.encounterId}>
                          <tr className={`align-top ${selected.has(c.encounterId) ? 'bg-nphi-50/50' : ''}`}>
                            <td className="pl-4 py-3">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-nphi-700"
                                checked={selected.has(c.encounterId)}
                                onChange={() => {
                                  setConfirmRemove(false);
                                  toggleSelected(c.encounterId);
                                }}
                                aria-label={`Select ${c.name}`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{c.name}</div>
                              <div className="font-mono text-[11px] text-gray-500">{[c.contactId ?? 'Contact ID pending', c.epid].filter(Boolean).join(' · ')}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{c.phone ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-700">{c.relationship ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                              {c.exposureDate ? formatDay(c.exposureDate) : <span title="Counted from registration">{formatDay(c.dayZero)}*</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                              {c.daysSinceExposure < 0 ? '—' : `${Math.min(c.daysSinceExposure, 21)}/21`}
                            </td>
                            <td className="px-4 py-3">
                              <DayGrid contact={c} />
                              {c.missedDays.length > 0 && open && (
                                <div className="mt-1 text-[11px] text-amber-700">Missed: day {c.missedDays.join(', ')}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`chip ${STATUS[c.status].chip}`}>{STATUS[c.status].label}</span>
                              {c.dueToday && <div className="mt-1 text-[11px] text-nphi-700">Due today</div>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2 justify-end">
                                {open && c.status !== 'flagged' && (
                                  <button
                                    type="button"
                                    className="btn-secondary !py-1 !px-2 text-xs"
                                    onClick={() => setOpenId(openId === c.encounterId ? null : c.encounterId)}
                                  >
                                    Record follow up
                                  </button>
                                )}
                                {open && (
                                  <button
                                    type="button"
                                    className={`${c.status === 'flagged' ? 'btn-primary' : 'btn-secondary'} !py-1 !px-2 text-xs`}
                                    disabled={busyId === c.encounterId}
                                    onClick={() => convert(c)}
                                  >
                                    Convert to case
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="text-xs text-gray-500 hover:text-accent-700 px-1"
                                  disabled={busyId === c.encounterId}
                                  onClick={() => remove([c.encounterId])}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                          {openId === c.encounterId && (
                            <tr className="bg-nphi-50/30">
                              <td colSpan={9} className="px-4 py-4">
                                <FollowUpForm
                                  contact={c}
                                  onCancel={() => setOpenId(null)}
                                  onSave={async (followUp) => {
                                    await post(`/api/contacts/${c.encounterId}/follow-up`, {
                                      ...followUp,
                                      indexEncounterId: board.indexCase.encounterId,
                                    });
                                    setOpenId(null);
                                    setNotice(`Day ${followUp.day} follow up of ${c.name} saved.`);
                                    await reload();
                                  }}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {shown.length > 0 && (
            <div className="flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-gray-600">
                Showing <span className="font-semibold text-nphi-900">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, shown.length)}</span> of{' '}
                <span className="font-semibold text-nphi-900">{shown.length}</span>
                {shown.length !== board.contacts.length && <> (filtered from {board.contacts.length})</>}
                <span className="mx-2">·</span>
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-gray-600">
                  Rows
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-nphi-100 bg-white px-2 py-1.5">
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
                  onClick={() => setPage(currentPage - 1)}
                  className="rounded-lg border border-nphi-100 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="rounded-lg border border-nphi-100 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {board.removed.length > 0 && <RemovedList removed={board.removed} open={showRemoved} onToggle={() => setShowRemoved((o) => !o)} busyId={busyId} onRestore={restore} />}

          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            {(Object.keys(DAY_CELL) as DayState[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`h-3 w-2.5 rounded-sm ${DAY_CELL[s]}`} /> {DAY_LABEL[s]}
              </span>
            ))}
            <span>* no date of contact: counted from registration</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Contacts taken off the case's list, with Put back. Collapsed by default. */
function RemovedList({
  removed,
  open,
  onToggle,
  busyId,
  onRestore,
}: {
  removed: RemovedContact[];
  open: boolean;
  onToggle: () => void;
  busyId: string | null;
  onRestore: (ids: string[]) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm" onClick={onToggle} aria-expanded={open}>
        <span className="font-medium text-gray-700">
          Taken off this list <span className="text-gray-500">({removed.length})</span>
        </span>
        <span className="text-nphi-700">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-nphi-100">
          <ul className="divide-y divide-nphi-100">
            {removed.map((c) => (
              <li key={c.encounterId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-800">{c.name}</div>
                  <div className="font-mono text-[11px] text-gray-500">
                    {[c.contactId, c.phone, c.exposureDate && `contact ${new Date(`${c.exposureDate}T00:00:00`).toLocaleDateString()}`].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary !py-1 !px-2 inline-flex items-center gap-1 self-start text-xs sm:self-auto"
                  disabled={busyId === c.encounterId || busyId === 'bulk'}
                  onClick={() => onRestore([c.encounterId])}
                >
                  <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                  {busyId === c.encounterId ? 'Putting back…' : 'Put back'}
                </button>
              </li>
            ))}
          </ul>
          {removed.length > 1 && (
            <div className="border-t border-nphi-100 px-4 py-2 text-right">
              <button
                type="button"
                className="text-sm text-nphi-700 underline"
                disabled={busyId === 'bulk'}
                onClick={() => onRestore(removed.map((c) => c.encounterId))}
              >
                Put all back
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { UserGroupIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import type { Board, BoardContact, ContactStatus, DayState } from '@/lib/fhir-contacts';
import { Alert } from '../ui/Alert';
import { TextInput } from '../ui/Field';
import { TableSkeleton } from '../ui/Skeleton';
import ContactUploadWizard from './ContactUploadWizard';
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  const remove = useCallback(
    async (c: BoardContact) => {
      if (!board) return;
      if (!window.confirm(`Take ${c.name} off this case's contact list? Use this for duplicates or people who were not in contact.`)) return;
      setBusyId(c.encounterId);
      try {
        setBoard((await post(`/api/contacts/lists/${board.indexCase.encounterId}`, { remove: [c.encounterId] })) as Board);
      } catch (e) {
        setError(`Could not remove: ${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [board, post],
  );

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, board?.contacts.filter(f.test).length ?? 0])) as Record<Filter, number>,
    [board],
  );
  const shown = useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)!.test;
    return (board?.contacts ?? []).filter(test);
  }, [board, filter]);

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(null);
          setUploading(false);
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
            <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => setUploading((u) => !u)}>
              <ArrowUpTrayIcon className="h-4 w-4" />
              {uploading ? 'Close upload' : 'Upload line list'}
            </button>
          </div>

          {board.indexCase.caseType === 'contact' && (
            <Alert variant="warning">This record is itself a contact. Add contacts to the case it was exposed to.</Alert>
          )}

          {uploading && (
            <ContactUploadWizard
              indexEncounterId={board.indexCase.encounterId}
              caseLabel={board.indexCase.epid ?? board.indexCase.caseId ?? board.indexCase.name}
              onSaved={(next) => {
                setBoard(next);
                setUploading(false);
                setNotice('Contacts saved. Their Contact IDs are assigned within a few minutes.');
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

          <div className={`card overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {shown.length === 0 ? (
              <div className="text-center py-12 px-4 text-sm text-gray-500">
                {board.contacts.length === 0 ? 'No contacts listed for this case yet.' : 'No contacts match this filter.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-nphi-100 text-sm">
                  <thead className="bg-gray-50/80">
                    <tr className="text-left">
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
                    {shown.map((c) => {
                      const open = c.status === 'active' || c.status === 'lost' || c.status === 'flagged';
                      return (
                        <Fragment key={c.encounterId}>
                          <tr className="align-top">
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
                                  onClick={() => remove(c)}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                          {openId === c.encounterId && (
                            <tr className="bg-nphi-50/30">
                              <td colSpan={8} className="px-4 py-4">
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

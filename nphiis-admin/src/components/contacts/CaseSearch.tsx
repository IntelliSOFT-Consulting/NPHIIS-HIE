'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import { parseCaseQuery } from '@/lib/case-search';
import type { CaseMatch } from '@/lib/fhir-contacts';

const DEBOUNCE_MS = 250;

/** What to open: the /api/contacts query and the text to leave in the box. */
export interface CaseTarget {
  lookup: string;
  label: string;
}

type Row = { kind: 'id'; value: string } | { kind: 'case'; match: CaseMatch };

/** Bolds the parts of a name that start with a typed word. */
function highlight(name: string, terms: string[]): ReactNode {
  if (!terms.length) return name;
  const lower = terms.map((t) => t.toLowerCase());
  return name.split(/(\s+)/).map((part, i) => {
    const hit = lower.find((t) => part.toLowerCase().startsWith(t));
    if (!hit) return part;
    return (
      <span key={i}>
        <mark className="bg-transparent font-semibold text-nphi-900">{part.slice(0, hit.length)}</mark>
        {part.slice(hit.length)}
      </span>
    );
  });
}

/**
 * The contacts board's case box: an EPID or Case ID opens that case; a name or phone number
 * lists the matching VHF cases as you type, to pick with the mouse or the arrow keys.
 */
export default function CaseSearch({ initial, onOpen }: { initial: string; onOpen: (t: CaseTarget) => void }) {
  const authedFetch = useAuthedFetch();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ q: string; cases: CaseMatch[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(initial), [initial]);

  const parsed = useMemo(() => parseCaseQuery(text), [text]);
  const searchable = parsed.kind === 'name' || parsed.kind === 'phone';

  // Search as the user types; a newer keystroke cancels the request in flight.
  useEffect(() => {
    if (!searchable) {
      setLoading(false);
      return;
    }
    const q = text.trim();
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const res = await authedFetch(`/api/contacts/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Search failed (${res.status})`);
        setResult({ q, cases: (body as { cases: CaseMatch[] }).cases });
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [authedFetch, searchable, text]);

  // Close when clicking anywhere else.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const rows: Row[] = useMemo(() => {
    if (parsed.kind === 'id') return [{ kind: 'id', value: parsed.value }];
    if (searchable && result) return result.cases.map((match) => ({ kind: 'case', match }));
    return [];
  }, [parsed, searchable, result]);

  const terms = parsed.kind === 'name' ? parsed.terms : [];
  const stale = searchable && result?.q !== text.trim();

  const choose = (row: Row) => {
    setOpen(false);
    if (row.kind === 'id') {
      onOpen({ lookup: `id=${encodeURIComponent(row.value)}`, label: row.value });
      return;
    }
    const m = row.match;
    const label = m.epid ?? m.caseId ?? m.name;
    setText(label);
    onOpen({ lookup: `encounter=${encodeURIComponent(m.encounterId)}`, label });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[active];
      if (row && !(stale && row.kind === 'case')) choose(row);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let status: ReactNode = null;
  if (parsed.kind === 'partial-phone') status = 'Keep typing: phone numbers are matched in full, e.g. 0712345678.';
  else if (parsed.kind === 'empty' && text.trim()) status = 'Type at least two letters of a name.';
  else if (error) status = <span className="text-accent-700">Could not search: {error}</span>;
  else if (searchable && loading && !result) status = 'Searching…';
  else if (searchable && result && !stale && result.cases.length === 0)
    status = (
      <>
        No VHF case matches &ldquo;{result.q}&rdquo;. Contacts are not listed: search for the case they were exposed to.
      </>
    );

  const showPanel = open && text.trim() !== '' && (rows.length > 0 || status);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded={!!showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Find a VHF case"
          autoComplete="off"
          className="input-text w-full !pl-10 !pr-10"
          placeholder="Search a case by name, phone, EPID or Case ID"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
          {searchable && loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-nphi-200 border-t-nphi-700" aria-hidden />
          ) : text ? (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
              onClick={() => {
                setText('');
                setResult(null);
                setOpen(false);
              }}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          ) : null}
        </span>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-nphi-100 bg-white shadow-lg">
          {rows.length > 0 && (
            <ul id={listId} role="listbox" className={`max-h-96 overflow-y-auto divide-y divide-nphi-50 transition-opacity ${stale ? 'opacity-60' : ''}`}>
              {rows.map((row, i) => (
                <li
                  key={row.kind === 'id' ? `id:${row.value}` : row.match.encounterId}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(row);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 ${i === active ? 'bg-nphi-50' : ''}`}
                >
                  {row.kind === 'id' ? (
                    <span className="text-sm text-gray-700">
                      Open case <span className="font-mono font-medium text-nphi-900">{row.value}</span>
                    </span>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="truncate text-sm text-gray-900">
                          {highlight(row.match.name, terms)}
                          {row.match.caseType && <span className="ml-2 chip bg-nphi-50 text-nphi-800 text-[11px]">{row.match.caseType}</span>}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          <span className="font-mono">{[row.match.epid, row.match.caseId].filter(Boolean).join(' · ') || 'No EPID yet'}</span>
                          {[row.match.phone, row.match.subCounty, row.match.county].filter(Boolean).map((v) => ` · ${v}`).join('')}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-gray-500">
                        {row.match.contacts == null ? '' : `${row.match.contacts} contact${row.match.contacts === 1 ? '' : 's'}`}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {status && <p className={`px-4 py-3 text-sm text-gray-500 ${rows.length ? 'border-t border-nphi-100' : ''}`}>{status}</p>}
          {result && !stale && result.cases.length >= 50 && (
            <p className="border-t border-nphi-100 px-4 py-2 text-xs text-gray-500">Showing the first 50. Type more of the name to narrow it down.</p>
          )}
        </div>
      )}
    </div>
  );
}

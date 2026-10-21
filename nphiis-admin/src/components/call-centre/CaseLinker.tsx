'use client';

import { useEffect, useMemo, useState } from 'react';
import { LinkIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import { parseCaseQuery } from '@/lib/case-search';
import type { CaseCandidate, LinkedCase } from '@/lib/call-centre';
import { TextInput } from '../ui/Field';
import Spinner from '../ui/Spinner';

const DEBOUNCE_MS = 300;

/**
 * Links a call log to an existing case: search by EPID, phone or name, pick one.
 * Call logs get no EPID of their own; the linked case's EPID is shown instead.
 */
export default function CaseLinker({
  value,
  onChange,
}: {
  value: LinkedCase | null;
  onChange: (v: LinkedCase | null) => void;
}) {
  const authedFetch = useAuthedFetch();
  const [text, setText] = useState('');
  const [cases, setCases] = useState<CaseCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => parseCaseQuery(text), [text]);
  const searchable = query.kind === 'id' || query.kind === 'name' || query.kind === 'phone';

  useEffect(() => {
    if (!searchable) {
      setCases(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await authedFetch(`/api/call-centre/cases?q=${encodeURIComponent(text.trim())}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        setCases(body.cases as CaseCandidate[]);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [authedFetch, searchable, text]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-nphi-200 bg-nphi-50/60 px-4 py-3">
        <LinkIcon className="h-5 w-5 text-nphi-700 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm text-nphi-900">{value.epid}</div>
          {value.name && <div className="text-xs text-gray-600 truncate">{value.name}</div>}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex items-center gap-1 text-sm text-accent-700 hover:text-accent-800"
        >
          <XMarkIcon className="h-4 w-4" />
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <TextInput
        placeholder="Search a case by EPID, phone number or name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        leadingIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
      />
      {loading && <Spinner size="sm" label="Searching…" />}
      {error && <p className="text-xs text-accent-700">{error}</p>}
      {!loading && cases && cases.length === 0 && (
        <p className="text-xs text-gray-500">No case with an EPID matches. Only registered cases can be linked.</p>
      )}
      {cases && cases.length > 0 && (
        <ul className="divide-y divide-nphi-100 rounded-xl border border-nphi-100 max-h-60 overflow-y-auto">
          {cases.map((c) => (
            <li key={c.patientId}>
              <button
                type="button"
                onClick={() => {
                  onChange({ patientId: c.patientId, epid: c.epid, name: c.name });
                  setText('');
                  setCases(null);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-nphi-50/60"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-gray-900">{c.name}</span>
                  <span className="font-mono text-xs text-gray-700">{c.epid}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {[c.phone, [c.county, c.subCounty].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

// Text answer with a search of the DHA Facility Registry. Picking a facility
// saves "Name (FR code)"; anything typed is kept if no facility is picked, so
// the call can still be logged when the registry has no match or is down.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import { TextInput } from '../ui/Field';

export interface RegistryFacility {
  frCode: string;
  fidCode?: string;
  name: string;
  facilityType?: string;
  kephLevel?: string;
  county?: string;
  subCounty?: string;
  operationalStatus?: string;
}

/** The text saved for a picked facility. */
export function facilityAnswer(f: RegistryFacility): string {
  return f.frCode && f.frCode !== f.name ? `${f.name} (${f.frCode})` : f.name;
}

type Status = 'idle' | 'searching' | 'done' | 'none' | 'error';

const MIN_CHARS = 3;

export default function FacilitySearchInput({
  id,
  value,
  invalid,
  required,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  invalid: boolean;
  required?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const authedFetch = useAuthedFetch();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegistryFacility[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus('searching');
      // Digits only: an MFL code. Otherwise a facility name.
      const params = /^\d+$/.test(q)
        ? new URLSearchParams({ identifier: q, identifier_type: 'mfl' })
        : new URLSearchParams({ name: q });
      try {
        const res = await authedFetch(`/api/provider/facilities/search?${params}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        const list = (body.facilities ?? []) as RegistryFacility[];
        setResults(list);
        setActive(list.length ? 0 : -1);
        setStatus(list.length ? 'done' : 'none');
      } catch {
        if (!cancelled) {
          setResults([]);
          setStatus('error');
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, authedFetch]);

  // Close the list on a click outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (f: RegistryFacility) => {
    onChange(facilityAnswer(f));
    setQuery('');
    setOpen(false);
    onBlur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const listId = `${id}-results`;
  const showList = open && query.trim().length >= MIN_CHARS;

  return (
    <div ref={boxRef} className="relative">
      <TextInput
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        required={required}
        invalid={invalid}
        leadingIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
        placeholder="Search the Facility Registry by name or MFL code"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm"
        >
          {status === 'searching' && <p className="px-3 py-2 text-gray-500">Searching the Facility Registry…</p>}
          {status === 'none' && (
            <p className="px-3 py-2 text-gray-500">No match in the Facility Registry. What you typed will be saved.</p>
          )}
          {status === 'error' && (
            <p className="px-3 py-2 text-accent-700">
              Could not reach the Facility Registry. What you typed will be saved.
            </p>
          )}
          {status === 'done' &&
            results.map((f, i) => (
              <button
                key={`${f.frCode}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(f)}
                className={`block w-full text-left px-3 py-2 ${i === active ? 'bg-nphi-50' : ''}`}
              >
                <span className="font-medium text-gray-900">{f.name}</span>
                <span className="block text-xs text-gray-500">
                  {[f.facilityType, f.kephLevel, [f.subCounty, f.county].filter(Boolean).join(', '), f.frCode]
                    .filter(Boolean)
                    .join(' · ')}
                  {f.operationalStatus && !/^operational$/i.test(f.operationalStatus) && (
                    <span className="text-accent-700"> · {f.operationalStatus}</span>
                  )}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

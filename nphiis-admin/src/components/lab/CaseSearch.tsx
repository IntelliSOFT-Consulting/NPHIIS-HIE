'use client';

import { useEffect, useState } from 'react';
import { SearchSm } from '@untitled-ui/icons-react';
import { useAuthedFetch } from '@/lib/auth-context';
import { fhirApi, FhirCounty, FhirSubCounty } from '@/lib/api';
import { Field, Select, TextInput } from '../ui/Field';
import Spinner from '../ui/Spinner';
import { Alert } from '../ui/Alert';

interface CaseResult {
  patientId: string;
  epid?: string;
  name: string;
  county?: string;
  subCounty?: string;
  disease?: string;
}

/**
 * Broader case lookup for the lab module. Searches by any combination of
 * patient name / county / sub-county / (partial) EPID and lets the user pick a
 * result, which hands the EPID back to the parent to run the normal verify flow.
 */
export default function CaseSearch({
  onSelect,
}: {
  onSelect: (epid: string) => void;
}) {
  const authedFetch = useAuthedFetch();
  const [name, setName] = useState('');
  // Dropdowns hold Location ids; the search itself matches on names.
  const [countyId, setCountyId] = useState('');
  const [subCountyId, setSubCountyId] = useState('');
  const [counties, setCounties] = useState<FhirCounty[]>([]);
  const [subCounties, setSubCounties] = useState<FhirSubCounty[]>([]);
  const [loadingSubCounties, setLoadingSubCounties] = useState(false);
  const [epid, setEpid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CaseResult[] | null>(null);

  useEffect(() => {
    fhirApi
      .getCounties()
      .then((c) => setCounties([...c].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setCounties([]));
  }, []);

  useEffect(() => {
    setSubCountyId('');
    setSubCounties([]);
    if (!countyId) return;
    let cancelled = false;
    setLoadingSubCounties(true);
    fhirApi
      .getSubCounties(countyId)
      .then((s) => {
        if (!cancelled) setSubCounties([...s].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => !cancelled && setSubCounties([]))
      .finally(() => !cancelled && setLoadingSubCounties(false));
    return () => {
      cancelled = true;
    };
  }, [countyId]);

  const county = counties.find((c) => c.id === countyId)?.name ?? '';
  const subCounty = subCounties.find((s) => s.id === subCountyId)?.name ?? '';

  const canSearch = [name, county, subCounty, epid].some((v) => v.trim());

  const search = async () => {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await authedFetch('/api/lab/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, county, subCounty, epid }),
      });
      const data = (await res.json()) as
        | { results: CaseResult[] }
        | { error: string };
      if (!res.ok) {
        setError('error' in data ? data.error : 'Search failed');
        return;
      }
      setResults('results' in data ? data.results : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-nphi-900">Find a case</h3>
        <p className="text-xs text-gray-500">
          Search by any combination of patient name, county, sub-county or exact EPID,
          then select a result to load it.
        </p>
      </div>

      {/* One row on wide screens: the four fields, then the button. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 lg:items-end">
        <Field label="Patient name" htmlFor="cs-name">
          <TextInput
            id="cs-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void search())}
            placeholder="e.g. Jane Doe"
          />
        </Field>
        <Field label="EPID" htmlFor="cs-epid">
          <TextInput
            id="cs-epid"
            value={epid}
            onChange={(e) => setEpid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void search())}
            placeholder="e.g. KEN-XXX-XXX-2026-MEA-001"
          />
        </Field>
        <Field label="County" htmlFor="cs-county">
          <Select
            id="cs-county"
            value={countyId}
            onChange={setCountyId}
            placeholder="Any county"
            options={[
              { value: '', label: 'Any county' },
              ...counties.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Field>
        <Field label="Sub-county" htmlFor="cs-sub">
          <Select
            id="cs-sub"
            value={subCountyId}
            onChange={setSubCountyId}
            disabled={!countyId || loadingSubCounties}
            placeholder={
              !countyId ? 'Select a county first' : loadingSubCounties ? 'Loading…' : 'Any sub-county'
            }
            options={
              countyId && !loadingSubCounties
                ? [
                    { value: '', label: 'Any sub-county' },
                    ...subCounties.map((s) => ({ value: s.id, label: s.name })),
                  ]
                : []
            }
          />
        </Field>

        <button
          type="button"
          onClick={() => void search()}
          disabled={loading || !canSearch}
          className="btn-secondary w-full sm:col-span-2 lg:col-span-1 lg:w-auto whitespace-nowrap"
        >
          {loading ? (
            <Spinner size="sm" label="Searching…" />
          ) : (
            <>
              <SearchSm className="h-4 w-4 mr-1.5" />
              Search cases
            </>
          )}
        </button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {results && results.length === 0 && (
        <p className="text-sm text-gray-500">No matching cases found.</p>
      )}
      {results && results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">EPID</th>
                <th className="py-2 pr-3">County</th>
                <th className="py-2 pr-3">Sub-county</th>
                <th className="py-2 pr-3">Disease</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.patientId} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.epid ?? '—'}</td>
                  <td className="py-2 pr-3">{r.county ?? '—'}</td>
                  <td className="py-2 pr-3">{r.subCounty ?? '—'}</td>
                  <td className="py-2 pr-3 capitalize">{r.disease ?? '—'}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={!r.epid}
                      onClick={() => r.epid && onSelect(r.epid)}
                      className="btn-primary text-xs py-1 px-2"
                    >
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon, PlusIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import {
  FOLLOW_UP_LABEL,
  FOLLOW_UP_STAGES,
  SCREENING_OUTCOME_LABEL,
  SCREENING_OUTCOMES,
  SCREENING_TYPE_LABEL,
  SCREENING_TYPES,
  type FollowUpStage,
  type ScreenedPerson,
  type ScreeningOutcome,
  type ScreeningType,
} from '@/lib/screenings';
import { SPECIMEN_STATUS_LABEL } from '@/lib/specimens';
import { Alert } from './ui/Alert';
import NewScreeningModal from './NewScreeningModal';
import { Select, TextInput } from './ui/Field';
import { TableSkeleton } from './ui/Skeleton';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/pagination';

const OUTCOME_FILTER = [
  { value: '', label: 'All outcomes' },
  ...SCREENING_OUTCOMES.map((o) => ({ value: o, label: SCREENING_OUTCOME_LABEL[o] })),
];

const OUTCOME_BADGE: Record<ScreeningOutcome, string> = {
  cleared: 'bg-emerald-100 text-emerald-800',
  referred: 'bg-amber-100 text-amber-800',
  suspected: 'bg-accent-50 text-accent-700',
};

const STAGE_BADGE: Record<FollowUpStage, string> = {
  screened: 'bg-gray-100 text-gray-700',
  case: 'bg-amber-100 text-amber-800',
  specimen: 'bg-sky-100 text-sky-800',
  result: 'bg-emerald-100 text-emerald-800',
};

const RESULT_BADGE: Record<string, string> = {
  Positive: 'bg-accent-50 text-accent-700',
  Negative: 'bg-emerald-100 text-emerald-800',
};

const FEVER_CELSIUS = 38;

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function formatDateTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function symptomLabel(code: string): string {
  return code.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function matchesSearch(p: ScreenedPerson, term: string): boolean {
  if (!term) return true;
  const latest = p.screenings[0];
  return [
    ...p.screeningNumbers,
    ...p.identifiers,
    p.name,
    p.epid,
    p.phone,
    p.nationality,
    p.county,
    p.subCounty,
    latest?.pointOfEntry,
  ].some((v) => v?.toLowerCase().includes(term));
}

export default function ScreeningsView() {
  const authedFetch = useAuthedFetch();
  const [people, setPeople] = useState<ScreenedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<ScreeningOutcome | ''>('');
  const [type, setType] = useState<ScreeningType | ''>('');
  const [stage, setStage] = useState<FollowUpStage | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch('/api/screenings');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setPeople(body.people as ScreenedPerson[]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [authedFetch]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stageCounts = useMemo(() => {
    const out = new Map<FollowUpStage, number>();
    for (const p of people) out.set(p.stage, (out.get(p.stage) ?? 0) + 1);
    return out;
  }, [people]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return people.filter(
      (p) =>
        (!outcome || p.screenings[0]?.outcome === outcome) &&
        (!type || p.screenings[0]?.screeningType === type) &&
        (!stage || p.stage === stage) &&
        matchesSearch(p, term),
    );
  }, [people, outcome, type, stage, search]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  // Clamp so a page past the end (e.g. after narrowing the search) still shows rows.
  const page = Math.min(currentPage, totalPages);
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {!loading && people.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FOLLOW_UP_STAGES.filter((s) => stageCounts.get(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStage(stage === s ? '' : s);
                setCurrentPage(1);
              }}
              className={`chip ${STAGE_BADGE[s]} ${stage === s ? 'ring-2 ring-nphi-600' : ''}`}
            >
              {FOLLOW_UP_LABEL[s]} · {stageCounts.get(s)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <TextInput
            placeholder="Search Screening No., name, ID, EPID, phone or point of entry"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="sm:w-40">
          <Select
            value={type}
            onChange={(v) => {
              setType(v as ScreeningType | '');
              setCurrentPage(1);
            }}
            options={[
              { value: '', label: 'Entry & exit' },
              ...SCREENING_TYPES.map((t) => ({ value: t, label: `${SCREENING_TYPE_LABEL[t]} screening` })),
            ]}
          />
        </div>
        <div className="sm:w-48">
          <Select
            value={outcome}
            onChange={(v) => {
              setOutcome(v as ScreeningOutcome | '');
              setCurrentPage(1);
            }}
            options={OUTCOME_FILTER}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setShowNew(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-nphi-gradient text-sm font-medium text-white shadow-sm hover:opacity-95"
        >
          <PlusIcon className="h-4 w-4" />
          New Screening
        </button>
      </div>

      {showNew && (
        <NewScreeningModal
          onClose={() => setShowNew(false)}
          onSaved={(message) => {
            setShowNew(false);
            setNotice(message);
            refresh();
          }}
        />
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
        <div className="card overflow-hidden">
          {visible.length === 0 ? (
            <div className="text-center py-16 px-4">
              <ShieldCheckIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-nphi-900">No screened people</p>
              <p className="mt-1 text-sm text-gray-500">
                {people.length
                  ? 'Adjust the search or filters.'
                  : 'People screened at points of entry will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-nphi-100 text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">Screened</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Screening No.</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Person</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Point of entry</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Outcome</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Temp / symptoms</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Follow-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nphi-100">
                  {pageRows.map((p) => {
                    const latest = p.screenings[0];
                    const specimen = p.specimens[0];
                    return (
                      <Fragment key={p.patientId}>
                        <tr
                          onClick={() => setExpandedId(expandedId === p.patientId ? null : p.patientId)}
                          className="cursor-pointer hover:bg-nphi-50/40 align-top"
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                            {formatDate(latest?.screenedAt ?? p.lastActivity)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {latest ? (
                              <span
                                className={`chip ${
                                  latest.screeningType === 'exit' ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {SCREENING_TYPE_LABEL[latest.screeningType]}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700"
                            title={p.screeningNumbers.join('\n')}
                          >
                            {p.screeningNumbers.length ? (
                              <>
                                {p.screeningNumbers[p.screeningNumbers.length - 1]}
                                {p.screeningNumbers.length > 1 && (
                                  <span className="ml-1.5 chip bg-gray-100 text-gray-600 font-sans">
                                    +{p.screeningNumbers.length - 1}
                                  </span>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <div>{p.name ?? '—'}</div>
                            <div className="text-xs text-gray-500">
                              {[p.nationality, p.identifiers[0]].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {latest ? (
                              (latest.pointOfEntry ?? '—')
                            ) : (
                              <span className="text-gray-400">Mobile app</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {latest?.outcome ? (
                              <span className={`chip whitespace-nowrap ${OUTCOME_BADGE[latest.outcome]}`}>
                                {SCREENING_OUTCOME_LABEL[latest.outcome]}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {latest ? (
                              <>
                                <span
                                  className={
                                    (latest.temperatureCelsius ?? 0) >= FEVER_CELSIUS
                                      ? 'font-semibold text-accent-700'
                                      : ''
                                  }
                                >
                                  {latest.temperatureCelsius != null
                                    ? `${latest.temperatureCelsius} °C`
                                    : '—'}
                                </span>
                                <span className="text-gray-500">
                                  {' · '}
                                  {latest.symptoms.length
                                    ? `${latest.symptoms.length} symptom${latest.symptoms.length === 1 ? '' : 's'}`
                                    : 'No symptoms'}
                                </span>
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`chip whitespace-nowrap ${STAGE_BADGE[p.stage]}`}>
                                {FOLLOW_UP_LABEL[p.stage]}
                              </span>
                              {specimen?.result && (
                                <span
                                  className={`chip whitespace-nowrap ${RESULT_BADGE[specimen.result] ?? 'bg-gray-100 text-gray-700'}`}
                                >
                                  {specimen.result}
                                </span>
                              )}
                            </div>
                            {p.epid && (
                              <div className="mt-1 font-mono text-xs text-gray-500">{p.epid}</div>
                            )}
                          </td>
                        </tr>
                        {expandedId === p.patientId && <PersonDetails person={p} />}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
          <div className="text-gray-600">
            Total <span className="font-semibold text-nphi-900">{visible.length}</span> people
            <span className="mx-2">·</span>
            Page {page} of {totalPages}
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
              disabled={page <= 1}
              onClick={() => setCurrentPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setCurrentPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-nphi-100 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

function PersonDetails({ person: p }: { person: ScreenedPerson }) {
  const rows: Array<[string, string | undefined]> = [
    ['IDs', p.identifiers.join(', ')],
    ['Sex', p.gender],
    ['Date of birth', p.birthDate],
    ['Phone', p.phone],
    ['Residence', [p.county, p.subCounty].filter(Boolean).join(' / ')],
    ['EPID', p.epid],
  ];
  return (
    <tr className="bg-nphi-50/30">
      <td colSpan={8} className="px-4 py-4 space-y-5">
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-3">
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-gray-500">{label}</dt>
                <dd className="text-gray-800">{value}</dd>
              </div>
            ))}
        </dl>

        {p.screenings.length === 0 ? (
          <p className="text-sm text-gray-500">
            Screened on the mobile app; no point-of-entry screening record.
          </p>
        ) : (
          <Section title={`Screenings (${p.screenings.length})`}>
            <div className="space-y-3">
              {p.screenings.map((s) => (
                <div key={s.id} className="rounded-xl border border-nphi-100 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-gray-800">
                    <span className="font-medium">{formatDateTime(s.screenedAt)}</span>
                    <span className="chip bg-gray-100 text-gray-700">
                      {SCREENING_TYPE_LABEL[s.screeningType]} screening
                    </span>
                    {s.pointOfEntry && (
                      <span className="text-gray-500">
                        · {s.pointOfEntry}
                        {s.pointOfEntryType ? ` (${s.pointOfEntryType})` : ''}
                      </span>
                    )}
                    {s.outcome && (
                      <span className={`chip ${OUTCOME_BADGE[s.outcome]}`}>
                        {SCREENING_OUTCOME_LABEL[s.outcome]}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-gray-700">
                    <div>
                      <div className="text-xs text-gray-500">
                        Temperature{' '}
                        {s.temperatureCelsius != null ? `${s.temperatureCelsius} °C` : 'not taken'}
                      </div>
                      {s.symptoms.length ? (
                        <ul className="mt-1 list-disc pl-5">
                          {s.symptoms.map((sym) => (
                            <li key={sym.code}>
                              {symptomLabel(sym.code)}
                              {sym.onsetDate ? ` — since ${sym.onsetDate}` : ''}
                              {sym.note ? ` (${sym.note})` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-1">No symptoms reported</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Travel</div>
                      {s.trips.length ? (
                        <ul className="mt-1 list-disc pl-5">
                          {s.trips.map((t, i) => (
                            <li key={i}>
                              {[t.city, t.country].filter(Boolean).join(', ')}
                              {t.departureDate || t.arrivalDate
                                ? ` (${t.departureDate ?? '?'} → ${t.arrivalDate ?? '?'})`
                                : ''}
                              {t.purpose ? ` · ${t.purpose}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-1">
                          {s.hasTravelled === false ? 'No recent travel' : 'Not recorded'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {p.specimens.length > 0 && (
          <Section title="Specimens sent to NPHL">
            <table className="min-w-[24rem] text-sm">
              <tbody className="divide-y divide-nphi-100">
                {p.specimens.map((s) => (
                  <tr key={s.specimenId}>
                    <td className="py-1.5 pr-6 font-mono text-xs text-gray-700">{s.label}</td>
                    <td className="py-1.5 pr-6 text-gray-700">
                      {s.status ? SPECIMEN_STATUS_LABEL[s.status] : (s.statusText ?? '—')}
                    </td>
                    <td className="py-1.5 font-medium text-gray-900">{s.result ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </td>
    </tr>
  );
}

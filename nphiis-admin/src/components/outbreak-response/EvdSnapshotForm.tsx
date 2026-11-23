'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth, useAuthedFetch } from '@/lib/auth-context';
import { fhirApi } from '@/lib/api';
import { NATIONAL_ROLES, hasAnyRole } from '@/lib/roles';
import {
  CERTIFICATION_TEXT,
  COUNT_SECTIONS,
  DEADLINE_HOUR_EAT,
  FIELD,
  MAX_CHALLENGES_LENGTH,
  deadlineFor,
  emptyInput,
  inputFromSummary,
  isIsoDate,
  periodCovered,
  validateSnapshot,
  type FieldErrors,
  type LocationRef,
  type SnapshotInput,
  type SnapshotSummary,
} from '@/lib/evd-snapshot';
import { Alert } from '../ui/Alert';
import { DateInput, Field, Select, TextInput } from '../ui/Field';
import Spinner from '../ui/Spinner';

const API = '/api/outbreak-response/evd-snapshot';

function formatDay(iso: string): string {
  if (!isIsoDate(iso)) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  /** A saved snapshot being edited; omit for a new one. */
  editing?: SnapshotSummary | null;
  onSaved: (message: string) => void;
  onCancelEdit?: () => void;
}

export default function EvdSnapshotForm({ editing, onSaved, onCancelEdit }: Props) {
  const authedFetch = useAuthedFetch();
  const { user, roles, locationInfo } = useAuth();
  const national = hasAnyRole(roles, NATIONAL_ROLES) || hasAnyRole(roles, ['ADMINISTRATOR', 'SUPERUSER']);

  // A sub-county or county officer reports for their own area only: those pickers are locked.
  const lockedCounty: LocationRef | undefined =
    !national && locationInfo?.county ? { id: locationInfo.county, name: locationInfo.countyName } : undefined;
  const lockedSubCounty: LocationRef | undefined =
    !national && locationInfo?.subCounty ? { id: locationInfo.subCounty, name: locationInfo.subCountyName } : undefined;

  const initial = useMemo<SnapshotInput>(() => {
    if (editing) return inputFromSummary(editing);
    const base = emptyInput();
    const name = user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    return {
      ...base,
      county: lockedCounty,
      subCounty: lockedSubCounty,
      focalPerson: name || '',
      email: user?.email || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const [input, setInput] = useState<SnapshotInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [counties, setCounties] = useState<LocationRef[]>([]);
  const [subCounties, setSubCounties] = useState<LocationRef[]>([]);
  const [existing, setExisting] = useState<SnapshotSummary | null>(null);

  useEffect(() => {
    setInput(initial);
    setErrors({});
    setSubmitError(null);
    setTouched(false);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    fhirApi
      .getCounties()
      .then((list) => !cancelled && setCounties(list.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => !cancelled && setCounties([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const countyId = input.county?.id;
  useEffect(() => {
    let cancelled = false;
    if (!countyId) {
      setSubCounties([]);
      return;
    }
    fhirApi
      .getSubCounties(countyId)
      .then((list) => !cancelled && setSubCounties(list.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => !cancelled && setSubCounties([]));
    return () => {
      cancelled = true;
    };
  }, [countyId]);

  // Is there already a return for this sub-county and day? Saving would replace it.
  const subCountyId = input.subCounty?.id;
  useEffect(() => {
    setExisting(null);
    if (editing || !subCountyId || !isIsoDate(input.reportingDate)) return;
    let cancelled = false;
    authedFetch(`${API}?${new URLSearchParams({ date: input.reportingDate, subCounty: subCountyId, pageSize: '10' })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((page: { snapshots?: SnapshotSummary[] } | null) => {
        if (!cancelled) setExisting(page?.snapshots?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [editing, subCountyId, input.reportingDate, authedFetch]);

  const { errors: liveErrors, warnings } = useMemo(() => validateSnapshot(input), [input]);
  const shown = touched ? { ...liveErrors, ...errors } : errors;
  const set = <K extends keyof SnapshotInput>(key: K, value: SnapshotInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
    setErrors({});
  };
  const setCount = (id: string, value: string) => {
    setInput((prev) => ({ ...prev, counts: { ...prev.counts, [id]: value.replace(/[^\d]/g, '') } }));
    setErrors({});
  };

  const pastDeadline =
    !editing && isIsoDate(input.reportingDate) && Date.now() > deadlineFor(input.reportingDate);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setSubmitError(null);
    if (Object.keys(liveErrors).length) {
      setErrors(liveErrors);
      setSubmitError('Some answers need attention. They are marked below.');
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.errors) setErrors(body.errors);
        throw new Error(body.error || `Could not save (${res.status})`);
      }
      onSaved(
        body.replaced
          ? `Snapshot for ${input.subCounty?.name} on ${formatDay(input.reportingDate)} was updated.`
          : `Snapshot for ${input.subCounty?.name} on ${formatDay(input.reportingDate)} was submitted.`,
      );
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const countyOptions = counties.map((c) => ({ value: c.id, label: c.name }));
  const subCountyOptions = subCounties.map((s) => ({ value: s.id, label: s.name }));
  if (input.county && !counties.some((c) => c.id === input.county!.id)) {
    countyOptions.unshift({ value: input.county.id, label: input.county.name });
  }
  if (input.subCounty && !subCounties.some((s) => s.id === input.subCounty!.id)) {
    subCountyOptions.unshift({ value: input.subCounty.id, label: input.subCounty.name });
  }
  const covered = periodCovered(input.reportingDate);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {editing && (
        <Alert variant="info" title="Editing a submitted snapshot">
          Saving replaces the figures. The original submission time is kept, so the on-time status does not change.
        </Alert>
      )}
      {existing && !editing && (
        <Alert variant="warning" title="A snapshot already exists for this sub-county and day">
          Submitted {existing.submittedAt ? new Date(existing.submittedAt).toLocaleString('en-GB') : ''}. Saving this form replaces it.
        </Alert>
      )}
      {pastDeadline && (
        <Alert variant="warning" title={`Past the ${String(DEADLINE_HOUR_EAT).padStart(2, '0')}:00 EAT deadline`}>
          This snapshot will be recorded as late.
        </Alert>
      )}

      <section className="card p-5 space-y-4">
        <h3 className="text-base font-semibold text-nphi-900">Reporting identity</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="County" required error={shown[FIELD.county]}>
            <Select
              value={input.county?.id ?? ''}
              onChange={(id) => {
                const c = counties.find((x) => x.id === id);
                setInput((p) => ({ ...p, county: c, subCounty: undefined }));
                setErrors({});
              }}
              options={countyOptions}
              placeholder="Select county"
              invalid={!!shown[FIELD.county]}
              disabled={!!lockedCounty || !!editing}
            />
          </Field>
          <Field label="Sub-county" required error={shown[FIELD.subCounty]}>
            <Select
              value={input.subCounty?.id ?? ''}
              onChange={(id) => set('subCounty', subCounties.find((x) => x.id === id))}
              options={subCountyOptions}
              placeholder={input.county ? 'Select sub-county' : 'Select a county first'}
              invalid={!!shown[FIELD.subCounty]}
              disabled={!input.county || !!lockedSubCounty || !!editing}
            />
          </Field>
          <Field
            label="Reporting date"
            required
            error={shown[FIELD.reportingDate]}
            hint={covered ? `Covers ${formatDay(covered)}, 00:00–23:59 EAT. Submit by 09:00 EAT.` : undefined}
          >
            <DateInput
              value={input.reportingDate}
              onChange={(v) => set('reportingDate', v)}
              noFuture
              invalid={!!shown[FIELD.reportingDate]}
              disabled={!!editing}
            />
          </Field>
          <Field label="Sub-county surveillance focal person" required error={shown[FIELD.focalPerson]}>
            <TextInput
              value={input.focalPerson}
              onChange={(e) => set('focalPerson', e.target.value)}
              invalid={!!shown[FIELD.focalPerson]}
            />
          </Field>
          <Field label="Phone" required error={shown[FIELD.phone]}>
            <TextInput
              type="tel"
              inputMode="tel"
              placeholder="0712345678"
              value={input.phone}
              onChange={(e) => set('phone', e.target.value)}
              invalid={!!shown[FIELD.phone]}
            />
          </Field>
          <Field label="Email" required error={shown[FIELD.email]}>
            <TextInput
              type="email"
              value={input.email}
              onChange={(e) => set('email', e.target.value)}
              invalid={!!shown[FIELD.email]}
            />
          </Field>
        </div>
      </section>

      {COUNT_SECTIONS.map((section) => (
        <section key={section.id} className="card p-5">
          <h3 className="text-base font-semibold text-nphi-900">
            {section.letter}. {section.title}
          </h3>
          <p className="text-xs text-gray-500 mb-3">{section.subtitle}</p>
          <div className="divide-y divide-nphi-100/60">
            {section.fields.map((f) => (
              <div key={f.id} className="grid grid-cols-[2.5rem_1fr_7rem] items-start gap-3 py-2.5">
                <span className="text-xs font-semibold text-nphi-700 pt-2.5">{f.number}</span>
                <label htmlFor={f.id} className="text-sm text-gray-800 pt-2">
                  {f.label}
                </label>
                <div>
                  <TextInput
                    id={f.id}
                    inputMode="numeric"
                    value={input.counts[f.id] ?? ''}
                    onChange={(e) => setCount(f.id, e.target.value)}
                    invalid={!!shown[f.id]}
                    className="text-right"
                    aria-describedby={shown[f.id] ? `${f.id}-err` : undefined}
                  />
                  {shown[f.id] && (
                    <p id={`${f.id}-err`} className="text-xs text-accent-700 mt-1">
                      {shown[f.id]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {warnings.length > 0 && (
        <Alert variant="warning" title="Please double-check">
          <ul className="list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      <section className="card p-5 space-y-2">
        <h3 className="text-base font-semibold text-nphi-900">C. Challenges</h3>
        <textarea
          rows={4}
          maxLength={MAX_CHALLENGES_LENGTH}
          value={input.challenges}
          onChange={(e) => set('challenges', e.target.value)}
          placeholder="Any challenges in the last 24 hours (optional)"
          className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:outline-none focus:border-nphi-600 focus:ring-4 focus:ring-nphi-100"
        />
      </section>

      <section className="card p-5 space-y-2">
        <h3 className="text-base font-semibold text-nphi-900">D. Certification</h3>
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={input.certified}
            onChange={(e) => set('certified', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-nphi-600 focus:ring-nphi-200"
          />
          <span>{CERTIFICATION_TEXT}</span>
        </label>
        {shown[FIELD.certification] && <p className="text-xs text-accent-700">{shown[FIELD.certification]}</p>}
      </section>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={saving}>
          {saving && <Spinner size="sm" />}
          {editing ? 'Save changes' : existing ? 'Replace snapshot' : 'Submit snapshot'}
        </button>
        {editing && onCancelEdit && (
          <button type="button" className="btn-secondary" onClick={onCancelEdit} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

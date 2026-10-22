'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash01 } from '@untitled-ui/icons-react';
import { useAuthedFetch } from '@/lib/auth-context';
import {
  RESULT_BADGE,
  SPECIMEN_STATUS_LABEL,
  STATUS_BADGE,
  isSpecimenStatus,
  type CaseSpecimen,
} from '@/lib/specimens';
import {
  TEST_RESULTS,
  UPDATE_KINDS,
  UPDATE_KIND_LABEL,
  messagesFor,
  validateUpdate,
  type SpecimenUpdate,
  type UpdateKind,
  type UpdatesResponse,
} from '@/lib/lab-messages';
import { flattenItems, type LabFormDefinition } from '@/lib/questionnaires';
import Spinner from '../ui/Spinner';
import { Alert } from '../ui/Alert';
import { DateInput, Field, RadioGroup, Select, TextInput } from '../ui/Field';
import CaseLevelAnswers from './CaseLevelAnswers';

const OTHER = '__other__';

interface TestRow {
  choice: string;
  other: string;
  result: string;
}

interface Draft {
  date: string;
  laboratory: string;
  labNumber: string;
  resultType: '' | 'Preliminary' | 'Final';
  tests: TestRow[];
  rejectionReason: string;
  note: string;
}

const emptyDraft = (): Draft => ({
  date: '',
  laboratory: '',
  labNumber: '',
  resultType: '',
  tests: [{ choice: '', other: '', result: '' }],
  rejectionReason: '',
  note: '',
});

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

/** Test names offered for a result: the lab form's test options. */
function testOptions(form: LabFormDefinition): string[] {
  const item = flattenItems(form.questionnaire).find((it) => it.linkId === 'laboratory_tests');
  return (item?.answerOption ?? [])
    .map((o) => o.valueCoding?.display ?? o.valueString ?? '')
    .filter((v) => v && !/^other/i.test(v));
}

/**
 * Lab results for a verified case, recorded against one of its specimens. Each
 * update goes to hie-auth as the lab system's messages would, so it moves the
 * specimen's Task, writes the result Observations and DiagnosticReport, and
 * emails the case submitter just as a result from the lab system does.
 */
export default function SpecimenEntry({
  form,
  epid,
  patientId,
}: {
  form: LabFormDefinition;
  epid: string;
  patientId: string;
}) {
  const authedFetch = useAuthedFetch();
  const [specimens, setSpecimens] = useState<CaseSpecimen[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [kind, setKind] = useState<UpdateKind>('received');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const tests = useMemo(() => testOptions(form), [form]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await authedFetch(`/api/lab/case-specimens?patientId=${encodeURIComponent(patientId)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      const list = body.specimens as CaseSpecimen[];
      setSpecimens(list);
      setSelectedId((prev) => prev || list.find((s) => s.linkedToCase)?.specimenId || '');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [authedFetch, patientId]);

  // A new case starts over; a refreshed token (a new `load`) keeps the selection.
  useEffect(() => {
    setSpecimens(null);
    setSelectedId('');
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = specimens?.find((s) => s.specimenId === selectedId);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setTest = (i: number, patch: Partial<TestRow>) =>
    setDraft((d) => ({ ...d, tests: d.tests.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const chooseKind = (k: UpdateKind) => {
    setKind(k);
    setError(null);
    setSuccess(null);
  };

  const record = async () => {
    if (!selected) return;
    const update: SpecimenUpdate = {
      specimenId: selected.label,
      kind,
      date: draft.date || undefined,
      laboratory: draft.laboratory || undefined,
      labNumber: draft.labNumber || undefined,
      resultType: draft.resultType || undefined,
      tests:
        kind === 'result'
          ? draft.tests.map((t) => ({ name: t.choice === OTHER ? t.other : t.choice, result: t.result }))
          : undefined,
      rejectionReason: draft.rejectionReason || undefined,
      note: draft.note || undefined,
    };
    const invalid = validateUpdate(update);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authedFetch('/api/lab/specimen-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: messagesFor(update) }),
      });
      const body = (await res.json()) as UpdatesResponse | { error: string };
      if ('error' in body) throw new Error(body.error);
      const outcome = body.results[0];
      if (!outcome?.matched) {
        throw new Error(outcome?.error ?? body.invalid[0]?.error ?? 'The update was not recorded');
      }
      const status = outcome.businessStatus;
      setSuccess(
        `${UPDATE_KIND_LABEL[kind]} recorded for specimen ${selected.label}` +
          (status && isSpecimenStatus(status) ? `. Status: ${SPECIMEN_STATUS_LABEL[status]}.` : '.'),
      );
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <Alert variant="error" title="Could not load this case's specimens">
        {loadError}{' '}
        <button type="button" onClick={() => void load()} className="underline font-medium">
          Try again
        </button>
      </Alert>
    );
  }
  if (!specimens) return <Spinner label="Loading specimens…" />;

  return (
    <div className="space-y-6">
      {specimens.length === 0 ? (
        <Alert variant="warning" title="No specimens for this case">
          Results are recorded against a specimen. This case has none yet: specimens are added
          with the case on the mobile app.
        </Alert>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">Specimen</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {specimens.map((s) => {
              const active = s.specimenId === selectedId;
              return (
                <button
                  key={s.specimenId}
                  type="button"
                  disabled={!s.linkedToCase}
                  onClick={() => {
                    setSelectedId(s.specimenId);
                    setError(null);
                    setSuccess(null);
                  }}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    active
                      ? 'border-nphi-600 ring-4 ring-nphi-100 bg-white'
                      : 'border-gray-200 hover:border-nphi-300 bg-white'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-semibold text-gray-900">{s.label}</div>
                      <div className="text-xs text-gray-600">
                        {s.sampleType ?? 'Sample'} · collected {formatDate(s.collectedAt)}
                        {s.labNumber && <> · lab no. {s.labNumber}</>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {s.status ? (
                        <span className={`chip whitespace-nowrap ${STATUS_BADGE[s.status]}`}>
                          {SPECIMEN_STATUS_LABEL[s.status]}
                        </span>
                      ) : (
                        <span className="chip whitespace-nowrap bg-gray-100 text-gray-700">Not tracked yet</span>
                      )}
                      {s.result && (
                        <span className={`chip ${RESULT_BADGE[s.result] ?? 'bg-gray-100 text-gray-700'}`}>
                          {s.resultType ? `${s.resultType}: ` : ''}
                          {s.result}
                        </span>
                      )}
                    </div>
                  </div>
                  {!s.linkedToCase && (
                    <div className="mt-2 text-xs text-accent-700">
                      Not linked to the case encounter, so results cannot be recorded against it.
                    </div>
                  )}
                  {s.labelIsFhirId && s.linkedToCase && (
                    <div className="mt-2 text-xs text-amber-700">
                      No tube label on this specimen; it is identified by its record ID.
                    </div>
                  )}
                  {active && s.tests.length > 0 && (
                    <ul className="mt-2 text-xs text-gray-700 list-disc pl-4">
                      {s.tests.map((t) => (
                        <li key={t.name}>
                          {t.name}: {t.result}
                        </li>
                      ))}
                    </ul>
                  )}
                  {active && s.statusReason && s.status === 'specimen-rejected' && (
                    <div className="mt-2 text-xs text-accent-700">Rejected: {s.statusReason}</div>
                  )}
                  {active && (s.notes?.length ?? 0) > 0 && (
                    <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                      {s.notes!.map((n, i) => (
                        <li key={i}>
                          <span className="font-medium">{n.author}</span>
                          {n.time ? ` (${formatDate(n.time)})` : ''}: {n.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-nphi-100 p-4 space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Update to record">
            {UPDATE_KINDS.map((k) => {
              const disabled = k === 'note' && !selected.tracked;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  disabled={disabled}
                  title={disabled ? 'Record the specimen’s progress or result before adding a note' : undefined}
                  onClick={() => chooseKind(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    kind === k
                      ? 'bg-nphi-600 border-nphi-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {UPDATE_KIND_LABEL[k]}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            {kind === 'result' && (
              <Field label="Result type" htmlFor="u-result-type" required>
                <RadioGroup
                  name="u-result-type"
                  value={draft.resultType}
                  onChange={(v) => set('resultType', v as Draft['resultType'])}
                  options={[
                    { value: 'Preliminary', label: 'Preliminary' },
                    { value: 'Final', label: 'Final' },
                  ]}
                />
              </Field>
            )}
            <Field
              label={
                kind === 'received'
                  ? 'Date received at the lab'
                  : kind === 'result'
                    ? 'Date of result'
                    : kind === 'rejected'
                      ? 'Date rejected'
                      : kind === 'in-testing'
                        ? 'Date testing started'
                        : 'Date'
              }
              htmlFor="u-date"
              required={kind === 'received' || kind === 'result'}
            >
              <DateInput id="u-date" value={draft.date} onChange={(v) => set('date', v)} noFuture />
            </Field>
            <Field label="Laboratory" htmlFor="u-lab">
              <TextInput
                id="u-lab"
                value={draft.laboratory}
                onChange={(e) => set('laboratory', e.target.value)}
                placeholder="e.g. National Virology Reference Laboratory (NVRL)"
              />
            </Field>
            {(kind === 'received' || kind === 'result' || kind === 'rejected') && (
              <Field label="Lab number" htmlFor="u-lab-number" hint="The lab's accession number, if it has one">
                <TextInput
                  id="u-lab-number"
                  value={draft.labNumber}
                  onChange={(e) => set('labNumber', e.target.value)}
                  placeholder={selected.labNumber ?? 'e.g. NVRL/1051/26'}
                />
              </Field>
            )}
            {kind === 'rejected' && (
              <Field label="Rejection reason" htmlFor="u-reason" required>
                <TextInput
                  id="u-reason"
                  value={draft.rejectionReason}
                  onChange={(e) => set('rejectionReason', e.target.value)}
                  placeholder="e.g. Sample haemolysed"
                />
              </Field>
            )}
          </div>

          {kind === 'note' && (
            <Field label="Note" htmlFor="u-note" required>
              <textarea
                id="u-note"
                rows={3}
                className="input-text"
                value={draft.note}
                onChange={(e) => set('note', e.target.value)}
                placeholder="e.g. Volume low; please send a repeat sample"
              />
            </Field>
          )}

          {kind === 'result' && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                Tests <span className="text-accent-600">*</span>
              </div>
              {draft.tests.map((t, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_10rem_auto] gap-2 items-start">
                  <Select
                    id={`u-test-${i}`}
                    value={t.choice}
                    onChange={(v) => setTest(i, { choice: v })}
                    placeholder="Test"
                    options={[...tests.map((n) => ({ value: n, label: n })), { value: OTHER, label: 'Other…' }]}
                  />
                  {t.choice === OTHER ? (
                    <TextInput
                      aria-label="Test name"
                      value={t.other}
                      onChange={(e) => setTest(i, { other: e.target.value })}
                      placeholder="Test name"
                    />
                  ) : (
                    <div className="hidden md:block" />
                  )}
                  <Select
                    id={`u-test-result-${i}`}
                    value={t.result}
                    onChange={(v) => setTest(i, { result: v })}
                    placeholder="Result"
                    options={TEST_RESULTS.map((r) => ({ value: r, label: r }))}
                  />
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, tests: d.tests.filter((_, j) => j !== i) }))}
                    disabled={draft.tests.length === 1}
                    className="btn-secondary px-3"
                    aria-label="Remove test"
                  >
                    <Trash01 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, tests: [...d.tests, { choice: '', other: '', result: '' }] }))}
                className="text-sm inline-flex items-center text-nphi-700 hover:text-nphi-800"
              >
                <Plus className="h-4 w-4 mr-1" /> Add test
              </button>
              <p className="text-xs text-gray-500">
                The specimen&rsquo;s result is Positive if any test is positive.
              </p>
            </div>
          )}

          {error && <Alert variant="error">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          <div className="flex justify-end">
            <button type="button" onClick={() => void record()} disabled={saving} className="btn-primary">
              {saving ? (
                <Spinner size="sm" className="text-white" label="Recording…" />
              ) : (
                `Record ${UPDATE_KIND_LABEL[kind].toLowerCase()}`
              )}
            </button>
          </div>
        </div>
      )}

      <CaseLevelAnswers formId={form.id} epid={epid} />
    </div>
  );
}

'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Edit01, User01 } from '@untitled-ui/icons-react';
import { useAuth, useAuthedFetch } from '@/lib/auth-context';
import { hasAnyRole } from '@/lib/roles';
import {
  LAB_FORMS,
  flattenItems,
  indexItems,
  isHidden,
  isItemEnabled,
  dateMaxIsToday,
  dateMinFromLinkId,
  constraintHuman,
  minLength,
  maxLength,
  labelFor,
  getLabForm,
  type AnswerMap,
  type LabFormDefinition,
  type QuestionnaireItem,
} from '@/lib/questionnaires';
import Spinner from '../ui/Spinner';
import { Alert } from '../ui/Alert';
import CaseSearch from './CaseSearch';
import ExistingResultModal from './ExistingResultModal';
import SpecimenEntry from './SpecimenEntry';
import { Field, Select } from '../ui/Field';
import QuestionInput, { fieldHint } from '../questionnaire/QuestionInput';

interface RowResult {
  row: number;
  epid: string;
  status: 'accepted' | 'rejected';
  reason?: string;
}
interface UploadResponse {
  accepted: number;
  rejected: RowResult[];
  results: RowResult[];
}

interface VerifiedCase {
  epid: string;
  patient: {
    id: string;
    displayName: string;
    gender?: string;
    birthDate?: string;
  };
  recordType?: 'case' | 'line-list' | 'unknown';
  disease?: string | null;
  suggestedForms?: string[];
}

interface ExistingResultInfo {
  count: number;
  latest?: string;
  formTitle: string;
}

function initialAnswers(form: LabFormDefinition | undefined): AnswerMap {
  const out: AnswerMap = { EPID: '' };
  if (!form) return out;
  for (const it of flattenItems(form.questionnaire)) out[it.linkId] = '';
  return out;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Validates a single item's value against the questionnaire's rules. Pure
 * function so it can run during onBlur/typing for inline feedback as well as
 * during final form submission.
 */
function validateItem(
  it: QuestionnaireItem,
  v: string,
  answers: AnswerMap,
  allItems: Map<string, QuestionnaireItem>,
): string | null {
  if (!v) return it.required ? `${labelFor(it)} is required` : null;
  if (it.type === 'date' || it.type === 'dateTime') {
    if (dateMaxIsToday(it) && v > TODAY()) {
      return 'Cannot be a date in the future';
    }
    const minLink = dateMinFromLinkId(it);
    if (minLink) {
      const minVal = answers[minLink];
      if (minVal && v < minVal) {
        const parent = allItems.get(minLink);
        return (
          constraintHuman(it) ??
          `Must be on or after "${parent ? labelFor(parent) : minLink}"`
        );
      }
    }
  }
  if (it.type === 'string' || it.type === 'text') {
    const minL = minLength(it);
    const maxL = maxLength(it);
    if (minL !== undefined && v.length < minL)
      return `Must be at least ${minL} characters`;
    if (maxL !== undefined && v.length > maxL)
      return `Must be at most ${maxL} characters`;
  }
  if (it.type === 'integer' && !/^-?\d+$/.test(v)) {
    return 'Must be a whole number';
  }
  if (
    (it.type === 'decimal' || it.type === 'quantity') &&
    Number.isNaN(Number.parseFloat(v))
  ) {
    return 'Must be a number';
  }
  return null;
}

export default function SingleResultForm() {
  const { roles, accessToken } = useAuth();
  const authedFetch = useAuthedFetch();
  const availableForms = useMemo(
    () => LAB_FORMS.filter((f) => hasAnyRole(roles, f.allowedRoles)),
    [roles],
  );

  const [formId, setFormId] = useState(availableForms[0]?.id ?? '');
  const form = formId ? getLabForm(formId) : undefined;

  const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(form));
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<VerifiedCase | null>(null);
  const [autoSwitchedFrom, setAutoSwitchedFrom] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Set when the verified case already has a result for the resolved form;
  // drives the advisory warning modal. Acknowledging it just dismisses the
  // modal — submission still proceeds (the user opted in).
  const [existingResult, setExistingResult] =
    useState<ExistingResultInfo | null>(null);

  const allItems = useMemo(
    () => (form ? indexItems(form.questionnaire) : new Map<string, QuestionnaireItem>()),
    [form],
  );

  const visibleItems = useMemo(() => {
    if (!form) return [];
    return flattenItems(form.questionnaire).filter((it) =>
      isItemEnabled(it, answers),
    );
  }, [form, answers]);

  /** Per-item error map; `touched` gates display until the user has interacted. */
  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const it of visibleItems) {
      if (isHidden(it) || it.readOnly) continue;
      const err = validateItem(it, answers[it.linkId] ?? '', answers, allItems);
      if (err) out[it.linkId] = err;
    }
    return out;
  }, [visibleItems, answers, allItems]);

  const handleFormChange = (id: string) => {
    setFormId(id);
    setAnswers(initialAnswers(getLabForm(id)));
    setTopError(null);
    setSuccess(null);
    setVerified(null);
    setAutoSwitchedFrom(null);
    setTouched({});
    setExistingResult(null);
  };

  const maybeAutoSwitchForm = (v: VerifiedCase): string => {
    const candidates = v.suggestedForms ?? [];
    if (candidates.length === 0) return formId;
    if (candidates.includes(formId)) return formId;
    const match = candidates.find((c) =>
      availableForms.some((f) => f.id === c),
    );
    if (!match) return formId;
    const prior = formId;
    const next = getLabForm(match);
    setFormId(match);
    const fresh = initialAnswers(next);
    fresh.EPID = v.epid;
    setAnswers(fresh);
    setTouched({});
    setAutoSwitchedFrom(prior);
    return match;
  };

  const verifyEpid = async (epidArg?: string) => {
    if (!accessToken) return;
    const epid = (epidArg ?? answers.EPID).trim();
    if (!epid) {
      setTopError('Enter an EPID to verify');
      return;
    }
    setVerifying(true);
    setTopError(null);
    setSuccess(null);
    try {
      const res = await authedFetch('/api/lab/verify-epid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epid }),
      });
      const data = (await res.json()) as VerifiedCase | { error: string };
      if (!res.ok) {
        setTopError('error' in data ? data.error : 'Verification failed');
        setVerified(null);
        setAutoSwitchedFrom(null);
        return;
      }
      const v = data as VerifiedCase;
      setVerified(v);
      const resolvedFormId = maybeAutoSwitchForm(v);
      // Specimen-based forms show each specimen's status instead.
      if (!getLabForm(resolvedFormId)?.specimenBased) {
        void checkExistingResult(v.patient.id, resolvedFormId);
      }
    } catch (err) {
      setTopError((err as Error).message);
      setVerified(null);
    } finally {
      setVerifying(false);
    }
  };

  /**
   * Advisory check: warn (don't block) when the resolved form already has a
   * result for this case. Failures are swallowed — a missed warning must never
   * stop a legitimate submission.
   */
  const checkExistingResult = async (patientId: string, fId: string) => {
    setExistingResult(null);
    if (!patientId || !fId) return;
    try {
      const res = await authedFetch('/api/lab/existing-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, formId: fId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        exists: boolean;
        count: number;
        latest?: string;
        formTitle: string;
      };
      if (data.exists) {
        setExistingResult({
          count: data.count,
          latest: data.latest,
          formTitle: data.formTitle,
        });
      }
    } catch {
      // best-effort only
    }
  };

  const editEpid = () => {
    setVerified(null);
    setSuccess(null);
    setTopError(null);
    setAutoSwitchedFrom(null);
    setExistingResult(null);
  };

  const set = (linkId: string, v: string) =>
    setAnswers((prev) => {
      const next = { ...prev, [linkId]: v };
      if (form) {
        for (const it of flattenItems(form.questionnaire)) {
          if (!isItemEnabled(it, next) && next[it.linkId]) next[it.linkId] = '';
        }
      }
      return next;
    });

  const markTouched = (linkId: string) =>
    setTouched((prev) => ({ ...prev, [linkId]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Specimen-based forms record each update from SpecimenEntry.
    if (!form || !accessToken || form.specimenBased) return;
    if (!verified) {
      setTopError('Verify the EPID before submitting');
      return;
    }
    // Touch all fields so any pending errors show inline.
    const allTouched: Record<string, boolean> = {};
    for (const it of visibleItems) allTouched[it.linkId] = true;
    setTouched(allTouched);
    if (Object.keys(fieldErrors).length > 0) {
      setTopError('Fix the highlighted fields and try again');
      return;
    }
    setSubmitting(true);
    setTopError(null);
    setSuccess(null);

    try {
      const row: Record<string, string> = { EPID: answers.EPID };
      for (const it of visibleItems) {
        const v = answers[it.linkId];
        if (v !== undefined && v !== '') row[it.linkId] = v;
      }
      const res = await authedFetch('/api/lab/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Single entry is a deliberate one-at-a-time action: any duplicate was
        // already surfaced via the warning modal, so don't re-flag on submit.
        body: JSON.stringify({ formId: form.id, rows: [row], force: true }),
      });
      const data = (await res.json()) as UploadResponse | { error: string };
      if (!res.ok) {
        setTopError('error' in data ? data.error : 'Submission failed');
        return;
      }
      const payload = data as UploadResponse;
      if (payload.accepted === 1) {
        setSuccess(`Submitted result for EPID ${answers.EPID}.`);
        setAnswers(initialAnswers(form));
        setVerified(null);
        setAutoSwitchedFrom(null);
        setTouched({});
        setExistingResult(null);
      } else {
        const first = payload.rejected[0];
        setTopError(first?.reason ?? 'Row rejected');
      }
    } catch (err) {
      setTopError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (availableForms.length === 0) {
    return (
      <div className="card p-6">
        <Alert variant="warning" title="No access">
          Your role does not have permission to submit lab results.
        </Alert>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-6" autoComplete="off">
      <Field label="Lab form" htmlFor="lab-form-select">
        <Select
          id="lab-form-select"
          value={formId}
          onChange={handleFormChange}
          options={availableForms.map((f) => ({ value: f.id, label: f.title }))}
        />
      </Field>

      {!verified && (
        <div className="space-y-2">
          <CaseSearch
            onSelect={(selectedEpid) => {
              set('EPID', selectedEpid);
              void verifyEpid(selectedEpid);
            }}
          />
          {verifying && <Spinner size="sm" label="Loading case…" />}
        </div>
      )}

      {verified && (
        <>
          <div className="flex items-start justify-between bg-nphi-50/70 border border-nphi-200 rounded-xl p-3">
            <div className="flex items-start gap-3 text-sm">
              <span className="h-9 w-9 rounded-full bg-white border border-nphi-200 flex items-center justify-center text-nphi-700 shrink-0">
                <User01 className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold text-gray-900">
                  {verified.patient.displayName}
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-1.5">
                  <span className="font-mono">{verified.epid}</span>
                  {verified.disease && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-nphi-200 text-nphi-800 text-[11px] font-medium">
                        {verified.disease}
                      </span>
                    </>
                  )}
                  {verified.recordType === 'case' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Case
                    </span>
                  )}
                  {verified.patient.gender && <span>· {verified.patient.gender}</span>}
                  {verified.patient.birthDate && (
                    <span>· DOB {verified.patient.birthDate}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={editEpid}
              className="text-xs inline-flex items-center text-nphi-700 hover:text-nphi-800"
            >
              <Edit01 className="h-4 w-4 mr-1" /> Change
            </button>
          </div>

          {autoSwitchedFrom && (
            <Alert
              variant="warning"
              title={`Switched to ${getLabForm(formId)?.title ?? formId}`}
            >
              Based on this EPID
              {verified.disease ? ` (${verified.disease})` : ''}. You had{' '}
              {getLabForm(autoSwitchedFrom)?.title ?? autoSwitchedFrom} selected.
            </Alert>
          )}

          {!autoSwitchedFrom &&
            verified.suggestedForms &&
            verified.suggestedForms.length > 0 &&
            !verified.suggestedForms.includes(formId) && (
              <Alert variant="warning" title="Form may not match this EPID">
                This EPID
                {verified.disease ? ` (${verified.disease})` : ''} usually maps
                to a different lab form, but your role does not have access to
                it. Submitting under {getLabForm(formId)?.title ?? formId} anyway.
              </Alert>
            )}
        </>
      )}

      {verified && form?.specimenBased && (
        <SpecimenEntry form={form} epid={verified.epid} patientId={verified.patient.id} />
      )}

      {verified && !form?.specimenBased && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          {visibleItems.map((it) => {
            const value = answers[it.linkId] ?? '';
            const showError = touched[it.linkId] && !!fieldErrors[it.linkId];
            const inlineError = showError ? fieldErrors[it.linkId] : null;
            // For cross-field date min, look up the parent answer.
            const minLink = dateMinFromLinkId(it);
            const minDate =
              minLink && answers[minLink] ? answers[minLink] : undefined;
            return (
              <Field
                key={it.linkId}
                label={labelFor(it)}
                htmlFor={`f-${it.linkId}`}
                required={it.required}
                hint={!inlineError && fieldHint(it)}
                error={inlineError}
              >
                <QuestionInput
                  item={it}
                  value={value}
                  invalid={!!inlineError}
                  minDate={minDate}
                  onChange={(v) => set(it.linkId, v)}
                  onBlur={() => markTouched(it.linkId)}
                />
              </Field>
            );
          })}
        </div>
      )}

      {topError && <Alert variant="error">{topError}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {verified && !form?.specimenBased && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? (
              <Spinner size="sm" className="text-white" label="Submitting…" />
            ) : (
              'Submit result'
            )}
          </button>
        </div>
      )}

      {existingResult && verified && (
        <ExistingResultModal
          formTitle={existingResult.formTitle}
          count={existingResult.count}
          latest={existingResult.latest}
          subject={verified.epid}
          onProceed={() => setExistingResult(null)}
          onCancel={editEpid}
        />
      )}
    </form>
  );
}

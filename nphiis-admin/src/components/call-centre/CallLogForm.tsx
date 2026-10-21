'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fhirApi } from '@/lib/api';
import {
  CALL_LOG_FIELDS,
  LOCATION_ITEMS,
  callLogSections,
  cleanPayload,
  isVisible,
  AUTO_FIELDS,
  nowInKenya,
  nowTimeInKenya,
  sectionTitle,
  validateCallLog,
  type CallLogPayload,
  type LinkedCase,
  type LocationAnswer,
} from '@/lib/call-centre';
import { isHidden, isItemEnabled, labelFor, type AnswerMap, type QuestionnaireItem } from '@/lib/questionnaires';
import { Alert } from '../ui/Alert';
import { Field, Select } from '../ui/Field';
import Spinner from '../ui/Spinner';
import QuestionInput, { fieldHint } from '../questionnaire/QuestionInput';
import FacilitySearchInput from './FacilitySearchInput';
import CaseLinker from './CaseLinker';

type Locations = Record<string, LocationAnswer>;

/** County, sub-county or ward picker, filtered by the location picked before it. */
function LocationSelect({
  linkId,
  parentId,
  value,
  invalid,
  onChange,
}: {
  linkId: string;
  parentId?: string;
  value?: LocationAnswer;
  invalid: boolean;
  onChange: (v: LocationAnswer | undefined) => void;
}) {
  const level = LOCATION_ITEMS[linkId].level;
  const [options, setOptions] = useState<LocationAnswer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (level !== 'county' && !parentId) {
      setOptions([]);
      return;
    }
    setLoading(true);
    const load =
      level === 'county'
        ? fhirApi.getCounties()
        : level === 'subcounty'
          ? fhirApi.getSubCounties(parentId!)
          : fhirApi.getWards(parentId!);
    load
      .then((list) => {
        if (!cancelled) {
          setOptions(list.map((l) => ({ id: l.id, name: l.name })));
          setError(null);
        }
      })
      .catch(() => !cancelled && setError('Could not load locations'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [level, parentId]);

  // A log read back without a location id: show its saved name until a new one is picked.
  const selectOptions = options.map((o) => ({ value: o.id, label: o.name }));
  if (value && !value.id) selectOptions.unshift({ value: '', label: `${value.name} (pick again)` });

  return (
    <>
      <Select
        id={`f-${linkId}`}
        value={value?.id ?? ''}
        invalid={invalid}
        disabled={level !== 'county' && !parentId}
        placeholder={loading ? 'Loading…' : level !== 'county' && !parentId ? 'Pick the one above first' : 'Select…'}
        options={selectOptions}
        onChange={(id) => onChange(options.find((o) => o.id === id))}
      />
      {error && <p className="text-xs text-accent-700 mt-1">{error}</p>}
    </>
  );
}

const AUTO_HINTS: Record<string, string> = {
  [CALL_LOG_FIELDS.date]: 'Set when this form was opened',
  [CALL_LOG_FIELDS.agent]: 'Your account',
  [CALL_LOG_FIELDS.callEnd]: 'Set when you save',
};

/** A value the system fills in, shown read-only. */
function AutoValue({ linkId, value }: { linkId: string; value?: string }) {
  let text = value;
  if (linkId === CALL_LOG_FIELDS.date && value) {
    const d = new Date(`${value.length === 16 ? `${value}:00` : value}+03:00`);
    if (!Number.isNaN(d.getTime())) {
      text = d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' });
    }
  }
  return (
    <div
      id={`f-${linkId}`}
      className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700"
    >
      {text || <span className="text-gray-400">{linkId === CALL_LOG_FIELDS.callEnd ? 'On save' : '—'}</span>}
    </div>
  );
}

/** The questions to render inside a group, keeping nested groups' order. */
function groupItems(group: QuestionnaireItem, answers: AnswerMap): QuestionnaireItem[] {
  const out: QuestionnaireItem[] = [];
  for (const it of group.item ?? []) {
    if (isHidden(it) || !isItemEnabled(it, answers)) continue;
    if (it.type === 'group') out.push(...groupItems(it, answers));
    else out.push(it);
  }
  return out;
}

export default function CallLogForm({
  initial,
  agentName,
  onSubmit,
  onCancel,
}: {
  /** The saved log, when editing. */
  initial?: CallLogPayload;
  agentName?: string;
  onSubmit: (payload: CallLogPayload) => Promise<Record<string, string> | void>;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(
    () =>
      initial?.answers ?? {
        // Filled by the system; the call-end time is set on save.
        [CALL_LOG_FIELDS.date]: nowInKenya(),
        ...(agentName ? { [CALL_LOG_FIELDS.agent]: agentName } : {}),
      },
  );
  const [locations, setLocations] = useState<Locations>(() => initial?.locations ?? {});
  const [linkedCase, setLinkedCase] = useState<LinkedCase | null>(() => initial?.linkedCase ?? null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // enableWhen reads location questions by id, like the other answers.
  const answersWithLocations = useMemo(() => {
    const out = { ...answers };
    for (const [k, v] of Object.entries(locations)) if (v.id) out[k] = v.id;
    return out;
  }, [answers, locations]);
  const errors = useMemo(
    () => ({ ...validateCallLog({ answers, locations }), ...serverErrors }),
    [answers, locations, serverErrors],
  );
  const sections = callLogSections().filter((s) => isItemEnabled(s, answersWithLocations) && !isHidden(s));

  const setAnswer = (linkId: string, v: string) => {
    setServerErrors({});
    setAnswers((prev) => ({ ...prev, [linkId]: v }));
  };
  const setLocation = (linkId: string, v: LocationAnswer | undefined) => {
    setServerErrors({});
    setLocations((prev) => {
      const next = { ...prev };
      if (v) next[linkId] = v;
      else delete next[linkId];
      // A new county clears the sub-county and ward under it, and so on down.
      for (const [child, def] of Object.entries(LOCATION_ITEMS)) {
        if (def.parent === linkId && prev[linkId]?.id !== v?.id) delete next[child];
      }
      for (const [child, def] of Object.entries(LOCATION_ITEMS)) {
        if (def.parent && !next[def.parent]) delete next[child];
      }
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    // A new log ends now; an edited one keeps the time it was saved with.
    const final: AnswerMap = { ...answers };
    if (!final[CALL_LOG_FIELDS.callEnd]) final[CALL_LOG_FIELDS.callEnd] = nowTimeInKenya();
    if (!final[CALL_LOG_FIELDS.agent] && agentName) final[CALL_LOG_FIELDS.agent] = agentName;
    if (Object.keys(validateCallLog({ answers: final, locations })).length) {
      setError('Some answers need attention. They are marked below.');
      return;
    }
    setSaving(true);
    try {
      const problems = await onSubmit(cleanPayload({ answers: final, locations, linkedCase }));
      if (problems) {
        setServerErrors(problems);
        setError('Some answers need attention. They are marked below.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {sections.map((section) => {
        const items = groupItems(section, answersWithLocations);
        if (items.length === 0) return null;
        return (
          <fieldset key={section.linkId} className="space-y-4">
            {section.text && (
              <legend className="text-sm font-semibold text-nphi-900 pb-1">{sectionTitle(section.text)}</legend>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
              {items.map((it) => {
                if (it.type === 'display') {
                  return (
                    <p key={it.linkId} className="md:col-span-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                      {it.text}
                    </p>
                  );
                }
                const shownError =
                  (submitted || touched[it.linkId]) &&
                  !AUTO_FIELDS.has(it.linkId) &&
                  isVisible(it.linkId, answersWithLocations)
                    ? errors[it.linkId] ?? null
                    : null;
                const wide = it.type === 'text' || (it.type === 'choice' && (it.repeats || (it.answerOption?.length ?? 0) > 3));
                const location = LOCATION_ITEMS[it.linkId];
                return (
                  <div key={it.linkId} className={wide ? 'md:col-span-2' : ''}>
                    <Field
                      label={labelFor(it)}
                      htmlFor={`f-${it.linkId}`}
                      required={it.required}
                      hint={!shownError && (AUTO_FIELDS.has(it.linkId) ? AUTO_HINTS[it.linkId] : fieldHint(it))}
                      error={shownError}
                    >
                      {location ? (
                        <LocationSelect
                          linkId={it.linkId}
                          parentId={location.parent ? locations[location.parent]?.id || undefined : undefined}
                          value={locations[it.linkId]}
                          invalid={!!shownError}
                          onChange={(v) => {
                            setLocation(it.linkId, v);
                            setTouched((t) => ({ ...t, [it.linkId]: true }));
                          }}
                        />
                      ) : AUTO_FIELDS.has(it.linkId) ? (
                        <AutoValue linkId={it.linkId} value={answers[it.linkId]} />
                      ) : it.linkId === CALL_LOG_FIELDS.facility ? (
                        <FacilitySearchInput
                          id={`f-${it.linkId}`}
                          value={answers[it.linkId] ?? ''}
                          required={it.required}
                          invalid={!!shownError}
                          onChange={(v) => setAnswer(it.linkId, v)}
                          onBlur={() => setTouched((t) => ({ ...t, [it.linkId]: true }))}
                        />
                      ) : (
                        <QuestionInput
                          item={it}
                          value={answers[it.linkId] ?? ''}
                          invalid={!!shownError}
                          onChange={(v) => setAnswer(it.linkId, v)}
                          onBlur={() => setTouched((t) => ({ ...t, [it.linkId]: true }))}
                        />
                      )}
                    </Field>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-nphi-900 pb-1">Linked case (optional)</legend>
        <p className="text-xs text-gray-500">
          Call logs get no EPID of their own. If the call is about a registered case, link it here; its EPID is
          shown on the log. You can also link one later by editing the log.
        </p>
        <CaseLinker value={linkedCase} onChange={setLinkedCase} />
      </fieldset>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex justify-end gap-3 pt-2 border-t border-nphi-100/60">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner size="sm" className="text-white" label="Saving…" /> : initial ? 'Save changes' : 'Save call'}
        </button>
      </div>
    </form>
  );
}

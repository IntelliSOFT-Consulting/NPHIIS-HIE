'use client';

import { useMemo, useState } from 'react';
import { useAuthedFetch } from '@/lib/auth-context';
import { caseLevelFormFor, flattenItems, labelFor } from '@/lib/questionnaires';
import Spinner from '../ui/Spinner';
import { Alert } from '../ui/Alert';
import { Field } from '../ui/Field';
import QuestionInput, { fieldHint } from '../questionnaire/QuestionInput';

/**
 * The answers about the case rather than a specimen (e.g. the VHF final
 * classification), saved as a lab Encounter on the case like a questionnaire
 * lab form. Renders nothing for a form without any.
 */
export default function CaseLevelAnswers({ formId, epid }: { formId: string; epid: string }) {
  const authedFetch = useAuthedFetch();
  const form = caseLevelFormFor(formId);
  const items = useMemo(() => (form ? flattenItems(form.questionnaire) : []), [form]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!form || !items.length) return null;
  const filled = items.some((it) => answers[it.linkId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const row: Record<string, string> = { EPID: epid };
      for (const it of items) if (answers[it.linkId]) row[it.linkId] = answers[it.linkId];
      const res = await authedFetch('/api/lab/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId: form.id, rows: [row], force: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not save');
      if (body.accepted !== 1) throw new Error(body.rejected?.[0]?.reason ?? 'Could not save');
      setSuccess(`Saved for ${epid}.`);
      setAnswers({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-4">
      <div>
        <div className="text-sm font-semibold text-gray-900">Case</div>
        <div className="text-xs text-gray-500">About the case as a whole, not one specimen. A new answer replaces the earlier one in reports.</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        {items.map((it) => (
          <Field key={it.linkId} label={labelFor(it)} htmlFor={`c-${it.linkId}`} hint={fieldHint(it)}>
            <QuestionInput
              item={it}
              value={answers[it.linkId] ?? ''}
              invalid={false}
              onChange={(v) => setAnswers((a) => ({ ...a, [it.linkId]: v }))}
              onBlur={() => undefined}
            />
          </Field>
        ))}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving || !filled} className="btn-secondary">
          {saving ? <Spinner size="sm" label="Saving…" /> : 'Save'}
        </button>
      </div>
    </div>
  );
}

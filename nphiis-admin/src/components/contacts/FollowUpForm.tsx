'use client';

import { useState } from 'react';
import type { BoardContact } from '@/lib/fhir-contacts';
import { Alert } from '../ui/Alert';
import { CheckboxGroup, DateInput, Field, RadioGroup, Select, TextInput } from '../ui/Field';

// Options of the mobile follow-up form (vhf-contact-follow-up.json).
const SYMPTOMS = [
  ['fever', 'Fever'], ['malaise', 'Malaise'], ['muscle-pain', 'Muscle pain'], ['headache', 'Headache'],
  ['fatigue', 'Weakness / fatigue'], ['sore-throat', 'Sore throat'], ['vomiting', 'Vomiting'], ['diarrhea', 'Diarrhoea'],
  ['rash', 'Rash'], ['unexplained-bleeding', 'Hemorrhage'], ['hiccups', 'Hiccups'], ['other', 'Other'],
].map(([value, label]) => ({ value, label }));

export interface FollowUpPayload {
  day: number;
  date: string;
  symptomatic: boolean;
  symptoms?: string[];
  temperatureAm?: number;
  temperaturePm?: number;
  approach?: 'physical-visit' | 'phone-call';
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
const todayKenya = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

export default function FollowUpForm({
  contact,
  onSave,
  onCancel,
}: {
  contact: BoardContact;
  onSave: (f: FollowUpPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const today = todayKenya();
  // Today's day when it falls in the window, else the first day not yet recorded.
  const recorded = new Set(contact.days.filter((d) => d.state === 'seen' || d.state === 'symptomatic').map((d) => d.day));
  const firstOpen = contact.days.find((d) => !recorded.has(d.day) && d.date <= today)?.day;
  const initialDay = contact.daysSinceExposure >= 1 && contact.daysSinceExposure <= 21 ? contact.daysSinceExposure : firstOpen ?? 1;

  const [day, setDay] = useState(initialDay);
  const [date, setDate] = useState(() => {
    const d = addDays(contact.dayZero, initialDay);
    return d > today ? today : d;
  });
  const [symptomatic, setSymptomatic] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [approach, setApproach] = useState('');
  const [tempAm, setTempAm] = useState('');
  const [tempPm, setTempPm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayOptions = contact.days
    .filter((d) => d.date <= today)
    .map((d) => ({ value: String(d.day), label: `Day ${d.day} · ${new Date(`${d.date}T00:00:00`).toLocaleDateString()}${recorded.has(d.day) ? ' (recorded)' : ''}` }));
  const temp = (v: string) => (v.trim() ? Number(v) : undefined);

  const submit = async () => {
    if (!symptomatic) return setError('Say whether the contact has symptoms');
    if (symptomatic === 'yes' && !symptoms.length) return setError('Tick the symptoms');
    for (const t of [tempAm, tempPm]) {
      if (t.trim() && !(Number(t) >= 30 && Number(t) <= 45)) return setError('Temperatures are in °C (30–45)');
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        day,
        date,
        symptomatic: symptomatic === 'yes',
        ...(symptomatic === 'yes' ? { symptoms } : {}),
        ...(temp(tempAm) != null ? { temperatureAm: temp(tempAm) } : {}),
        ...(temp(tempPm) != null ? { temperaturePm: temp(tempPm) } : {}),
        ...(approach ? { approach: approach as FollowUpPayload['approach'] } : {}),
      });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Day of follow up" required>
          <Select
            value={String(day)}
            onChange={(v) => {
              const n = Number(v);
              setDay(n);
              const d = addDays(contact.dayZero, n);
              setDate(d > today ? today : d);
            }}
            options={dayOptions.length ? dayOptions : [{ value: '1', label: 'Day 1' }]}
          />
        </Field>
        <Field label="Date of follow up" required>
          <DateInput
            value={date}
            onChange={(d) => {
              setDate(d);
              // The day is the date's distance from the date of contact (as hie-auth and mobile count it).
              const n = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${contact.dayZero}T00:00:00Z`)) / 86_400_000);
              if (n >= 0 && n <= 21) setDay(n);
            }}
            min={contact.dayZero}
            max={addDays(contact.dayZero, 21)}
            noFuture
          />
        </Field>
        <Field label="Follow up approach">
          <Select
            value={approach}
            onChange={setApproach}
            placeholder="Select…"
            options={[
              { value: 'physical-visit', label: 'Physical visit' },
              { value: 'phone-call', label: 'Phone call' },
            ]}
          />
        </Field>
      </div>
      <Field label="Symptomatic?" required>
        <RadioGroup
          name={`symptomatic-${contact.encounterId}`}
          value={symptomatic}
          onChange={setSymptomatic}
          options={[
            { value: 'no', label: 'No symptoms' },
            { value: 'yes', label: 'Has symptoms' },
          ]}
        />
      </Field>
      {symptomatic === 'yes' && (
        <>
          <Field label="Symptoms" required>
            <CheckboxGroup name={`symptoms-${contact.encounterId}`} values={symptoms} options={SYMPTOMS} onChange={setSymptoms} />
          </Field>
          <Alert variant="warning">
            A symptomatic contact is a suspected case: refer them for isolation and care, then use Convert to case.
          </Alert>
        </>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Temperature AM (°C)">
          <TextInput inputMode="decimal" value={tempAm} onChange={(e) => setTempAm(e.target.value)} />
        </Field>
        <Field label="Temperature PM (°C)">
          <TextInput inputMode="decimal" value={tempPm} onChange={(e) => setTempPm(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-3">
        <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : 'Save follow up'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

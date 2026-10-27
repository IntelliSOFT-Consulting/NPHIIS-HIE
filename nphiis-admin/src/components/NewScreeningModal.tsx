'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import { SCREENING_OUTCOME_LABEL, SCREENING_OUTCOMES, type ScreeningOutcome } from '@/lib/screenings';
import { Alert } from './ui/Alert';
import { CheckboxGroup, DateInput, Field, RadioGroup, Select, TextInput } from './ui/Field';
import Spinner from './ui/Spinner';

// Values accepted by hie-auth POST /provider/screenings (hie-auth src/lib/screening.ts).
const ID_TYPES = [
  'National ID',
  'Alien ID',
  'Refugee ID',
  'Birth Certificate',
  'Birth Notification',
  'Temporary ID',
  'Mandate Number',
  'ClientRegistry ID',
];
const POE_TYPES = [
  { value: 'airport', label: 'Airport' },
  { value: 'seaport', label: 'Seaport' },
  { value: 'border', label: 'Border crossing' },
  { value: 'facility', label: 'Health facility' },
  { value: 'community', label: 'Community' },
];
const SYMPTOMS = [
  { value: 'fever', label: 'Fever' },
  { value: 'cough', label: 'Cough' },
  { value: 'sore-throat', label: 'Sore throat' },
  { value: 'difficulty-breathing', label: 'Difficulty breathing' },
  { value: 'headache', label: 'Headache' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'muscle-pain', label: 'Muscle pain' },
  { value: 'vomiting', label: 'Vomiting' },
  { value: 'diarrhoea', label: 'Diarrhoea' },
  { value: 'abdominal-pain', label: 'Abdominal pain' },
  { value: 'rash', label: 'Rash' },
  { value: 'bleeding', label: 'Unexplained bleeding' },
  { value: 'jaundice', label: 'Jaundice' },
  { value: 'confusion', label: 'Confusion' },
  { value: 'other', label: 'Other' },
];
const MEANS = [
  { value: '', label: 'Means of travel' },
  { value: 'air', label: 'Air' },
  { value: 'land', label: 'Land' },
  { value: 'water', label: 'Water' },
];

type Trip = { country: string; city: string; departureDate: string; arrivalDate: string; means: string };
const EMPTY_TRIP: Trip = { country: '', city: '', departureDate: '', arrivalDate: '', means: '' };

function todayKenya(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

function newScreeningId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `scr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function NewScreeningModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const authedFetch = useAuthedFetch();
  // Kept for the life of the form, so resubmitting after an error cannot create a second screening.
  const [screeningId] = useState(newScreeningId);
  const [countries, setCountries] = useState<{ code: string; display: string }[]>([]);

  const [idType, setIdType] = useState('National ID');
  const [idValue, setIdValue] = useState('');
  const [givenNames, setGivenNames] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [county, setCounty] = useState('');
  const [subCounty, setSubCounty] = useState('');

  const [screenedOn, setScreenedOn] = useState(todayKenya());
  const [poeName, setPoeName] = useState('');
  const [poeType, setPoeType] = useState('');

  const [travelled, setTravelled] = useState<'yes' | 'no' | 'unknown' | ''>('');
  const [trips, setTrips] = useState<Trip[]>([{ ...EMPTY_TRIP }]);

  const [temperature, setTemperature] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [onsets, setOnsets] = useState<Record<string, string>>({});

  const [outcome, setOutcome] = useState<ScreeningOutcome | ''>('');

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    authedFetch('/api/provider/screenings/countries')
      .then((r) => r.json())
      .then((b) => setCountries(b.countries ?? []))
      .catch(() => setCountries([]));
  }, [authedFetch]);

  const countryOptions = useMemo(
    () => [{ value: '', label: 'Country' }, ...countries.map((c) => ({ value: c.code, label: c.display }))],
    [countries],
  );

  const updateTrip = (i: number, patch: Partial<Trip>) =>
    setTrips((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  function validate(): string[] {
    const out: string[] = [];
    if (!idValue.trim()) out.push('Enter the ID number.');
    if (!givenNames.trim() && !familyName.trim()) out.push('Enter the person’s name.');
    if (!travelled) out.push('Answer whether the person has travelled.');
    if (travelled === 'yes' && !trips.some((t) => t.country)) out.push('Add at least one country travelled from.');
    for (const t of trips) {
      if (t.departureDate && t.arrivalDate && t.arrivalDate < t.departureDate)
        out.push('A trip’s arrival date is before its departure date.');
    }
    if (temperature) {
      const n = Number(temperature);
      if (!Number.isFinite(n) || n < 25 || n > 45) out.push('Temperature must be between 25 and 45 °C.');
    }
    if (poeType && !poeName.trim()) out.push('Enter the point of entry name.');
    return out;
  }

  async function submit() {
    const problems = validate();
    setErrors(problems);
    if (problems.length) return;

    const filledTrips = travelled === 'yes' ? trips.filter((t) => t.country) : [];
    const payload = {
      screeningId,
      screenedAt: screenedOn || undefined,
      outcome: outcome || undefined,
      pointOfEntry: poeName.trim()
        ? { name: poeName.trim(), ...(poeType ? { type: poeType } : {}) }
        : undefined,
      patient: {
        identifiers: [{ type: idType, value: idValue.trim() }],
        givenNames: givenNames.trim() ? givenNames.trim().split(/\s+/) : undefined,
        familyName: familyName.trim() || undefined,
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        phone: phone.trim() || undefined,
        address:
          county.trim() || subCounty.trim()
            ? { county: county.trim() || undefined, subCounty: subCounty.trim() || undefined }
            : undefined,
      },
      travelHistory: {
        travelled,
        trips: filledTrips.map((t) => ({
          country: t.country,
          city: t.city.trim() || undefined,
          departureDate: t.departureDate || undefined,
          arrivalDate: t.arrivalDate || undefined,
          means: t.means || undefined,
        })),
      },
      signsAndSymptoms: {
        temperatureCelsius: temperature ? Number(temperature) : undefined,
        symptoms: SYMPTOMS.map((s) => ({
          code: s.value,
          present: symptoms.includes(s.value),
          onsetDate: symptoms.includes(s.value) ? onsets[s.value] || undefined : undefined,
        })),
      },
    };

    setSaving(true);
    try {
      const res = await authedFetch('/api/provider/screenings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.errors ?? [body.error ?? `Could not save the screening (${res.status}).`]);
        return;
      }
      const name = [givenNames, familyName].map((s) => s.trim()).filter(Boolean).join(' ');
      onSaved(
        body.duplicate
          ? 'This screening was already saved.'
          : body.patientCreated
            ? `Screening saved for ${name}.`
            : `Screening saved and added to ${name}’s existing record.`,
      );
    } catch (e) {
      setErrors([(e as Error).message || 'Could not save the screening.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/75 overflow-y-auto z-50 flex items-start justify-center p-4 sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-screening-title"
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 id="new-screening-title" className="text-lg font-semibold text-nphi-900">
            New screening
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form
          className="px-6 py-5 space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {errors.length > 0 && (
            <Alert variant="error" title="Check the form">
              <ul className="list-disc pl-5 space-y-0.5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}

          <FormSection title="Person">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID type" required>
                <Select value={idType} onChange={setIdType} options={ID_TYPES.map((t) => ({ value: t, label: t }))} />
              </Field>
              <Field label="ID number" required hint="An existing person with this ID gets the screening added to their record.">
                <TextInput value={idValue} onChange={(e) => setIdValue(e.target.value)} />
              </Field>
              <Field label="Given names" required>
                <TextInput value={givenNames} onChange={(e) => setGivenNames(e.target.value)} />
              </Field>
              <Field label="Family name">
                <TextInput value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
              </Field>
              <Field label="Sex">
                <RadioGroup
                  name="gender"
                  value={gender}
                  onChange={setGender}
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                  ]}
                />
              </Field>
              <Field label="Date of birth">
                <DateInput value={birthDate} onChange={setBirthDate} noFuture />
              </Field>
              <Field label="Phone">
                <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <div />
              <Field label="County of residence">
                <TextInput value={county} onChange={(e) => setCounty(e.target.value)} />
              </Field>
              <Field label="Sub-county of residence">
                <TextInput value={subCounty} onChange={(e) => setSubCounty(e.target.value)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Where and when">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date screened">
                <DateInput value={screenedOn} onChange={setScreenedOn} noFuture />
              </Field>
              <Field label="Point of entry type">
                <Select
                  value={poeType}
                  onChange={setPoeType}
                  options={[{ value: '', label: 'Select…' }, ...POE_TYPES]}
                />
              </Field>
              <Field label="Point of entry name">
                <TextInput
                  value={poeName}
                  onChange={(e) => setPoeName(e.target.value)}
                  placeholder="e.g. JKIA, Busia border"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Travel history">
            <Field label="Has the person travelled in the last 21 days?" required>
              <RadioGroup
                name="travelled"
                value={travelled}
                onChange={(v) => setTravelled(v as typeof travelled)}
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                  { value: 'unknown', label: 'Unknown' },
                ]}
              />
            </Field>
            {travelled === 'yes' && (
              <div className="mt-4 space-y-3">
                {trips.map((t, i) => (
                  <div key={i} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] sm:items-start rounded-xl border border-gray-100 p-3">
                    <Select value={t.country} onChange={(v) => updateTrip(i, { country: v })} options={countryOptions} />
                    <TextInput placeholder="City / place" value={t.city} onChange={(e) => updateTrip(i, { city: e.target.value })} />
                    <DateInput value={t.departureDate} onChange={(v) => updateTrip(i, { departureDate: v })} noFuture placeholder="Departed" />
                    <DateInput value={t.arrivalDate} onChange={(v) => updateTrip(i, { arrivalDate: v })} noFuture placeholder="Arrived" />
                    <Select value={t.means} onChange={(v) => updateTrip(i, { means: v })} options={MEANS} />
                    <button
                      type="button"
                      onClick={() => setTrips((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ ...EMPTY_TRIP }]))}
                      className="self-center rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                      aria-label="Remove trip"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTrips((prev) => [...prev, { ...EMPTY_TRIP }])}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-nphi-700 hover:text-nphi-900"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add another country
                </button>
              </div>
            )}
          </FormSection>

          <FormSection title="Signs and symptoms">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Temperature (°C)">
                <TextInput
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={25}
                  max={45}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Symptoms present (tick all that apply)">
                <CheckboxGroup name="symptoms" values={symptoms} options={SYMPTOMS} onChange={setSymptoms} />
              </Field>
            </div>
            {symptoms.length > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {SYMPTOMS.filter((s) => symptoms.includes(s.value)).map((s) => (
                  <Field key={s.value} label={`${s.label} — onset date`}>
                    <DateInput
                      value={onsets[s.value] ?? ''}
                      onChange={(v) => setOnsets((prev) => ({ ...prev, [s.value]: v }))}
                      noFuture
                    />
                  </Field>
                ))}
              </div>
            )}
          </FormSection>

          <FormSection title="Outcome">
            <RadioGroup
              name="outcome"
              value={outcome}
              onChange={(v) => setOutcome(v as ScreeningOutcome)}
              options={SCREENING_OUTCOMES.map((o) => ({ value: o, label: SCREENING_OUTCOME_LABEL[o] }))}
            />
          </FormSection>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-nphi-gradient text-sm font-medium text-white shadow-sm disabled:opacity-50"
            >
              {saving && <Spinner size="sm" />}
              Save screening
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">{title}</h4>
      {children}
    </section>
  );
}

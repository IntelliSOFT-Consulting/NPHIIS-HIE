'use client';

import { useEffect, useMemo, useState } from 'react';
import { fhirApi, type FhirCounty, type FhirSubCounty } from '@/lib/api';
import { parsePhone, type ImportedContact } from '@/lib/contact-import';
import type { Relationship } from '@/lib/vhf-contacts';
import { DateInput, Field, Select, TextInput } from '../ui/Field';

const RELATIONSHIPS: Array<{ value: Relationship; label: string }> = [
  { value: 'family', label: 'Family member' },
  { value: 'hcw', label: 'Health care worker' },
  { value: 'friend', label: 'Friend' },
  { value: 'workmate', label: 'Workmate' },
  { value: 'other', label: 'Other' },
];
const SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const same = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// Counties change rarely: load them once per page.
let countiesOnce: Promise<FhirCounty[]> | null = null;
const loadCounties = () => (countiesOnce ??= fhirApi.getCounties().catch((e) => {
  countiesOnce = null;
  throw e;
}));

interface Values {
  givenNames: string;
  familyName: string;
  sex: string;
  age: string;
  phone: string;
  idNumber: string;
  contactDate: string;
  relationship: string;
  relationshipOther: string;
  county: string;
  subCounty: string;
  village: string;
}

function valuesOf(c?: ImportedContact): Values {
  return {
    givenNames: c?.givenNames ?? '',
    familyName: c?.familyName ?? '',
    sex: c?.sex ?? '',
    age: c?.ageYears != null ? String(c.ageYears) : '',
    phone: c?.phone ?? '',
    idNumber: c?.idNumber ?? '',
    contactDate: c?.contactDate ?? '',
    relationship: c?.relationship ?? '',
    relationshipOther: c?.relationshipOther ?? '',
    county: c?.countyName ?? '',
    subCounty: c?.subCountyName ?? '',
    village: c?.village ?? '',
  };
}

type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values, today: string): Errors {
  const e: Errors = {};
  if (!v.givenNames.trim()) e.givenNames = 'Enter the given names';
  if (!v.familyName.trim()) e.familyName = 'Enter the surname';
  if (v.phone.trim() && !parsePhone(v.phone)) e.phone = 'Use 07XXXXXXXX, 01XXXXXXXX or +254…';
  if (v.age.trim()) {
    const n = Number(v.age);
    if (!Number.isInteger(n) || n < 0 || n > 120) e.age = 'Whole years, 0–120';
  }
  if (v.contactDate && v.contactDate > today) e.contactDate = 'Cannot be in the future';
  if (v.relationship === 'other' && !v.relationshipOther.trim()) e.relationshipOther = 'Say how they are related';
  return e;
}

/**
 * A contact entered by hand, or a row of the line list being corrected. County and sub-county
 * are kept as names; the server matches them to Locations when the list is checked.
 */
export default function ContactForm({
  initial,
  rowNumber,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ImportedContact;
  rowNumber: number;
  submitLabel: string;
  onSubmit: (contact: ImportedContact) => void;
  onCancel: () => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [v, setV] = useState<Values>(() => valuesOf(initial));
  const [touched, setTouched] = useState(false);
  const [counties, setCounties] = useState<FhirCounty[]>([]);
  const [subCounties, setSubCounties] = useState<FhirSubCounty[]>([]);
  const [placesError, setPlacesError] = useState(false);
  const errors = validate(v, today);
  const show = (k: keyof Values) => (touched ? errors[k] : undefined);
  const set = (k: keyof Values) => (value: string) => setV((prev) => ({ ...prev, [k]: value }));

  useEffect(() => {
    loadCounties().then(setCounties, () => setPlacesError(true));
  }, []);

  const countyId = counties.find((c) => same(c.name, v.county))?.id;
  useEffect(() => {
    setSubCounties([]);
    if (!countyId) return;
    let live = true;
    fhirApi.getSubCounties(countyId).then(
      (s) => live && setSubCounties([...s].sort((a, b) => a.name.localeCompare(b.name))),
      () => live && setPlacesError(true),
    );
    return () => {
      live = false;
    };
  }, [countyId]);

  // "Nairobi" from a sheet selects "NAIROBI".
  useEffect(() => {
    const county = counties.find((c) => same(c.name, v.county))?.name;
    const subCounty = subCounties.find((s) => same(s.name, v.subCounty))?.name;
    if ((county && county !== v.county) || (subCounty && subCounty !== v.subCounty)) {
      setV((prev) => ({ ...prev, county: county ?? prev.county, subCounty: subCounty ?? prev.subCounty }));
    }
  }, [counties, subCounties, v.county, v.subCounty]);

  // A name from the sheet that is not a known place stays selectable, so it can be seen and changed.
  const withCurrent = (names: string[], current: string) =>
    [...(current && !names.some((n) => same(n, current)) ? [current] : []), ...names].map((n) => ({ value: n, label: n }));
  const countyOptions = withCurrent(counties.map((c) => c.name), v.county);
  const subCountyOptions = withCurrent(subCounties.map((s) => s.name), v.subCounty);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    const age = v.age.trim() ? Number(v.age) : undefined;
    const relationship = (v.relationship || undefined) as Relationship | undefined;
    onSubmit({
      // Keep what the form does not show (follow-up days, notes, flight seat …).
      ...initial,
      rowNumber,
      givenNames: v.givenNames.trim(),
      familyName: v.familyName.trim(),
      sex: (v.sex || undefined) as ImportedContact['sex'],
      ageYears: age,
      birthDate: age != null ? undefined : initial?.birthDate,
      phone: v.phone.trim() ? (parsePhone(v.phone) ?? undefined) : undefined,
      idNumber: v.idNumber.trim() || undefined,
      contactDate: v.contactDate || undefined,
      relationship,
      relationshipOther: relationship === 'other' ? v.relationshipOther.trim() : undefined,
      countyName: v.county.trim() || undefined,
      subCountyName: v.subCounty.trim() || undefined,
      village: v.village.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Given names" htmlFor="cf-given" required error={show('givenNames')}>
          <TextInput id="cf-given" autoFocus value={v.givenNames} invalid={!!show('givenNames')} onChange={(e) => set('givenNames')(e.target.value)} />
        </Field>
        <Field label="Surname" htmlFor="cf-family" required error={show('familyName')}>
          <TextInput id="cf-family" value={v.familyName} invalid={!!show('familyName')} onChange={(e) => set('familyName')(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sex">
            <Select value={v.sex} onChange={set('sex')} options={SEXES} placeholder="—" />
          </Field>
          <Field label="Age (years)" htmlFor="cf-age" error={show('age')}>
            <TextInput id="cf-age" inputMode="numeric" value={v.age} invalid={!!show('age')} onChange={(e) => set('age')(e.target.value)} />
          </Field>
        </div>
        <Field label="Phone number" htmlFor="cf-phone" error={show('phone')} hint="Used for daily follow-up calls">
          <TextInput id="cf-phone" inputMode="tel" placeholder="07XXXXXXXX" value={v.phone} invalid={!!show('phone')} onChange={(e) => set('phone')(e.target.value)} />
        </Field>
        <Field label="ID number" htmlFor="cf-id">
          <TextInput id="cf-id" value={v.idNumber} onChange={(e) => set('idNumber')(e.target.value)} />
        </Field>
        <Field label="Date of contact" error={show('contactDate')} hint="Follow up runs 21 days from this date">
          <DateInput value={v.contactDate} onChange={set('contactDate')} noFuture invalid={!!show('contactDate')} />
        </Field>
        <Field label="Relationship to the case">
          <Select value={v.relationship} onChange={set('relationship')} options={RELATIONSHIPS} placeholder="—" />
        </Field>
        {v.relationship === 'other' && (
          <Field label="How are they related?" htmlFor="cf-rel-other" required error={show('relationshipOther')}>
            <TextInput id="cf-rel-other" value={v.relationshipOther} invalid={!!show('relationshipOther')} onChange={(e) => set('relationshipOther')(e.target.value)} />
          </Field>
        )}
        <Field label="County of residence" hint={placesError ? 'Could not load counties' : undefined}>
          <Select
            value={v.county}
            onChange={(name) => setV((prev) => ({ ...prev, county: name, subCounty: '' }))}
            options={countyOptions}
            placeholder={counties.length ? 'Select county' : 'Loading…'}
          />
        </Field>
        <Field label="Sub-county of residence" hint="Follow-up reminders go to this sub-county's officer">
          <Select
            value={v.subCounty}
            onChange={set('subCounty')}
            options={subCountyOptions}
            placeholder={v.county ? (subCounties.length ? 'Select sub-county' : 'Loading…') : 'Select a county first'}
            disabled={!v.county}
          />
        </Field>
        <Field label="Village / estate" htmlFor="cf-village">
          <TextInput id="cf-village" value={v.village} onChange={(e) => set('village')(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

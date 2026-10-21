'use client';

// One input for a Questionnaire item, picked by its type and item control.
// Shared by the lab result form and the Call Centre log.

import {
  dateMaxIsToday,
  itemControl,
  maxLength,
  minLength,
  splitMultiValue,
  MULTI_VALUE_SEPARATOR,
  type QuestionnaireItem,
} from '@/lib/questionnaires';
import { CheckboxGroup, DateInput, RadioGroup, Select, TextInput } from '../ui/Field';

const ENTRY_FORMAT_EXT = 'http://hl7.org/fhir/StructureDefinition/entryFormat';

/** Guidance shown under a question: the date rule, else the form's entry-format text. */
export function fieldHint(it: QuestionnaireItem): string | null {
  if ((it.type === 'date' || it.type === 'dateTime') && dateMaxIsToday(it)) {
    return 'Cannot be a date in the future';
  }
  return it.extension?.find((e) => e.url === ENTRY_FORMAT_EXT)?.valueString ?? null;
}

export default function QuestionInput({
  item,
  value,
  invalid,
  minDate,
  onChange,
  onBlur,
}: {
  item: QuestionnaireItem;
  value: string;
  invalid: boolean;
  minDate?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const id = `f-${item.linkId}`;
  const required = item.required;
  switch (item.type) {
    case 'date':
      return (
        <DateInput
          id={id}
          required={required}
          noFuture={dateMaxIsToday(item)}
          min={minDate}
          invalid={invalid}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      );
    case 'dateTime':
      // Value as "yyyy-mm-ddThh:mm".
      return (
        <TextInput
          id={id}
          type="datetime-local"
          required={required}
          invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case 'time':
      return (
        <TextInput
          id={id}
          type="time"
          required={required}
          invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case 'integer':
      return (
        <TextInput
          id={id}
          type="number"
          step={1}
          required={required}
          invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case 'decimal':
    case 'quantity':
      return (
        <TextInput
          id={id}
          type="number"
          step="any"
          required={required}
          invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case 'boolean':
      return (
        <Select
          id={id}
          invalid={invalid}
          value={value}
          onChange={(v) => {
            onChange(v);
            onBlur();
          }}
          options={[
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ]}
        />
      );
    case 'choice':
    case 'open-choice': {
      const ctrl = itemControl(item);
      const codings = (item.answerOption ?? [])
        .map((o) => o.valueCoding)
        .filter((c): c is { code: string; display: string } => Boolean(c));
      if (item.repeats) {
        return (
          <CheckboxGroup
            name={item.linkId}
            values={splitMultiValue(value)}
            options={codings.map((c) => ({ value: c.code, label: c.display }))}
            onChange={(vs) => {
              onChange(vs.join(MULTI_VALUE_SEPARATOR));
              onBlur();
            }}
          />
        );
      }
      if (ctrl === 'radio-button') {
        return (
          <RadioGroup
            name={item.linkId}
            value={value}
            options={codings.map((c) => ({ value: c.code, label: c.display }))}
            onChange={(v) => {
              onChange(v);
              onBlur();
            }}
            required={required}
          />
        );
      }
      return (
        <Select
          id={id}
          invalid={invalid}
          value={value}
          onChange={(v) => {
            onChange(v);
            onBlur();
          }}
          options={codings.map((c) => ({ value: c.code, label: c.display }))}
        />
      );
    }
    case 'text':
      return (
        <textarea
          id={id}
          rows={3}
          required={required}
          minLength={minLength(item)}
          maxLength={maxLength(item)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-nphi-100 ${
            invalid ? 'border-accent-500 focus:border-accent-500' : 'border-gray-300 focus:border-nphi-600'
          }`}
        />
      );
    case 'string':
    default: {
      const ctrl = itemControl(item);
      return (
        <TextInput
          id={id}
          type={ctrl === 'phone-number' ? 'tel' : 'text'}
          required={required}
          minLength={minLength(item)}
          maxLength={maxLength(item)}
          invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    }
  }
}

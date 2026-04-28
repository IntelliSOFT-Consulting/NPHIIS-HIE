// Untitled-UI-styled form field primitives. Each input is paired with a
// `Field` wrapper that owns the label, optional hint, optional inline error,
// and the required asterisk so callers don't reimplement that boilerplate.

import {
  Fragment,
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from 'react';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from '@untitled-ui/icons-react';

const inputBase =
  'block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 ' +
  'placeholder:text-gray-500 shadow-sm transition-shadow ' +
  'focus:outline-none focus:ring-4 focus:ring-nphi-100 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';
const inputDefault = 'border-gray-300 focus:border-nphi-600';
const inputError = 'border-accent-500 focus:border-accent-500 focus:ring-accent-100';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export function Field({ label, htmlFor, required, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-accent-600 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs text-accent-700">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean;
  leadingIcon?: ReactNode;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { invalid, leadingIcon, autoComplete = 'off', className = '', ...rest },
  ref,
) {
  if (leadingIcon) {
    return (
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
          {leadingIcon}
        </span>
        <input
          ref={ref}
          autoComplete={autoComplete}
          className={`${inputBase} pl-10 ${invalid ? inputError : inputDefault} ${className}`}
          {...rest}
        />
      </div>
    );
  }
  return (
    <input
      ref={ref}
      autoComplete={autoComplete}
      className={`${inputBase} ${invalid ? inputError : inputDefault} ${className}`}
      {...rest}
    />
  );
});

/* ── Date input ─────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromISO(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function formatDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface DateInputProps {
  id?: string;
  /** Selected value as `yyyy-mm-dd`. Empty string means no selection. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Minimum selectable date as `yyyy-mm-dd`. */
  min?: string;
  /** Maximum selectable date as `yyyy-mm-dd`. */
  max?: string;
  /** When true, today is the upper bound (overrides `max` if more restrictive). */
  noFuture?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Untitled-UI styled date picker built on a custom calendar popover. The
 * native `<input type="date">` was replaced because its popup is browser-
 * controlled and can't be themed. The wire format stays `yyyy-mm-dd` so the
 * existing form validators / submission code don't change.
 */
export function DateInput({
  id,
  value,
  onChange,
  onBlur,
  min,
  max,
  noFuture,
  invalid,
  disabled,
  required: _required,
  placeholder = 'Select date',
  className = '',
}: DateInputProps) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const selected = fromISO(value);
  const minDate = fromISO(min);
  const effectiveMaxIso = noFuture
    ? max && max < toISO(today)
      ? max
      : toISO(today)
    : max;
  const maxDate = fromISO(effectiveMaxIso);

  const [view, setView] = useState<Date>(() =>
    startOfMonth(selected ?? today),
  );
  // If the bound value changes externally, keep the calendar in sync.
  useEffect(() => {
    if (selected) setView(startOfMonth(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isDisabled = (d: Date): boolean => {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };

  // 6-week × 7-day grid covering the visible month and adjacent days.
  const cells: Date[] = useMemo(() => {
    const start = startOfMonth(view);
    const startDay = start.getDay();
    const out: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      out.push(new Date(view.getFullYear(), view.getMonth(), 1 - startDay + i));
    }
    return out;
  }, [view]);

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton
            id={id}
            disabled={disabled}
            onBlur={onBlur}
            className={`${inputBase} pr-10 text-left flex items-center ${invalid ? inputError : inputDefault} ${className}`}
          >
            <span
              className={`flex-1 truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}
            >
              {selected ? formatDisplay(selected) : placeholder}
            </span>
            <Calendar
              className="h-4 w-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
          </PopoverButton>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-150"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <PopoverPanel
              anchor={{ to: 'bottom start', gap: 4 }}
              className="z-50 w-72 rounded-xl bg-white p-3 shadow-lg ring-1 ring-gray-200 focus:outline-none"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <button
                  type="button"
                  onClick={() => setView(addMonths(view, -1))}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold text-gray-900">
                  {view.toLocaleString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setView(addMonths(view, 1))}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((w, i) => (
                  <div
                    key={i}
                    className="text-center text-[11px] font-medium text-gray-500 py-1"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((d, i) => {
                  const outside = d.getMonth() !== view.getMonth();
                  const sel = selected ? sameDay(d, selected) : false;
                  const isToday = sameDay(d, today);
                  const dis = isDisabled(d);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={dis}
                      onClick={() => {
                        if (dis) return;
                        onChange(toISO(d));
                        close();
                        onBlur?.();
                      }}
                      className={`h-9 w-9 mx-auto rounded-full text-sm flex items-center justify-center transition-colors ${
                        dis
                          ? 'text-gray-300 cursor-not-allowed'
                          : sel
                            ? 'bg-nphi-600 text-white font-semibold hover:bg-nphi-700'
                            : outside
                              ? 'text-gray-400 hover:bg-gray-50'
                              : 'text-gray-900 hover:bg-gray-100'
                      } ${isToday && !sel ? 'ring-1 ring-inset ring-nphi-300' : ''}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  disabled={isDisabled(today)}
                  className="text-xs font-medium text-nphi-700 hover:text-nphi-800 disabled:text-gray-300 disabled:cursor-not-allowed"
                  onClick={() => {
                    onChange(toISO(today));
                    close();
                    onBlur?.();
                  }}
                >
                  Today
                </button>
                {selected && (
                  <button
                    type="button"
                    className="text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => {
                      onChange('');
                      close();
                      onBlur?.();
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </PopoverPanel>
          </Transition>
        </>
      )}
    </Popover>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Untitled-UI styled dropdown built on Headless UI's Listbox so the panel,
 * options, hover states, and check icon all match the design system —
 * something native <select> can't do (the popup is browser-controlled).
 *
 * Native form validation (`required`) doesn't apply because the input isn't
 * a real <select>. Callers should rely on their own validators (the lab
 * form already does field-level validation in validateItem()).
 */
export function Select({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  invalid,
  disabled,
  className = '',
}: SelectProps) {
  const selected = options.find((o) => o.value === value);
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className="relative">
        <ListboxButton
          id={id}
          name={name}
          className={`${inputBase} pr-10 text-left flex items-center justify-between ${invalid ? inputError : inputDefault} ${className}`}
        >
          <span
            className={`block truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className="h-4 w-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
        </ListboxButton>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <ListboxOptions
            anchor={{ to: 'bottom start', gap: 4 }}
            className="z-50 max-h-60 w-[var(--button-width)] overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-gray-200 focus:outline-none text-sm"
          >
            {options.map((o) => (
              <ListboxOption
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                as={Fragment}
              >
                {({ focus, selected }) => (
                  <li
                    className={`relative cursor-default select-none py-2 pl-9 pr-4 ${
                      o.disabled
                        ? 'text-gray-400 cursor-not-allowed'
                        : focus
                          ? 'bg-nphi-50 text-nphi-900'
                          : 'text-gray-900'
                    }`}
                  >
                    <span
                      className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}
                    >
                      {o.label}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-nphi-700">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </li>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Transition>
      </div>
    </Listbox>
  );
}

export interface RadioOption {
  value: string;
  label: string;
}

export interface RadioGroupProps {
  name: string;
  value: string;
  options: RadioOption[];
  onChange: (v: string) => void;
  required?: boolean;
}

export function RadioGroup({ name, value, options, onChange, required }: RadioGroupProps) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {options.map((o) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
              checked
                ? 'border-nphi-600 bg-nphi-50 text-nphi-800'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              required={required}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 text-nphi-600 focus:ring-nphi-500"
            />
            <span>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

// Idempotent-ish Patient updates we apply alongside every lab-results
// submission. Goal: bump `Patient.meta.lastUpdated` so downstream reports
// (Superset / Spark) can detect the patient as recently active.
//
// 1. Phone number normalised to E.164 Kenyan mobile (`+2547XXXXXXXX`) where
//    we recognise the format.
// 2. Address fields uppercased (KE surveillance reports expect this anyway).
// 3. A `last-lab-submission` extension stamped with `valueDateTime = now()`
//    so the resource always changes — guarantees the lastUpdated bump even
//    when phone/address are already canonical.

const LAST_LAB_EXTENSION =
  "http://nphiis.health.go.ke/StructureDefinition/last-lab-submission";

interface FhirExtension {
  url: string;
  valueDateTime?: string;
  [k: string]: unknown;
}

interface FhirTelecom {
  system?: string;
  value?: string;
  use?: string;
  [k: string]: unknown;
}

interface FhirAddress {
  use?: string;
  type?: string;
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  [k: string]: unknown;
}

interface FhirPatient {
  resourceType?: string;
  id?: string;
  telecom?: FhirTelecom[];
  address?: FhirAddress[];
  extension?: FhirExtension[];
  [k: string]: unknown;
}

/**
 * Normalise a Kenyan phone number to E.164 (`+2547XXXXXXXX`). Returns the
 * input unchanged when the shape isn't recognised so we never mangle a
 * number we don't understand.
 */
export function normalizeKenyanPhone(raw: string): string {
  if (!raw) return raw;
  // Strip whitespace, dashes, parens — keep + and digits.
  const cleaned = raw.replace(/[\s\-()]/g, "");
  // Already +254XXXXXXXXX (12 chars after +).
  if (/^\+254[17]\d{8}$/.test(cleaned)) return cleaned;
  // 254XXXXXXXXX without leading +.
  if (/^254[17]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  // 0XXXXXXXXX local 10-digit (07.., 01..).
  if (/^0[17]\d{8}$/.test(cleaned)) return `+254${cleaned.substring(1)}`;
  // 7XXXXXXXX or 1XXXXXXXX bare 9-digit subscriber.
  if (/^[17]\d{8}$/.test(cleaned)) return `+254${cleaned}`;
  // Don't mangle landlines / international numbers we don't recognise.
  return raw;
}

const ADDRESS_FIELDS: (keyof FhirAddress)[] = [
  "text",
  "city",
  "district",
  "state",
  "country",
  "postalCode",
];

function upper(s: unknown): unknown {
  return typeof s === "string" ? s.toUpperCase() : s;
}

/**
 * Apply the three Patient-touch operations and return both the mutated
 * resource and whether anything actually changed. Callers can skip the
 * round-trip when `changed === false`, but the lastLabSubmission
 * extension is always re-stamped so it almost always returns true.
 */
export function applyPatientUpdates(
  patient: Record<string, unknown>,
  now: string,
): { resource: Record<string, unknown>; changed: boolean } {
  // Deep-clone so we don't mutate the caller's object.
  const next = JSON.parse(JSON.stringify(patient)) as FhirPatient;
  let changed = false;

  /* Phone normalisation */
  if (Array.isArray(next.telecom)) {
    for (const t of next.telecom) {
      const isPhone =
        t.system === "phone" || t.system === "sms" || !t.system;
      if (isPhone && typeof t.value === "string") {
        const normalised = normalizeKenyanPhone(t.value);
        if (normalised !== t.value) {
          t.value = normalised;
          changed = true;
        }
      }
    }
  }

  /* Address fields uppercased */
  if (Array.isArray(next.address)) {
    for (const a of next.address) {
      for (const f of ADDRESS_FIELDS) {
        const v = a[f];
        if (typeof v === "string") {
          const u = v.toUpperCase();
          if (u !== v) {
            (a as Record<string, unknown>)[f] = u;
            changed = true;
          }
        }
      }
      if (Array.isArray(a.line)) {
        const upperLines = a.line.map((l) => upper(l));
        if (JSON.stringify(upperLines) !== JSON.stringify(a.line)) {
          a.line = upperLines as string[];
          changed = true;
        }
      }
    }
  }

  /* last-lab-submission extension — always update so lastUpdated bumps. */
  const ext = Array.isArray(next.extension) ? next.extension : [];
  const idx = ext.findIndex((e) => e.url === LAST_LAB_EXTENSION);
  if (idx >= 0) {
    if (ext[idx].valueDateTime !== now) {
      ext[idx].valueDateTime = now;
      changed = true;
    }
  } else {
    ext.push({ url: LAST_LAB_EXTENSION, valueDateTime: now });
    changed = true;
  }
  next.extension = ext;

  return { resource: next as Record<string, unknown>, changed };
}

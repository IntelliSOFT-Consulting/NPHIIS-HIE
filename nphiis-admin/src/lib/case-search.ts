// What a user typed in the contacts board's case box: an EPID or Case ID (opened directly),
// a phone number, or a name. Pure, so the browser and the server read it the same way.

export type CaseQuery =
  | { kind: "id"; value: string }
  | { kind: "phone"; variants: string[] }
  /** Digits, but too few for a whole number (HAPI matches whole numbers only). */
  | { kind: "partial-phone" }
  | { kind: "name"; terms: string[] }
  | { kind: "empty" };

/** KEN-2026-001, KEN-NAI-KIB-2026-VHF-001: letters, a hyphen, a digit somewhere, no spaces. */
const CASE_REF = /^[A-Za-z]{2,}-[A-Za-z0-9-]*\d[A-Za-z0-9-]*$/;

/**
 * The forms a Kenyan phone number is stored in on HAPI (mobile saves 07..., some records
 * +254...). HAPI matches phone numbers exactly, so every form is searched.
 */
export function phoneVariants(text: string): string[] {
  const d = text.replace(/\D/g, "");
  const out = new Set<string>([d]);
  if (text.trim().startsWith("+")) out.add(`+${d}`);
  const local = d.startsWith("254") ? d.slice(3) : d.startsWith("0") ? d.slice(1) : d.length === 9 ? d : "";
  if (local.length === 9) {
    for (const v of [`0${local}`, `+254${local}`, `254${local}`, local]) out.add(v);
  }
  return Array.from(out).filter((v) => v.replace(/\D/g, "").length >= 7);
}

export function parseCaseQuery(text: string): CaseQuery {
  const q = text.trim();
  if (!q) return { kind: "empty" };
  if (CASE_REF.test(q)) return { kind: "id", value: q };
  if (/^[+\d\s().-]+$/.test(q) && /\d/.test(q)) {
    const d = q.replace(/\D/g, "");
    const local = d.startsWith("254") ? d.slice(3) : d.startsWith("0") ? d.slice(1) : d;
    return local.length >= 9 ? { kind: "phone", variants: phoneVariants(q) } : { kind: "partial-phone" };
  }
  const terms = q
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^A-Za-z0-9À-ɏ'-]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 4);
  return terms.length ? { kind: "name", terms } : { kind: "empty" };
}

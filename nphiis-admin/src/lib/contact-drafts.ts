// The review list of the "Add contacts" screen: rows read from a line list, contacts entered
// by hand, and edits to either, checked the same way before anything is saved. Pure, so it is
// unit-tested and runs in the browser.

import { parsePhone, personKey, type ImportedContact, type ParsedRow } from "./contact-import";

/** Row numbers of contacts entered by hand start here, clear of any sheet row. */
export const HAND_ROW_BASE = 100_000;

export interface Draft {
  rowNumber: number;
  source: "file" | "hand";
  /** A file row changed in the form. */
  edited: boolean;
  contact: ImportedContact;
  /** Problems that stop the contact from being saved. */
  errors: string[];
  warnings: string[];
  /** Label of the earlier row with the same person ("row 4", "Jane Otieno"). */
  duplicateOf?: string;
}

export const draftName = (c: Pick<ImportedContact, "givenNames" | "familyName">) =>
  (c.givenNames === c.familyName ? c.givenNames : `${c.givenNames} ${c.familyName}`).trim();

export const draftLabel = (d: Pick<Draft, "source" | "rowNumber" | "contact">) =>
  d.source === "file" ? `row ${d.rowNumber}` : draftName(d.contact) || "a contact entered by hand";

/** The checks a hand-entered or edited contact gets (a file row also has its parse warnings). */
export function checkContact(c: ImportedContact, today: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!c.givenNames.trim() && !c.familyName.trim()) errors.push("No name");
  if (c.phone && !parsePhone(c.phone)) errors.push(`"${c.phone}" is not a mobile number`);
  if (c.contactDate && c.contactDate > today) errors.push("Date of contact is in the future");
  if (c.birthDate && c.birthDate > today) errors.push("Date of birth is in the future");
  if (!c.contactDate) warnings.push("No date of contact: follow up counts from today");
  if (!c.subCountyName && !c.countyName) warnings.push("No county / sub-county of residence");
  return { errors, warnings };
}

/**
 * One list of everything to review: file rows (with any edits), then contacts entered by hand.
 * The second and later rows of the same person are marked duplicates.
 */
export function buildDrafts(
  fileRows: ParsedRow[],
  hand: ImportedContact[],
  edits: ReadonlyMap<number, ImportedContact>,
  today: string,
): Draft[] {
  const drafts: Draft[] = [
    ...fileRows.map((r): Draft => {
      const edit = edits.get(r.rowNumber);
      if (!edit) return { rowNumber: r.rowNumber, source: "file", edited: false, contact: r.contact, errors: r.errors, warnings: r.warnings };
      return { rowNumber: r.rowNumber, source: "file", edited: true, contact: edit, ...checkContact(edit, today) };
    }),
    ...hand.map((c): Draft => ({ rowNumber: c.rowNumber, source: "hand", edited: false, contact: c, ...checkContact(c, today) })),
  ];
  const seen = new Map<string, Draft>();
  for (const d of drafts) {
    if (d.errors.length) continue;
    const key = personKey(d.contact);
    const first = seen.get(key);
    if (first) d.duplicateOf = draftLabel(first);
    else seen.set(key, d);
  }
  return drafts;
}

/** Can be saved: no errors and not a repeat of an earlier row. */
export const savable = (d: Draft) => d.errors.length === 0 && !d.duplicateOf;

/** Identity of a contact's content, so a server check is redone only when it changes. */
export const draftKey = (c: ImportedContact) => JSON.stringify(c);

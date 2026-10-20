// Reads a VHF contact line list (the MoH "contacts of a confirmed case" sheet, or any sheet
// laid out like it) into normalised contact rows. Pure, so it runs in the browser on the
// parsed sheet and is unit-tested. Column names and value rules follow the mobile importer
// (android-fhir bulk/BulkContactImport.kt) so a sheet imports the same either way.

import type { ContactInput, Relationship } from "./vhf-contacts";

export const FOLLOW_UP_WINDOW_DAYS = 21;

export type TargetField =
  | "fullName"
  | "givenNames"
  | "familyName"
  | "sex"
  | "age"
  | "birthDate"
  | "phone"
  | "idNumber"
  | "contactDate"
  | "relationship"
  | "flightSeat"
  | "county"
  | "subCounty"
  | "village"
  | "day"
  | "comment"
  | "note"
  | "ignore";

export const FIELD_LABELS: Record<TargetField, string> = {
  fullName: "Full name",
  givenNames: "Given names",
  familyName: "Surname",
  sex: "Sex",
  age: "Age (years)",
  birthDate: "Date of birth",
  phone: "Phone number",
  idNumber: "ID number",
  contactDate: "Date of contact (exposure)",
  relationship: "Relationship to the case",
  flightSeat: "Flight seat",
  county: "County of residence",
  subCounty: "Sub-county of residence",
  village: "Town / village / address",
  day: "Follow-up day",
  comment: "Comment",
  note: "Keep as a note",
  ignore: "Ignore",
};

export interface ColumnMapping {
  index: number;
  header: string;
  field: TargetField;
  /** Follow-up day (1-21) of a day column. */
  day?: number;
}

/** A contact row as read from the sheet; county and sub-county are names until the server resolves them. */
export type ImportedContact = Omit<ContactInput, "county" | "subCounty"> & {
  countyName?: string;
  subCountyName?: string;
};

export interface ParsedRow {
  rowNumber: number;
  contact: ImportedContact;
  /** Problems that stop the row from being imported. */
  errors: string[];
  /** Values that could not be used (the rest of the row is imported). */
  warnings: string[];
  /** Set when the same person is on an earlier row. */
  duplicateOfRow?: number;
}

export interface ParsedSheet {
  /** 0-based index of the header row in the table. */
  headerRow: number;
  headers: string[];
  columns: ColumnMapping[];
  rows: ParsedRow[];
}

/** Letters and digits only, lower case, single spaces: "Date of Exposure\n(dd.mm.yyyy)" → "date of exposure dd mm yyyy". */
export function normalize(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Column names (matched by their first words), most specific first. */
const ALIASES: Array<[string, TargetField]> = [
  ["full name", "fullName"],
  ["names", "fullName"],
  ["name", "fullName"],
  ["given names", "givenNames"],
  ["first name", "givenNames"],
  ["surname", "familyName"],
  ["last name", "familyName"],
  ["family name", "familyName"],
  ["sex", "sex"],
  ["gender", "sex"],
  ["age", "age"],
  ["date of birth", "birthDate"],
  ["dob", "birthDate"],
  ["mobile phone number", "phone"],
  ["mobile", "phone"],
  ["phone", "phone"],
  ["telephone", "phone"],
  ["id number", "idNumber"],
  ["national id", "idNumber"],
  ["date of last exposure", "contactDate"],
  ["date of exposure", "contactDate"],
  ["date of contact", "contactDate"],
  ["relation to confirmed case", "relationship"],
  ["relation to case", "relationship"],
  ["relationship", "relationship"],
  ["flight seat", "flightSeat"],
  ["seat", "flightSeat"],
  ["sub county of residence", "subCounty"],
  ["sub county", "subCounty"],
  ["subcounty", "subCounty"],
  ["county of residence", "county"],
  ["county", "county"],
  ["address", "village"],
  ["residence", "village"],
  ["village", "village"],
  ["comments", "comment"],
  ["comment", "comment"],
  // Recalculated from the date of contact, never imported.
  ["days post exposure", "ignore"],
  ["days in quarantine", "ignore"],
  ["no", "ignore"],
  ["s no", "ignore"],
  ["serial", "ignore"],
];

const startsWithWords = (key: string, name: string) => key === name || key.startsWith(`${name} `);

/** Columns whose header starts the follow-up day block ("On each day of follow-up indicate ..."). */
function isDayBlockHeader(key: string): boolean {
  return key.startsWith("on each day") || key.startsWith("daily follow up") || key === "follow up";
}

/** Maps each header to a field: day columns, known names, and anything else kept as a note. */
export function autoMapColumns(headers: string[], subHeaders: unknown[] = []): ColumnMapping[] {
  const used = new Set<TargetField>();
  let dayBlock = 0;
  return headers.map((raw, index): ColumnMapping => {
    const header = String(raw ?? "").replace(/\s+/g, " ").trim();
    const key = normalize(raw);
    const day = key.match(/^(?:day|d)\s*(\d{1,2})$/)?.[1] ?? normalize(subHeaders[index]).match(/^(?:day\s*)?(\d{1,2})$/)?.[1];
    if (isDayBlockHeader(key)) {
      dayBlock = 1;
      return { index, header, field: "day", day: day ? Number(day) : dayBlock };
    }
    if (day && (dayBlock > 0 || /^(day|d)\s*\d/.test(key))) {
      dayBlock = Number(day) + 1;
      return { index, header, field: "day", day: Number(day) };
    }
    if (!key) {
      // A blank header inside the day block: the next day.
      if (dayBlock > 0 && dayBlock < FOLLOW_UP_WINDOW_DAYS) {
        dayBlock++;
        return { index, header, field: "day", day: dayBlock };
      }
      return { index, header, field: "ignore" };
    }
    dayBlock = 0;
    const match = ALIASES.find(([name, field]) => startsWithWords(key, name) && (field === "ignore" || !used.has(field)));
    if (match) {
      if (match[1] !== "ignore") used.add(match[1]);
      return { index, header, field: match[1] };
    }
    return { index, header, field: "note" };
  });
}

const REQUIRED_FIELDS: TargetField[][] = [["fullName", "givenNames", "familyName"]];

/** The fields a mapping still lacks before rows can be imported (a name column). */
export function missingRequired(columns: ColumnMapping[]): string[] {
  return REQUIRED_FIELDS.filter((any) => !columns.some((c) => any.includes(c.field))).map(() => "a name column");
}

/** The header row: the first row (of the first 15) with at least three known column names. */
export function findHeaderRow(table: unknown[][]): number {
  for (let r = 0; r < Math.min(table.length, 15); r++) {
    const known = (table[r] ?? []).filter((cell) => {
      const key = normalize(cell);
      return key && ALIASES.some(([name, field]) => field !== "ignore" && startsWithWords(key, name));
    }).length;
    if (known >= 3) return r;
  }
  return 0;
}

/* ── Values ─────────────────────────────────────────────────────────────── */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** A date as yyyy-MM-dd: day first (Kenya), ISO, "3 Oct 2026", or an Excel serial number. */
export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    // Excel counts days from 30 Dec 1899.
    if (serial >= 20000 && serial <= 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
    return null;
  }
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) return isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s,-]+(\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month ? isoDate(+m[3], month, +m[1]) : null;
  }
  return null;
}

/**
 * A Kenyan mobile number as the form wants it (07xxxxxxxx / 01xxxxxxxx): restores the 0 Excel
 * drops, turns +254 / 254 into 0, and takes the first of two numbers. Null when it is not one.
 */
export function parsePhone(value: unknown): string | null {
  const first = String(value ?? "").split(/[/,;&]/)[0];
  const digits = first.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("254")) return `0${digits.slice(3)}`;
  if (digits.length === 9 && /^[71]/.test(digits)) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  return null;
}

export function parseSex(value: unknown): "male" | "female" | null {
  const key = normalize(value);
  if (["m", "male", "man", "boy"].includes(key)) return "male";
  if (["f", "female", "woman", "girl"].includes(key)) return "female";
  return null;
}

const FAMILY_WORDS = [
  "relative", "family", "spouse", "wife", "husband", "child", "son", "daughter",
  "mother", "father", "brother", "sister", "parent", "cousin", "uncle", "aunt",
];
const HEALTH_WORKER_WORDS = [
  "hcw", "health care worker", "healthcare worker", "nurse", "doctor", "clinician",
  "clinical officer", "lab", "laboratory", "sonographer", "radiographer",
  "patient attendant", "pharmacist", "student nurse", "port health",
];

/** Free-text relation to the case → the form's relationship option. */
export function parseRelationship(value: unknown): Relationship {
  const key = normalize(value);
  if (FAMILY_WORDS.some((w) => key.includes(w))) return "family";
  if (HEALTH_WORKER_WORDS.some((w) => key === w || key.includes(w))) return "hcw";
  if (key.includes("friend")) return "friend";
  if (key.includes("workmate") || key.includes("colleague")) return "workmate";
  return "other";
}

/** Name → given names and surname: the last word is the surname (as mobile does). */
export function splitName(full: string): { givenNames: string; familyName: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { givenNames: words[0] ?? "", familyName: words[0] ?? "" };
  return { givenNames: words.slice(0, -1).join(" "), familyName: words[words.length - 1] };
}

const NONE = new Set(["", "n a", "na", "none", "nil", "no", "0"]);

/** Digits of a Kenyan phone number, last 9 (0712…, +254712…, 712… are the same number). */
export function phoneKey(phone: string | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-9);
}

/** Who a contact is, for duplicate checks: the ID number, else name and phone. */
export function personKey(c: Pick<ContactInput, "givenNames" | "familyName" | "phone" | "idNumber">): string {
  if (c.idNumber?.trim()) return `id:${c.idNumber.trim().toLowerCase()}`;
  const name = `${c.givenNames} ${c.familyName}`.trim().toLowerCase().replace(/\s+/g, " ");
  return `${name}|${phoneKey(c.phone)}`;
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

export function parseRow(cells: unknown[], columns: ColumnMapping[], rowNumber: number): ParsedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const c: ImportedContact = { rowNumber, givenNames: "", familyName: "", followUps: [] };
  const label = (col: ColumnMapping) => col.header || FIELD_LABELS[col.field];

  for (const col of columns) {
    const raw = cells[col.index];
    const text = cellText(raw);
    if (!text) continue;
    switch (col.field) {
      case "fullName":
        Object.assign(c, splitName(text));
        break;
      case "givenNames":
        c.givenNames = text;
        break;
      case "familyName":
        c.familyName = text;
        break;
      case "sex": {
        const sex = parseSex(text);
        if (sex) c.sex = sex;
        else warnings.push(`${label(col)}: "${text}" not understood`);
        break;
      }
      case "age": {
        const years = Number.parseFloat(text);
        if (Number.isFinite(years) && years >= 0 && years <= 120) c.ageYears = Math.floor(years);
        else warnings.push(`${label(col)}: "${text}" not understood`);
        break;
      }
      case "birthDate": {
        const d = parseDate(raw);
        if (d) c.birthDate = d;
        else warnings.push(`${label(col)}: "${text}" not understood`);
        break;
      }
      case "phone": {
        const phone = parsePhone(text);
        if (phone) c.phone = phone;
        else warnings.push(`${label(col)}: "${text}" is not a mobile number`);
        break;
      }
      case "idNumber":
        c.idNumber = text;
        break;
      case "contactDate": {
        const d = parseDate(raw);
        if (d) c.contactDate = d;
        else warnings.push(`${label(col)}: "${text}" not understood`);
        break;
      }
      case "relationship":
        c.relationship = parseRelationship(text);
        if (c.relationship === "other") c.relationshipOther = text;
        break;
      case "flightSeat":
        if (!NONE.has(normalize(text))) {
          c.contactLocation = "travel";
          c.exposureLocation = `Flight, seat ${text}`;
        }
        break;
      case "county":
        c.countyName = text;
        break;
      case "subCounty":
        c.subCountyName = text;
        break;
      case "village":
        c.village = text;
        break;
      case "day": {
        const day = col.day ?? 0;
        const code = normalize(text);
        if (code === "1") c.followUps!.push({ day, symptomatic: false });
        else if (code === "2") c.followUps!.push({ day, symptomatic: true });
        else warnings.push(`Day ${day}: "${text}" is not 1 (no symptoms) or 2 (symptomatic)`);
        break;
      }
      case "comment":
        if (normalize(text).includes("confirmed case")) errors.push("Marked as a confirmed case, not a contact");
        notes.push(`${label(col)}: ${text}`);
        break;
      case "note":
        notes.push(`${label(col)}: ${text}`);
        break;
      case "ignore":
        break;
    }
  }

  if (!c.givenNames && !c.familyName) errors.push("No name");
  if (!c.contactDate) warnings.push("No date of contact: follow up counts from the upload date");
  if (!c.subCountyName && !c.countyName) warnings.push("No county / sub-county of residence");
  if (c.followUps!.length && !c.contactDate) warnings.push("Day columns are skipped without a date of contact");
  if (notes.length) c.notes = notes.join("; ");
  if (!c.followUps!.length) delete c.followUps;
  return { rowNumber, contact: c, errors, warnings };
}

/**
 * Reads the sheet's rows (a table of cells, e.g. SheetJS sheet_to_json with header: 1).
 * [columns]: a mapping chosen in the upload screen; by default the automatic one.
 */
export function parseLineList(table: unknown[][], columns?: ColumnMapping[]): ParsedSheet {
  const headerRow = findHeaderRow(table);
  const headers = (table[headerRow] ?? []).map((h) => String(h ?? ""));
  let first = headerRow + 1;
  // A row of day numbers (1, 2, 3 ...) or dates under a merged follow-up header.
  const next = table[first] ?? [];
  const plain = columns ?? autoMapColumns(headers);
  const nameCols = plain.filter((c) => c.field === "fullName" || c.field === "givenNames" || c.field === "familyName");
  const isSubHeader =
    next.length > 0 &&
    nameCols.every((c) => !cellText(next[c.index])) &&
    plain.some((c) => c.field === "day" && cellText(next[c.index]));
  if (isSubHeader) first++;
  const mapping = columns ?? (isSubHeader ? autoMapColumns(headers, next) : plain);

  const seen = new Map<string, number>();
  const rows: ParsedRow[] = [];
  for (let r = first; r < table.length; r++) {
    const cells = table[r] ?? [];
    // Skip blank rows and rows with nothing in the mapped columns.
    if (!mapping.some((c) => c.field !== "ignore" && cellText(cells[c.index]))) continue;
    const row = parseRow(cells, mapping, r + 1);
    if (!row.errors.length) {
      const key = personKey(row.contact);
      const earlier = seen.get(key);
      if (earlier) row.duplicateOfRow = earlier;
      else seen.set(key, row.rowNumber);
    }
    rows.push(row);
  }
  return { headerRow, headers, columns: mapping, rows };
}

/** The MoH contact line list columns: the header row of the downloadable Excel template. */
export const TEMPLATE_HEADERS: readonly string[] = [
  "No", "Full Name", "Date of Exposure (dd.mm.yyyy)", "Mobile Phone Number (+254)", "Sex (M/F)",
  "Age (Years at last Birthday)", "Comment", "Relation to confirmed case", "Flight Seat No.", "Exposure Type",
  "Quarantine Facility", "Address", "County", "Sub-county", "Date of Admission", "Comorbidities (Yes/NO)",
  "If yes, what type of comorbidity", "Accessing care for comorbidity",
  ...Array.from({ length: FOLLOW_UP_WINDOW_DAYS }, (_, i) => `Day ${i + 1}`),
];

/** The template's "Instructions" sheet: [column, how to fill it]. */
export const TEMPLATE_INSTRUCTIONS: ReadonlyArray<readonly [string, string]> = [
  ["Column", "How to fill it"],
  ["(all)", "One row per contact on the Contacts sheet. Keep the header row; extra columns are kept as notes."],
  ["Full Name", "Required. Rows without a name are not imported."],
  ["Date of Exposure", "Day first, e.g. 03.10.2026, or an Excel date. Follow up runs 21 days from it; without it, from the upload date."],
  ["Mobile Phone Number", "07XXXXXXXX or +2547XXXXXXXX."],
  ["Sex", "M or F."],
  ["Age", "Years at last birthday."],
  ["Comment", "Free text, saved in the contact's notes. A row marked as a confirmed case is not imported."],
  ["County / Sub-county", "Where the contact lives. Follow-up reminders go to that sub-county's surveillance officer."],
  ["Address", "Village or estate."],
  [`Day 1 – Day ${FOLLOW_UP_WINDOW_DAYS}`, "1 = seen, no symptoms; 2 = seen, symptomatic; blank = not seen. Needs a date of exposure."],
  ["Other columns", "Flight seat, quarantine facility, admission and comorbidity details are saved in the contact's notes."],
];

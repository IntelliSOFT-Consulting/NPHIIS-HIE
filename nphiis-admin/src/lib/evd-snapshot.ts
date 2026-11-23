// Sub-County Daily Enhanced EVD Surveillance Snapshot (Outbreak Response).
//
// Digital version of the paper tool "SUB-COUNTY DAILY ENHANCED EVD SURVEILLANCE SNAPSHOT":
// one aggregate return per sub-county per reporting date, covering the previous day
// (00:00-23:59 EAT), due by 09:00 EAT. Saved as one FHIR QuestionnaireResponse
// (see fhir-evd-snapshot.ts). Pure helpers only, so the form and the API share them.
//
// The paper form repeats the section letter "A" and number "4" and restarts numbering in the
// follow-up table; the digital form keeps the wording and order but uses stable ids, and
// numbers the questions A1-A9 and B1-B8.

export const EVD_SNAPSHOT_QUESTIONNAIRE = "http://nphiis.health.go.ke/Questionnaire/evd-daily-snapshot";
export const EVD_SNAPSHOT_TAG_COUNTY = "http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-county";
export const EVD_SNAPSHOT_TAG_SUBCOUNTY = "http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-subcounty";
export const EVD_SNAPSHOT_TAG_DATE = "http://nphiis.health.go.ke/fhir/CodeSystem/evd-snapshot-date";
export const EVD_SNAPSHOT_MANAGING_LOCATION =
  "http://nphiis.health.go.ke/fhir/StructureDefinition/evd-snapshot-managingLocation";

/** Kenya time is UTC+3 all year. */
export const EAT_OFFSET_MS = 3 * 3_600_000;
/** Snapshots are due by this hour (EAT) on the reporting date. */
export const DEADLINE_HOUR_EAT = 9;

export interface CountField {
  /** QuestionnaireResponse linkId. */
  id: string;
  /** "A1", "B3" ... */
  number: string;
  label: string;
}

export interface CountSection {
  id: "detection" | "followup";
  letter: "A" | "B";
  title: string;
  subtitle: string;
  fields: CountField[];
}

export const COUNT_SECTIONS: CountSection[] = [
  {
    id: "detection",
    letter: "A",
    title: "Detection and verification",
    subtitle: "What came in last 24 hours?",
    fields: [
      { id: "a-alerts-received", number: "A1", label: "New EVD alerts received (hotline, facility, community, PoE, other)" },
      { id: "a-suspected-cases", number: "A2", label: "New suspected cases meeting the national case definition" },
      { id: "a-alerts-verified", number: "A3", label: "Alerts verified / risk-assessed" },
      { id: "a-cases-investigated", number: "A4", label: "Suspected cases investigated (case investigation form completed)" },
      { id: "a-cases-isolated", number: "A5", label: "Suspected cases isolated or referred to treatment/isolation facility" },
      { id: "a-specimens-shipped", number: "A6", label: "Specimens collected and shipped" },
      { id: "a-lab-positive", number: "A7", label: "Lab results received — positive" },
      { id: "a-lab-negative", number: "A8", label: "Lab results received — negative" },
      { id: "a-lab-pending", number: "A9", label: "Lab results still pending" },
    ],
  },
  {
    id: "followup",
    letter: "B",
    title: "Follow-up",
    subtitle: "What is being tracked in the last 24 hours?",
    fields: [
      { id: "b-new-contacts", number: "B1", label: "New contacts listed" },
      { id: "b-contacts-due", number: "B2", label: "Contacts due for follow-up today" },
      { id: "b-contacts-followed-up", number: "B3", label: "Contacts successfully followed up today" },
      { id: "b-contacts-lost", number: "B4", label: "Contacts not reached / lost to follow-up today" },
      { id: "b-contacts-symptomatic", number: "B5", label: "Contacts who developed symptoms today" },
      { id: "b-contacts-completed-21d", number: "B6", label: "Contacts who completed 21-day follow-up today" },
      { id: "b-travellers-screened", number: "B7", label: "Travellers screened at designated points of entry" },
      { id: "b-travellers-referred", number: "B8", label: "Travellers referred for EVD assessment" },
    ],
  },
];

export const COUNT_FIELDS: CountField[] = COUNT_SECTIONS.flatMap((s) => s.fields);

export const FIELD = {
  county: "county",
  subCounty: "sub-county",
  reportingDate: "reporting-date",
  focalPerson: "focal-person",
  phone: "phone",
  email: "email",
  challenges: "challenges",
  certification: "certification",
} as const;

export const CERTIFICATION_TEXT =
  "I confirm this snapshot covers the stated 24-hour period and has been verified against available sub-county reports.";

export const MAX_COUNT = 100_000;
export const MAX_CHALLENGES_LENGTH = 4000;

export interface LocationRef {
  id: string;
  name: string;
}

/** What the form sends and the API stores. Counts are kept as typed text until validated. */
export interface SnapshotInput {
  county?: LocationRef;
  subCounty?: LocationRef;
  /** yyyy-mm-dd */
  reportingDate: string;
  focalPerson: string;
  phone: string;
  email: string;
  counts: Record<string, string>;
  challenges: string;
  certified: boolean;
}

export interface SnapshotSummary {
  id: string;
  county: string;
  countyId?: string;
  subCounty: string;
  subCountyId?: string;
  reportingDate: string;
  focalPerson: string;
  phone: string;
  email: string;
  counts: Record<string, number>;
  challenges: string;
  certified: boolean;
  /** ISO timestamp the snapshot was last saved. */
  submittedAt?: string;
  submittedBy?: string;
  /** Saved by 09:00 EAT on the reporting date. */
  onTime: boolean;
}

export function emptyInput(): SnapshotInput {
  return {
    reportingDate: todayInKenya(),
    focalPerson: "",
    phone: "",
    email: "",
    counts: {},
    challenges: "",
    certified: false,
  };
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

/** Today's date in Kenya, yyyy-mm-dd. */
export function todayInKenya(now: Date = new Date()): string {
  return new Date(now.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** The day a snapshot covers: the day before its reporting date. */
export function periodCovered(reportingDate: string): string {
  if (!isIsoDate(reportingDate)) return "";
  return new Date(Date.parse(`${reportingDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** 09:00 EAT on the reporting date, as an instant. */
export function deadlineFor(reportingDate: string): number {
  return Date.parse(`${reportingDate}T${String(DEADLINE_HOUR_EAT).padStart(2, "0")}:00:00+03:00`);
}

/** True when the snapshot was saved by 09:00 EAT on its reporting date. */
export function isOnTime(reportingDate: string, submittedAt: string | undefined): boolean {
  if (!submittedAt || !isIsoDate(reportingDate)) return false;
  const at = Date.parse(submittedAt);
  return !Number.isNaN(at) && at <= deadlineFor(reportingDate);
}

/* ── Validation ─────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Kenyan numbers: 07xx / 01xx, +2547xx / +2541xx, 2547xx; spaces and dashes allowed.
const PHONE_RE = /^(?:\+?254|0)[17]\d{8}$/;

export type FieldErrors = Record<string, string>;

export function normalisePhone(v: string): string {
  return v.replace(/[\s-]/g, "");
}

/** Errors stop a save; warnings are shown but do not. */
export function validateSnapshot(
  input: SnapshotInput,
  now: Date = new Date(),
): { errors: FieldErrors; warnings: string[] } {
  const errors: FieldErrors = {};
  const warnings: string[] = [];

  if (!input.county?.id) errors[FIELD.county] = "Select the county";
  if (!input.subCounty?.id) errors[FIELD.subCounty] = "Select the sub-county";

  if (!isIsoDate(input.reportingDate ?? "")) {
    errors[FIELD.reportingDate] = "Enter the reporting date";
  } else if (input.reportingDate > todayInKenya(now)) {
    errors[FIELD.reportingDate] = "The reporting date cannot be in the future";
  }

  if (!input.focalPerson?.trim()) errors[FIELD.focalPerson] = "Enter the focal person's name";
  const phone = normalisePhone(input.phone ?? "");
  if (!phone) errors[FIELD.phone] = "Enter a phone number";
  else if (!PHONE_RE.test(phone)) errors[FIELD.phone] = "Enter a Kenyan number, e.g. 0712345678";
  const email = (input.email ?? "").trim();
  if (!email) errors[FIELD.email] = "Enter an email address";
  else if (!EMAIL_RE.test(email)) errors[FIELD.email] = "Enter a valid email address";

  for (const f of COUNT_FIELDS) {
    const raw = (input.counts?.[f.id] ?? "").trim();
    if (raw === "") errors[f.id] = "Enter a number (0 if none)";
    else if (!/^\d+$/.test(raw)) errors[f.id] = "Whole numbers only";
    else if (Number(raw) > MAX_COUNT) errors[f.id] = `Must be ${MAX_COUNT.toLocaleString()} or less`;
  }

  if ((input.challenges ?? "").length > MAX_CHALLENGES_LENGTH) {
    errors[FIELD.challenges] = `Keep this under ${MAX_CHALLENGES_LENGTH} characters`;
  }
  if (!input.certified) errors[FIELD.certification] = "Tick the certification to submit";

  const n = (id: string) => (/^\d+$/.test((input.counts?.[id] ?? "").trim()) ? Number(input.counts[id]) : null);
  const due = n("b-contacts-due");
  const done = n("b-contacts-followed-up");
  const lost = n("b-contacts-lost");
  if (due !== null && done !== null && lost !== null && done + lost > due) {
    warnings.push(
      `B3 followed up (${done}) plus B4 not reached (${lost}) is more than B2 due for follow-up (${due}). Check these before submitting.`,
    );
  }
  const screened = n("b-travellers-screened");
  const referred = n("b-travellers-referred");
  if (screened !== null && referred !== null && referred > screened) {
    warnings.push(`B8 referred (${referred}) is more than B7 screened (${screened}).`);
  }
  return { errors, warnings };
}

/* ── QuestionnaireResponse ──────────────────────────────────────────────── */

type Resource = Record<string, any>;

/** FHIR ids allow letters, digits, "-" and "."; at most 64 characters. */
function idPart(v: string): string {
  return v.replace(/[^A-Za-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * One snapshot per sub-county per reporting date: the id is derived from both, so saving
 * again for the same day updates the same record instead of adding a second one.
 */
export function snapshotId(subCountyId: string, reportingDate: string): string {
  return `evd-snapshot-${idPart(subCountyId)}-${reportingDate.replace(/-/g, "")}`.slice(0, 64);
}

export interface BuildContext {
  now?: Date;
  /** `authored` of the snapshot being replaced: the first submission time is kept, so editing
   *  a snapshot never turns an on-time return into a late one (or the reverse). */
  firstAuthored?: string;
  practitionerId?: string;
  /** Display name of the person saving it. */
  submittedBy?: string;
}

/** The FHIR QuestionnaireResponse for a validated snapshot. */
export function buildQuestionnaireResponse(input: SnapshotInput, ctx: BuildContext = {}): Resource {
  const county = input.county!;
  const subCounty = input.subCounty!;
  const now = ctx.now ?? new Date();
  const locRef = (l: LocationRef) => ({ valueReference: { reference: `Location/${l.id}`, display: l.name } });
  const str = (linkId: string, text: string, v: string) => ({ linkId, text, answer: [{ valueString: v }] });

  const author = ctx.practitionerId
    ? { reference: `Practitioner/${ctx.practitionerId}`, ...(ctx.submittedBy ? { display: ctx.submittedBy } : {}) }
    : ctx.submittedBy
      ? { display: ctx.submittedBy }
      : undefined;

  return {
    resourceType: "QuestionnaireResponse",
    id: snapshotId(subCounty.id, input.reportingDate),
    meta: {
      tag: [
        { system: EVD_SNAPSHOT_TAG_COUNTY, code: county.id, display: county.name },
        { system: EVD_SNAPSHOT_TAG_SUBCOUNTY, code: subCounty.id, display: subCounty.name },
        { system: EVD_SNAPSHOT_TAG_DATE, code: input.reportingDate },
        { system: EVD_SNAPSHOT_MANAGING_LOCATION, code: `Location/${subCounty.id}`, display: subCounty.name },
      ],
    },
    questionnaire: EVD_SNAPSHOT_QUESTIONNAIRE,
    status: "completed",
    authored: ctx.firstAuthored ?? now.toISOString(),
    ...(author ? { author } : {}),
    item: [
      {
        linkId: "identity",
        text: "Reporting identity",
        item: [
          { linkId: FIELD.county, text: "County", answer: [locRef(county)] },
          { linkId: FIELD.subCounty, text: "Sub-county", answer: [locRef(subCounty)] },
          { linkId: FIELD.reportingDate, text: "Reporting date", answer: [{ valueDate: input.reportingDate }] },
          str(FIELD.focalPerson, "Sub-county surveillance focal person", input.focalPerson.trim()),
          str(FIELD.phone, "Phone", normalisePhone(input.phone)),
          str(FIELD.email, "Email", input.email.trim()),
        ],
      },
      ...COUNT_SECTIONS.map((s) => ({
        linkId: s.id,
        text: `${s.letter}. ${s.title}`,
        item: s.fields.map((f) => ({
          linkId: f.id,
          text: f.label,
          answer: [{ valueInteger: Number.parseInt(input.counts[f.id].trim(), 10) }],
        })),
      })),
      {
        linkId: "challenges-section",
        text: "C. Challenges",
        item: input.challenges.trim() ? [str(FIELD.challenges, "Challenges", input.challenges.trim())] : [],
      },
      {
        linkId: "certification-section",
        text: "D. Certification",
        item: [{ linkId: FIELD.certification, text: CERTIFICATION_TEXT, answer: [{ valueBoolean: true }] }],
      },
    ].filter((i) => i.item.length > 0),
  };
}

/** The saved snapshot as the list and the edit form see it. */
export function summaryFromResponse(r: Resource): SnapshotSummary {
  const answers = new Map<string, Resource>();
  const walk = (items: Resource[] = []) => {
    for (const it of items) {
      if (it.answer?.[0]) answers.set(it.linkId, it.answer[0]);
      walk(it.item);
    }
  };
  walk(r.item);

  const text = (id: string) => String(answers.get(id)?.valueString ?? "");
  const ref = (id: string) => answers.get(id)?.valueReference as Resource | undefined;
  const refId = (x?: Resource) => String(x?.reference ?? "").replace(/^Location\//, "") || undefined;
  const tag = (system: string) => (r.meta?.tag as Resource[] | undefined)?.find((t) => t.system === system);

  const counts: Record<string, number> = {};
  for (const f of COUNT_FIELDS) {
    const v = answers.get(f.id)?.valueInteger;
    counts[f.id] = typeof v === "number" ? v : Number(v ?? 0) || 0;
  }
  const reportingDate = String(answers.get(FIELD.reportingDate)?.valueDate ?? "");
  const submittedAt: string | undefined = r.meta?.lastUpdated ?? r.authored;
  const countyRef = ref(FIELD.county);
  const subRef = ref(FIELD.subCounty);
  return {
    id: String(r.id ?? ""),
    county: countyRef?.display ?? tag(EVD_SNAPSHOT_TAG_COUNTY)?.display ?? "",
    countyId: refId(countyRef) ?? tag(EVD_SNAPSHOT_TAG_COUNTY)?.code,
    subCounty: subRef?.display ?? tag(EVD_SNAPSHOT_TAG_SUBCOUNTY)?.display ?? "",
    subCountyId: refId(subRef) ?? tag(EVD_SNAPSHOT_TAG_SUBCOUNTY)?.code,
    reportingDate,
    focalPerson: text(FIELD.focalPerson),
    phone: text(FIELD.phone),
    email: text(FIELD.email),
    counts,
    challenges: text(FIELD.challenges),
    certified: answers.get(FIELD.certification)?.valueBoolean === true,
    submittedAt,
    submittedBy: r.author?.display,
    // `authored` is the first submission; `submittedAt` (lastUpdated) moves with every edit.
    onTime: isOnTime(reportingDate, r.authored ?? submittedAt),
  };
}

/** The form's input from a saved snapshot, for editing it. */
export function inputFromSummary(s: SnapshotSummary): SnapshotInput {
  return {
    county: s.countyId ? { id: s.countyId, name: s.county } : undefined,
    subCounty: s.subCountyId ? { id: s.subCountyId, name: s.subCounty } : undefined,
    reportingDate: s.reportingDate,
    focalPerson: s.focalPerson,
    phone: s.phone,
    email: s.email,
    counts: Object.fromEntries(Object.entries(s.counts).map(([k, v]) => [k, String(v)])),
    challenges: s.challenges,
    certified: false, // certified again on every save
  };
}

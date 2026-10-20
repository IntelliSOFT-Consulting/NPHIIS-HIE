// FHIR resources for VHF contact tracing, in the shape the mobile app writes them
// (android-fhir AddClientViewModel.persistPatientData, VhfContactTracker), so a contact
// registered or followed up here reads the same on mobile:
//   - Patient: names, sex, date of birth, phone, residence address; identifiers
//     system-creation and vhf-case-information = the case Encounter id. No Patient.link:
//     the case's contact List (hie-auth) is the link between a contact and its case.
//   - Encounter "VHF Case Information" + QuestionnaireResponse (nested like the form) +
//     one Observation per answer (code = linkId, valueString = the answer as shown).
//   - Daily follow up: child Encounter "VHF Contact Follow Up" (partOf the case Encounter).
// Resource ids are derived from the case and the person (uuidv5), so the same row
// uploaded twice maps to the same records and is skipped.

import { createHash } from "crypto";
import vhfCaseForm from "@/questionnaires/vhf-case.json";
import vhfFollowUpForm from "@/questionnaires/vhf-contact-follow-up.json";
import { personKey } from "./contact-import";

export const VHF_CASE_REASON = "VHF Case Information";
export const VHF_FOLLOW_UP_REASON = "VHF Contact Follow Up";
export const VHF_CASE_SLUG = "vhf-case-information";
export const FOLLOW_UP_WINDOW_DAYS = 21;

/** linkIds of the mobile VHF forms (pinned in forms/vhf/platform). */
export const L = {
  caseType: "vhf-case-type",
  sourceCaseEpid: "vhf-source-case-epid",
  disease: "vhf-disease",
  investigationDate: "vhf-investigation-date",
  investigationLocation: "vhf-investigation-location",
  userRole: "user_role",
  userFacility: "user_facility",
  userWard: "user_ward",
  userSubCounty: "user_sub_county",
  userCounty: "user_county",
  givenNames: "873240407472",
  familyName: "486402457213",
  sex: "929966324957",
  birthDateKnown: "442636360588",
  birthDate: "257830485990",
  ageYears: "492731638700",
  idType: "vhf-id-type",
  idNumber: "vhf-national-id",
  phone: "vhf-phone",
  county: "a4-county",
  subCounty: "a3-sub-county",
  village: "vhf-village",
  exposureType: "vhf-exposure-type",
  contactDate: "vhf-contact-date",
  relationship: "vhf-relationship",
  relationshipOther: "vhf-relationship-other",
  contactLocation: "vhf-contact-location",
  exposureLocation: "vhf-exposure-location",
  importNotes: "contact_import_notes",
  followUpDay: "vhf-follow-up-day",
  followUpDate: "vhf-follow-up-date",
  followUpSymptomatic: "vhf-follow-up-symptomatic",
  followUpSymptoms: "vhf-follow-up-symptoms",
  followUpTemperatureAm: "vhf-follow-up-temperature-am",
  followUpTemperaturePm: "vhf-follow-up-temperature-pm",
  followUpTracer: "vhf-follow-up-tracer-email",
  followUpApproach: "vhf-follow-up-approach",
  followUpChallenges: "vhf-follow-up-challenges",
} as const;

/** Reporting-site questions exist once per user level (android-fhir FormFields.ReportingSite.variants). */
const REPORTING = {
  county: "294367770999",
  subCounty: "819946803642",
  ward: "819943434",
  facility: "819946803677",
  facilityType: "438862163919",
};

/** The reporting-site group the form shows for each role (its enableWhen on user_role). */
const LEVEL_SUFFIX: Record<string, string> = {
  VACCINATOR: "",
  SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER: "_sub_county",
  COUNTY_DISEASE_SURVEILLANCE_OFFICER: "_county",
  ADMINISTRATOR: "_national",
};
export const REPORTING_ROLES = Object.keys(LEVEL_SUFFIX);

export const FACILITY_TYPES = ["Public", "Private", "Faith Based"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

/** Where a record was reported from: the logged-in user's role and location. */
export interface ReportingSite {
  role?: string;
  county?: Facility;
  subCounty?: Facility;
  ward?: Facility;
  facility?: Facility;
  facilityType?: FacilityType;
}

/* ── Questionnaire walking ─────────────────────────────────────────────── */

interface QItem {
  linkId: string;
  text?: string;
  type: string;
  repeats?: boolean;
  answerOption?: Array<{ valueCoding?: { system?: string; code?: string; display?: string }; valueString?: string }>;
  item?: QItem[];
}
interface Questionnaire {
  url?: string;
  item?: QItem[];
}

export const CASE_FORM = vhfCaseForm as unknown as Questionnaire;
export const FOLLOW_UP_FORM = vhfFollowUpForm as unknown as Questionnaire;

function indexForm(form: Questionnaire): Map<string, QItem> {
  const out = new Map<string, QItem>();
  const walk = (items?: QItem[]) => {
    for (const i of items ?? []) {
      out.set(i.linkId, i);
      walk(i.item);
    }
  };
  walk(form.item);
  return out;
}
const CASE_ITEMS = indexForm(CASE_FORM);
const FOLLOW_UP_ITEMS = indexForm(FOLLOW_UP_FORM);

/** A choice's display in the form ("female" → "Female"); undefined when the form has no such option. */
export function optionDisplay(linkId: string, code: string, form: "case" | "follow-up" = "case"): string | undefined {
  const item = (form === "case" ? CASE_ITEMS : FOLLOW_UP_ITEMS).get(linkId);
  return item?.answerOption?.find((o) => o.valueCoding?.code === code)?.valueCoding?.display;
}

/** An answer: text, number, a choice code, or a Location. */
export type AnswerValue = string | number | { code: string } | { reference: string; display: string };
export type Answers = Record<string, AnswerValue[]>;

type FhirAnswer = Record<string, unknown>;

function toFhirAnswer(item: QItem | undefined, value: AnswerValue): { fhir: FhirAnswer; shown: string } {
  if (typeof value === "object" && "reference" in value) {
    return { fhir: { valueReference: value }, shown: value.display };
  }
  if (typeof value === "object" && "code" in value) {
    const option = item?.answerOption?.find((o) => o.valueCoding?.code === value.code)?.valueCoding;
    const coding = option ? { ...option } : { code: value.code, display: value.code };
    return { fhir: { valueCoding: coding }, shown: coding.display ?? value.code };
  }
  switch (item?.type) {
    case "integer":
      return { fhir: { valueInteger: Number(value) }, shown: String(value) };
    case "decimal":
      return { fhir: { valueDecimal: Number(value) }, shown: String(value) };
    case "date":
      return { fhir: { valueDate: String(value) }, shown: String(value) };
    default:
      return { fhir: { valueString: String(value) }, shown: String(value) };
  }
}

interface QrItem {
  linkId: string;
  text?: string;
  answer?: Array<FhirAnswer & { item?: QrItem[] }>;
  item?: QrItem[];
}

/** The response items for [answers], in the form's order and nesting (as mobile's buildResponse). */
export function responseItems(form: Questionnaire, answers: Answers): QrItem[] {
  const build = (items?: QItem[]): QrItem[] =>
    (items ?? []).flatMap((item): QrItem[] => {
      const children = build(item.item);
      const own = answers[item.linkId] ?? [];
      if (item.type === "group") return children.length ? [{ linkId: item.linkId, text: item.text, item: children }] : [];
      if (!own.length) return children;
      const answer = own.map((v) => toFhirAnswer(item, v).fhir) as QrItem["answer"] & object;
      // Questions nested under a question go under its (first) answer.
      if (children.length) answer[0] = { ...answer[0], item: children };
      return [{ linkId: item.linkId, ...(item.text ? { text: item.text } : {}), answer }];
    });
  return build(form.item);
}

/* ── Ids, tags, stamps ─────────────────────────────────────────────────── */

const NAMESPACE = "6f1d3c2a-8b0e-4c4b-9a43-2d5c7f0e9b11";

/** RFC 4122 v5 UUID of [name] in the contact-tracing namespace. */
export function uuidv5(name: string, namespace = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** "yyyy-MM-dd HH:mm:ss" in Kenya time, the mobile system-creation stamp. */
export function creationStamp(now: Date): string {
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
}

function systemCreation(stamp: string) {
  return {
    system: "system-creation",
    value: stamp,
    type: { coding: [{ system: "system-creation", code: "system_creation", display: "System Creation" }], text: stamp },
  };
}

export interface Facility {
  id: string;
  name: string;
}

function managingLocation(resource: string, facility?: Facility) {
  if (!facility) return {};
  const url = `http://example.org/fhir/StructureDefinition/${resource}-managingLocation`;
  return {
    meta: { tag: [{ system: url, code: `Location/${facility.id}`, display: facility.name }] },
    extension: [{ url, valueReference: { reference: `Location/${facility.id}`, display: facility.name } }],
  };
}

export interface BundleEntry {
  fullUrl: string;
  resource: Record<string, unknown>;
  request: { method: "PUT" | "POST"; url: string };
}
export interface TransactionBundle {
  resourceType: "Bundle";
  type: "transaction";
  entry: BundleEntry[];
}

const put = (resource: Record<string, unknown> & { resourceType: string; id: string }): BundleEntry => ({
  fullUrl: `urn:uuid:${resource.id}`,
  resource,
  request: { method: "PUT", url: `${resource.resourceType}/${resource.id}` },
});

interface Ctx {
  patientId: string;
  encounterId: string;
  practitionerId?: string;
  facility?: Facility;
  now: Date;
}

/** One Observation per answer, valueString = the answer as shown (mobile codingQuestionnaire). */
function observations(form: Questionnaire, answers: Answers, ctx: Ctx, idSeed: string, focus?: string): BundleEntry[] {
  const items = form === CASE_FORM ? CASE_ITEMS : FOLLOW_UP_ITEMS;
  return Object.entries(answers)
    .filter(([, values]) => values.length)
    .map(([linkId, values]) => {
      const item = items.get(linkId);
      const shown = values.map((v) => toFhirAnswer(item, v).shown).join(", ");
      const text = item?.text ?? (linkId === L.importNotes ? "Line-list notes" : linkId);
      return put({
        resourceType: "Observation",
        id: uuidv5(`${idSeed}|obs|${linkId}`),
        status: "final",
        code: { coding: [{ system: "http://snomed.info/sct", code: linkId, display: text }], text: shown },
        subject: { reference: `Patient/${ctx.patientId}` },
        encounter: { reference: `Encounter/${ctx.encounterId}` },
        ...(linkId === L.sourceCaseEpid && focus ? { focus: [{ reference: focus }] } : {}),
        ...(ctx.practitionerId ? { performer: [{ reference: `Practitioner/${ctx.practitionerId}` }] } : {}),
        issued: ctx.now.toISOString(),
        valueString: shown,
        ...managingLocation("observation", ctx.facility),
      });
    });
}

function questionnaireResponse(form: Questionnaire, answers: Answers, ctx: Ctx, id: string, status: string) {
  return put({
    resourceType: "QuestionnaireResponse",
    id,
    ...(form.url ? { questionnaire: form.url } : {}),
    status,
    authored: ctx.now.toISOString(),
    subject: { reference: `Patient/${ctx.patientId}` },
    encounter: { reference: `Encounter/${ctx.encounterId}` },
    ...(ctx.practitionerId ? { author: { reference: `Practitioner/${ctx.practitionerId}` } } : {}),
    item: responseItems(form, answers),
    ...managingLocation("questionnaire", ctx.facility),
  });
}

/* ── Contacts ──────────────────────────────────────────────────────────── */

export type Relationship = "family" | "hcw" | "friend" | "workmate" | "other";

/** A line-list row, normalised (see contact-import.ts), plus the places resolved by the server. */
export interface ContactInput {
  rowNumber: number;
  givenNames: string;
  familyName: string;
  sex?: "male" | "female";
  ageYears?: number;
  birthDate?: string;
  phone?: string;
  idNumber?: string;
  contactDate?: string;
  relationship?: Relationship;
  relationshipOther?: string;
  contactLocation?: string;
  exposureLocation?: string;
  village?: string;
  county?: Facility;
  subCounty?: Facility;
  /** Line-list columns with no form question ("Flight seat: 12C; Quarantine facility: KNH"). */
  notes?: string;
  /** Day columns of the sheet: 1 = no symptoms, 2 = symptomatic. */
  followUps?: Array<{ day: number; symptomatic: boolean }>;
}

export interface IndexCase {
  encounterId: string;
  patientId: string;
  /** The EPID (or Case ID) the contact is linked by. */
  epid: string;
  /** Disease answer of the case, as a code of vhf-disease (ebola / marburg / other). */
  disease?: string;
}

/** Ids of the records a contact row maps to, derived from the case and the person. */
export function contactIds(index: Pick<IndexCase, "encounterId">, c: ContactInput) {
  const seed = `${index.encounterId}|${personKey(c)}`;
  return {
    seed,
    patientId: uuidv5(`${seed}|patient`),
    encounterId: uuidv5(`${seed}|encounter`),
    questionnaireResponseId: uuidv5(`${seed}|qr`),
  };
}

/** The Reporting Site answers, filled the way mobile prefills them from the user. */
export function reportingAnswers(site: ReportingSite | undefined, now: Date): Answers {
  const a: Answers = {
    [L.investigationDate]: [creationStamp(now).slice(0, 10)],
    // Contacts are listed in the field, not at a facility visit.
    [L.investigationLocation]: [{ code: "community" }],
  };
  if (!site) return a;
  if (site.role) a[L.userRole] = [site.role];
  if (site.county) a[L.userCounty] = [site.county.id];
  if (site.subCounty) a[L.userSubCounty] = [site.subCounty.id];
  if (site.ward) a[L.userWard] = [site.ward.id];
  if (site.facility) a[L.userFacility] = [site.facility.id];
  // Other roles have no group of their own; the national one takes any location.
  const suffix = LEVEL_SUFFIX[site.role ?? ""] ?? "_national";
  const ref = (l: Facility) => ({ reference: `Location/${l.id}`, display: l.name });
  if (site.county) a[REPORTING.county + suffix] = [ref(site.county)];
  if (site.subCounty) a[REPORTING.subCounty + suffix] = [ref(site.subCounty)];
  if (site.ward) a[REPORTING.ward + suffix] = [ref(site.ward)];
  if (site.facility) a[REPORTING.facility + suffix] = [ref(site.facility)];
  if (site.facilityType) a[REPORTING.facilityType + suffix] = [{ code: site.facilityType }];
  return a;
}

export function contactAnswers(index: IndexCase, c: ContactInput, site?: ReportingSite, now: Date = new Date()): Answers {
  const a: Answers = {
    ...reportingAnswers(site, now),
    [L.caseType]: [{ code: "contact" }],
    [L.sourceCaseEpid]: [{ code: index.epid }],
    [L.givenNames]: [c.givenNames],
    [L.familyName]: [c.familyName],
    [L.exposureType]: [{ code: "human" }],
  };
  if (index.disease) a[L.disease] = [{ code: index.disease }];
  if (c.sex) a[L.sex] = [{ code: c.sex }];
  if (c.birthDate) {
    a[L.birthDateKnown] = [{ code: "known" }];
    a[L.birthDate] = [c.birthDate];
  } else if (c.ageYears != null) {
    a[L.birthDateKnown] = [{ code: "unknown" }];
    a[L.ageYears] = [c.ageYears];
  }
  if (c.idNumber) {
    a[L.idType] = [{ code: "national-id" }];
    a[L.idNumber] = [c.idNumber];
  }
  if (c.phone) a[L.phone] = [c.phone];
  if (c.county) a[L.county] = [{ reference: `Location/${c.county.id}`, display: c.county.name }];
  if (c.subCounty) a[L.subCounty] = [{ reference: `Location/${c.subCounty.id}`, display: c.subCounty.name }];
  if (c.village) a[L.village] = [c.village];
  if (c.contactDate) a[L.contactDate] = [c.contactDate];
  if (c.relationship) a[L.relationship] = [{ code: c.relationship }];
  if (c.relationship === "other" && c.relationshipOther) a[L.relationshipOther] = [c.relationshipOther];
  if (c.contactLocation) a[L.contactLocation] = [{ code: c.contactLocation }];
  if (c.exposureLocation) a[L.exposureLocation] = [c.exposureLocation];
  return a;
}

/** Patient as mobile maps a VHF case form (PatientMapper, SURNAME_AS_FAMILY). */
function contactPatient(c: ContactInput, ctx: Ctx, stamp: string) {
  const address =
    c.county || c.subCounty
      ? [
          {
            ...(c.subCounty ? { state: c.subCounty.name } : {}),
            ...(c.county ? { city: c.county.name } : {}),
            line: [c.subCounty?.name, c.county?.name].filter(Boolean),
          },
        ]
      : undefined;
  return put({
    resourceType: "Patient",
    id: ctx.patientId,
    active: true,
    name: [{ family: c.familyName, given: c.givenNames ? [c.givenNames] : [] }],
    ...(c.sex ? { gender: c.sex } : {}),
    ...(c.birthDate ? { birthDate: c.birthDate } : {}),
    ...(c.phone ? { telecom: [{ system: "phone", use: "mobile", value: c.phone }] } : {}),
    ...(address ? { address } : {}),
    identifier: [
      ...(c.idNumber ? [{ system: "national-id", value: c.idNumber }] : []),
      systemCreation(stamp),
      {
        system: VHF_CASE_SLUG,
        value: ctx.encounterId,
        type: { coding: [{ system: VHF_CASE_SLUG, code: VHF_CASE_SLUG, display: VHF_CASE_SLUG }], text: ctx.encounterId },
      },
    ],
    ...(ctx.practitionerId ? { generalPractitioner: [{ reference: `Practitioner/${ctx.practitionerId}` }] } : {}),
    ...managingLocation("patient", ctx.facility),
  });
}

function caseEncounter(ctx: Ctx, stamp: string) {
  const now = ctx.now.toISOString();
  return put({
    resourceType: "Encounter",
    id: ctx.encounterId,
    status: "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "FLD", display: "field" },
    subject: { reference: `Patient/${ctx.patientId}` },
    reasonCode: [
      { coding: [{ code: VHF_CASE_REASON }] },
      { coding: [{ system: "case-information", code: "case-information", display: "case-information" }], text: "case-information" },
    ],
    identifier: [systemCreation(stamp)],
    period: { start: now, end: now },
    ...(ctx.practitionerId ? { participant: [{ individual: { reference: `Practitioner/${ctx.practitionerId}` } }] } : {}),
    ...managingLocation("encounter", ctx.facility),
  });
}

export interface ContactBundleOptions {
  practitionerId?: string;
  facility?: Facility;
  /** The uploader's reporting site (new contacts only). */
  site?: ReportingSite;
  now?: Date;
}

/**
 * A new contact: Patient, VHF case Encounter (Type of case = Contact, linked to the case by its
 * EPID), its response and answers, plus one follow-up record per filled Day column.
 */
export function buildContactBundle(index: IndexCase, c: ContactInput, opts: ContactBundleOptions = {}): TransactionBundle {
  const ids = contactIds(index, c);
  const now = opts.now ?? new Date();
  const stamp = creationStamp(now);
  const ctx: Ctx = { patientId: ids.patientId, encounterId: ids.encounterId, practitionerId: opts.practitionerId, facility: opts.facility, now };
  const answers = contactAnswers(index, c, opts.site, now);
  const notes: Answers = c.notes ? { [L.importNotes]: [c.notes] } : {};
  const entries: BundleEntry[] = [
    contactPatient(c, ctx, stamp),
    caseEncounter(ctx, stamp),
    questionnaireResponse(CASE_FORM, answers, ctx, ids.questionnaireResponseId, "in-progress"),
    ...observations(CASE_FORM, { ...answers, ...notes }, ctx, ids.seed, `Encounter/${index.encounterId}`),
  ];
  for (const f of c.followUps ?? []) {
    if (!c.contactDate || f.day < 0 || f.day > FOLLOW_UP_WINDOW_DAYS) continue;
    entries.push(
      ...followUpEntries(
        { patientId: ids.patientId, contactEncounterId: ids.encounterId },
        { day: f.day, date: addDays(c.contactDate, f.day), symptomatic: f.symptomatic },
        { ...opts, now },
        `${ids.seed}|day${f.day}`,
      ),
    );
  }
  return { resourceType: "Bundle", type: "transaction", entry: entries };
}

/** An existing contact exposed to another case: link it to that case too, and restart its 21 days. */
export function buildExtraExposureBundle(
  index: IndexCase,
  contact: { patientId: string; encounterId: string },
  contactDate: string | undefined,
  opts: ContactBundleOptions = {},
): TransactionBundle {
  const now = opts.now ?? new Date();
  const ctx: Ctx = { ...contact, practitionerId: opts.practitionerId, facility: opts.facility, now };
  const answers: Answers = { [L.sourceCaseEpid]: [{ code: index.epid }] };
  if (contactDate) answers[L.contactDate] = [contactDate];
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: observations(CASE_FORM, answers, ctx, `${contact.encounterId}|exposure|${index.encounterId}`, `Encounter/${index.encounterId}`),
  };
}

/* ── Follow up and conversion ──────────────────────────────────────────── */

export interface FollowUpInput {
  day: number;
  date: string;
  symptomatic: boolean;
  symptoms?: string[];
  temperatureAm?: number;
  temperaturePm?: number;
  tracerEmail?: string;
  approach?: "physical-visit" | "phone-call";
  challenges?: string[];
}

function followUpEntries(
  contact: { patientId: string; contactEncounterId: string },
  f: FollowUpInput,
  opts: ContactBundleOptions & { now: Date },
  seed: string,
): BundleEntry[] {
  const encounterId = uuidv5(`${seed}|encounter`);
  const stamp = creationStamp(opts.now);
  const ctx: Ctx = { patientId: contact.patientId, encounterId, practitionerId: opts.practitionerId, facility: opts.facility, now: opts.now };
  const answers: Answers = {
    [L.followUpDay]: [f.day],
    [L.followUpDate]: [f.date],
    [L.followUpSymptomatic]: [{ code: f.symptomatic ? "yes" : "no" }],
  };
  if (f.symptomatic && f.symptoms?.length) answers[L.followUpSymptoms] = f.symptoms.map((code) => ({ code }));
  if (f.temperatureAm != null) answers[L.followUpTemperatureAm] = [f.temperatureAm];
  if (f.temperaturePm != null) answers[L.followUpTemperaturePm] = [f.temperaturePm];
  if (f.tracerEmail) answers[L.followUpTracer] = [f.tracerEmail];
  if (f.approach) answers[L.followUpApproach] = [{ code: f.approach }];
  if (f.challenges?.length) answers[L.followUpChallenges] = f.challenges.map((code) => ({ code }));
  const now = opts.now.toISOString();
  return [
    put({
      resourceType: "Encounter",
      id: encounterId,
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "FLD", display: "field" },
      subject: { reference: `Patient/${contact.patientId}` },
      partOf: { reference: `Encounter/${contact.contactEncounterId}` },
      reasonCode: [{ coding: [{ code: VHF_FOLLOW_UP_REASON }] }],
      identifier: [systemCreation(stamp)],
      period: { start: now, end: now },
      ...(opts.practitionerId ? { participant: [{ individual: { reference: `Practitioner/${opts.practitionerId}` } }] } : {}),
      ...managingLocation("encounter", opts.facility),
    }),
    questionnaireResponse(FOLLOW_UP_FORM, answers, ctx, uuidv5(`${seed}|qr`), "completed"),
    ...observations(FOLLOW_UP_FORM, answers, ctx, seed),
  ];
}

/** One day's follow up of a contact (a child Encounter of its case Encounter). */
export function buildFollowUpBundle(
  contact: { patientId: string; contactEncounterId: string },
  f: FollowUpInput,
  opts: ContactBundleOptions = {},
): TransactionBundle {
  const now = opts.now ?? new Date();
  // One record per contact, day and save; a correction is a new record (the latest counts).
  const seed = `${contact.contactEncounterId}|day${f.day}|${now.toISOString()}`;
  return { resourceType: "Bundle", type: "transaction", entry: followUpEntries(contact, f, { ...opts, now }, seed) };
}

/** Converts a contact: a new "Type of case" answer (answers are appended, never edited). */
export function buildConversionBundle(
  contact: { patientId: string; contactEncounterId: string },
  caseType: "suspected" | "probable" | "confirmed",
  opts: ContactBundleOptions = {},
): TransactionBundle {
  const now = opts.now ?? new Date();
  const ctx: Ctx = { patientId: contact.patientId, encounterId: contact.contactEncounterId, practitionerId: opts.practitionerId, facility: opts.facility, now };
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: observations(CASE_FORM, { [L.caseType]: [{ code: caseType }] }, ctx, `${contact.contactEncounterId}|convert|${now.toISOString()}`),
  };
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// Lab-results Questionnaires used by the admin portal. The JSON blobs in
// `src/questionnaires/*.json` are copied verbatim from the mobile app assets
// (nphiis/src/main/assets/*.json); keep them in sync so admin and mobile
// render, validate, and serialize answers identically.

import measlesLabResults from "@/questionnaires/measles-lab-results.json";
import measlesLabRegResults from "@/questionnaires/measles-lab-reg-results.json";
import afpStoolLabResults from "@/questionnaires/afp-case-stool-lab-results.json";
import afpItdLab from "@/questionnaires/afp-itd-lab.json";
import afpFinalLabResults from "@/questionnaires/afp-final-lab-results.json";
import vlCaseLabInformation from "@/questionnaires/vl-case-lab-information.json";

/* ── Minimal FHIR Questionnaire types (only fields we actually read) ─────── */

export interface AnswerCoding {
  code: string;
  display: string;
  system?: string;
}

export type EnableWhenOperator = "=" | "!=" | "exists" | "<" | "<=" | ">" | ">=";

export interface EnableWhen {
  question: string;
  operator: EnableWhenOperator;
  answerCoding?: AnswerCoding;
  answerString?: string;
  answerBoolean?: boolean;
  answerDate?: string;
}

export interface QuestionnaireAnswerOption {
  valueCoding?: AnswerCoding;
  valueString?: string;
  valueInteger?: number;
}

export interface QuestionnaireExtension {
  url: string;
  valueBoolean?: boolean;
  valueString?: string;
  valueCode?: string;
  valueInteger?: number;
  valueId?: string;
  valueDate?:
    | string
    | {
        extension?: Array<{
          url: string;
          valueExpression?: { language?: string; expression: string };
        }>;
      };
  valueExpression?: { language?: string; expression: string };
  extension?: QuestionnaireExtension[];
}

export type QuestionnaireItemType =
  | "group"
  | "display"
  | "string"
  | "text"
  | "date"
  | "dateTime"
  | "time"
  | "choice"
  | "open-choice"
  | "integer"
  | "decimal"
  | "boolean"
  | "reference"
  | "quantity"
  | "url";

export interface QuestionnaireItem {
  linkId: string;
  text?: string;
  type: QuestionnaireItemType;
  required?: boolean;
  readOnly?: boolean;
  answerOption?: QuestionnaireAnswerOption[];
  enableWhen?: EnableWhen[];
  enableBehavior?: "all" | "any";
  initial?: QuestionnaireAnswerOption[];
  extension?: QuestionnaireExtension[];
  item?: QuestionnaireItem[];
}

export interface FhirQuestionnaire {
  resourceType: "Questionnaire";
  title?: string;
  status?: string;
  item?: QuestionnaireItem[];
}

/* ── Registry ────────────────────────────────────────────────────────────── */

export interface LabFormDefinition {
  id: string;
  title: string;
  questionnaireUrl: string;
  allowedRoles: string[];
  questionnaire: FhirQuestionnaire;
  /**
   * Maps mobile questionnaire linkIds to the Observation code the Superset
   * reports join against (see the nphiis/reports/*.sql files in the mobile
   * repo). When an item isn't in this map we fall through to using the
   * linkId itself — that's correct for AFP questionnaires, whose numeric
   * linkIds the reports reference directly.
   */
  reportCodeMap?: Record<string, { code: string; display?: string }>;
}

/**
 * Forms exposed in the lab UI right now. Other LabFormDefinitions
 * (measles-reg, afp-itd, afp-final, vl-case) stay defined in `ALL_LAB_FORMS`
 * below so we don't lose the work, but only the entries listed here are
 * surfaced to the UI and the bulk-upload route. To re-enable one, add its
 * id to this set.
 */
const ENABLED_FORM_IDS = new Set<string>([
  "measles-lab-results",
  "afp-stool-lab-results",
]);

const ALL_LAB_FORMS: LabFormDefinition[] = [
  {
    id: "measles-lab-results",
    title: "Measles - Lab Information",
    questionnaireUrl:
      "http://nphiis.health.go.ke/Questionnaire/measles-lab-results",
    allowedRoles: [
      "LAB_TECHNICIAN",
      "NATIONAL_LAB",
      "ADMINISTRATOR",
      "SUPERUSER",
    ],
    questionnaire: measlesLabResults as unknown as FhirQuestionnaire,
    // Mobile linkIds → codes used by measles-cif-502.sql.
    reportCodeMap: {
      "date-specimen-received": {
        code: "specimenReceivedDate",
        display: "Date specimen received in lab",
      },
      "specimen-condition": {
        code: "specimenCondition",
        display: "Specimen Condition",
      },
      "measles-igm": {
        code: "measlesIgM",
        display: "Measles IgM results",
      },
      "rubella-igm": {
        code: "rubellaIgM",
        display: "Rubella IgM results",
      },
      "date-lab-sent-results": {
        code: "resultsToEPI",
        display: "Date lab sent out results to EPI Surv Unit",
      },
      "655865451155": {
        code: "sentToRegional",
        display:
          "Date Serum specimen was sent to regional lab for IgM confirmation",
      },
      "final-classification": {
        code: "finalClassification",
        display: "Final Classification",
      },
    },
  },
  {
    id: "measles-lab-reg-results",
    title: "Measles - Regional Lab Information",
    questionnaireUrl:
      "http://nphiis.health.go.ke/Questionnaire/measles-lab-reg-results",
    allowedRoles: ["NATIONAL_LAB", "ADMINISTRATOR", "SUPERUSER"],
    questionnaire: measlesLabRegResults as unknown as FhirQuestionnaire,
  },
  {
    id: "afp-stool-lab-results",
    title: "AFP - Stool Specimen Lab Results",
    questionnaireUrl:
      "http://nphiis.health.go.ke/Questionnaire/afp-case-stool-lab-results",
    allowedRoles: [
      "LAB_TECHNICIAN",
      "NATIONAL_LAB",
      "ADMINISTRATOR",
      "SUPERUSER",
    ],
    questionnaire: afpStoolLabResults as unknown as FhirQuestionnaire,
    // afp-cif-502.sql expects a text `labId` code; everything else in the
    // AFP form is a numeric linkId that the report joins against directly.
    reportCodeMap: {
      "8732404074721": { code: "labId", display: "Lab ID No" },
    },
  },
  {
    id: "afp-itd-lab",
    title: "AFP - ITD Lab Information",
    questionnaireUrl: "http://nphiis.health.go.ke/Questionnaire/afp-itd-lab",
    allowedRoles: ["NATIONAL_LAB", "ADMINISTRATOR", "SUPERUSER"],
    questionnaire: afpItdLab as unknown as FhirQuestionnaire,
  },
  {
    id: "afp-final-lab-results",
    title: "AFP - Final Laboratory Result",
    questionnaireUrl:
      "http://nphiis.health.go.ke/Questionnaire/afp-final-lab-results",
    allowedRoles: ["NATIONAL_LAB", "ADMINISTRATOR", "SUPERUSER"],
    questionnaire: afpFinalLabResults as unknown as FhirQuestionnaire,
  },
  {
    id: "vl-case-lab-information",
    title: "VL - Case Lab Information",
    questionnaireUrl:
      "http://nphiis.health.go.ke/Questionnaire/vl-case-lab-information",
    allowedRoles: [
      "LAB_TECHNICIAN",
      "NATIONAL_LAB",
      "ADMINISTRATOR",
      "SUPERUSER",
    ],
    questionnaire: vlCaseLabInformation as unknown as FhirQuestionnaire,
  },
];

export const LAB_FORMS: LabFormDefinition[] = ALL_LAB_FORMS.filter((f) =>
  ENABLED_FORM_IDS.has(f.id),
);

export function getLabForm(id: string): LabFormDefinition | undefined {
  return LAB_FORMS.find((f) => f.id === id);
}

/* ── Helpers for reading Questionnaire extensions ────────────────────────── */

const HIDDEN_EXT = "http://hl7.org/fhir/StructureDefinition/questionnaire-hidden";
const MAX_VALUE_EXT = "http://hl7.org/fhir/StructureDefinition/maxValue";
const CQF_CALC_EXT =
  "http://hl7.org/fhir/StructureDefinition/cqf-calculatedValue";
const CONSTRAINT_EXT =
  "http://hl7.org/fhir/StructureDefinition/questionnaire-constraint";
const MIN_LEN_EXT = "http://hl7.org/fhir/StructureDefinition/minLength";
const MAX_LEN_EXT = "http://hl7.org/fhir/StructureDefinition/maxLength";
const ITEM_CONTROL_EXT =
  "http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl";

export function isHidden(item: QuestionnaireItem): boolean {
  return (
    item.extension?.some(
      (e) => e.url === HIDDEN_EXT && e.valueBoolean === true,
    ) ?? false
  );
}

export function itemControl(item: QuestionnaireItem): string | undefined {
  const ext = item.extension?.find((e) => e.url === ITEM_CONTROL_EXT);
  // valueCodeableConcept isn't typed above; look it up lazily.
  const raw = ext as unknown as {
    valueCodeableConcept?: { coding?: Array<{ code?: string }> };
  } | undefined;
  return raw?.valueCodeableConcept?.coding?.[0]?.code;
}

/**
 * Returns true when the item has a `maxValue` extension whose calculated value
 * is `today()`, meaning the answer date must not be in the future.
 */
export function dateMaxIsToday(item: QuestionnaireItem): boolean {
  const max = item.extension?.find((e) => e.url === MAX_VALUE_EXT);
  if (!max) return false;
  const raw = max.valueDate;
  if (!raw || typeof raw === "string") return false;
  return (
    raw.extension?.some(
      (e) =>
        e.url === CQF_CALC_EXT &&
        e.valueExpression?.expression?.trim() === "today()",
    ) ?? false
  );
}

/**
 * Parses the questionnaire-constraint extension to find a cross-field "date
 * must be on/after another field" rule. The mobile questionnaires always use
 * the shape: `%context.answer.value >= %resource.descendants().where(linkId='X').answer.value`.
 */
export function dateMinFromLinkId(item: QuestionnaireItem): string | undefined {
  const c = item.extension?.find((e) => e.url === CONSTRAINT_EXT);
  if (!c?.extension) return undefined;
  const expr = c.extension.find((e) => e.url === "expression")?.valueString;
  if (!expr) return undefined;
  const m = expr.match(/linkId='([^']+)'/);
  if (!m) return undefined;
  // Only treat ">=" / ">" as a min-date constraint.
  if (!/>=|>/.test(expr)) return undefined;
  return m[1];
}

export function constraintHuman(item: QuestionnaireItem): string | undefined {
  const c = item.extension?.find((e) => e.url === CONSTRAINT_EXT);
  return c?.extension?.find((e) => e.url === "human")?.valueString;
}

export function minLength(item: QuestionnaireItem): number | undefined {
  return item.extension?.find((e) => e.url === MIN_LEN_EXT)?.valueInteger;
}
export function maxLength(item: QuestionnaireItem): number | undefined {
  return item.extension?.find((e) => e.url === MAX_LEN_EXT)?.valueInteger;
}

/* ── Tree walking ────────────────────────────────────────────────────────── */

/** Returns every input-capable item in the questionnaire in depth-first order.
 * Skips group/display containers (but descends into them) and skips hidden
 * items by default (callers may opt in via `includeHidden`). */
export function flattenItems(
  q: FhirQuestionnaire,
  opts: { includeHidden?: boolean } = {},
): QuestionnaireItem[] {
  const out: QuestionnaireItem[] = [];
  const walk = (items?: QuestionnaireItem[]) => {
    if (!items) return;
    for (const it of items) {
      if (it.type === "group" || it.type === "display") {
        walk(it.item);
        continue;
      }
      if (!opts.includeHidden && isHidden(it)) continue;
      out.push(it);
    }
  };
  walk(q.item);
  return out;
}

/** All items (including hidden + display) indexed by linkId. Used for
 * resolving enableWhen parents and for picking up hidden items with initial
 * answers at submission time. */
export function indexItems(q: FhirQuestionnaire): Map<string, QuestionnaireItem> {
  const map = new Map<string, QuestionnaireItem>();
  const walk = (items?: QuestionnaireItem[]) => {
    if (!items) return;
    for (const it of items) {
      map.set(it.linkId, it);
      if (it.item) walk(it.item);
    }
  };
  walk(q.item);
  return map;
}

/* ── enableWhen evaluation ───────────────────────────────────────────────── */

/**
 * User-entered answers keyed by linkId. Strings come from the form:
 *  - choice: stored as the answerOption `code`
 *  - boolean: "true" / "false"
 *  - date: ISO yyyy-mm-dd
 *  - everything else: the raw string.
 */
export type AnswerMap = Record<string, string>;

function matchesEnableWhen(ew: EnableWhen, answer: string | undefined): boolean {
  const hasValue = answer !== undefined && answer !== "";
  if (ew.operator === "exists") {
    // exists=true when there's any answer.
    return hasValue;
  }
  // expected value as a plain string, regardless of type
  const expected =
    ew.answerCoding?.code ??
    (ew.answerBoolean !== undefined ? String(ew.answerBoolean) : undefined) ??
    ew.answerString ??
    ew.answerDate;
  if (expected === undefined) return false;
  const lhs = answer ?? "";
  const rhs = expected;
  switch (ew.operator) {
    case "=":
      return lhs === rhs;
    case "!=":
      // If nothing has been answered yet, a `!= X` condition is not yet met —
      // this mirrors the mobile behaviour where dependent fields stay hidden
      // until the parent has an explicit non-matching answer.
      return hasValue && lhs !== rhs;
    case "<":
      return hasValue && lhs < rhs;
    case "<=":
      return hasValue && lhs <= rhs;
    case ">":
      return hasValue && lhs > rhs;
    case ">=":
      return hasValue && lhs >= rhs;
    default:
      return false;
  }
}

export function isItemEnabled(
  item: QuestionnaireItem,
  answers: AnswerMap,
): boolean {
  if (!item.enableWhen?.length) return true;
  const results = item.enableWhen.map((ew) =>
    matchesEnableWhen(ew, answers[ew.question]),
  );
  return item.enableBehavior === "any"
    ? results.some(Boolean)
    : results.every(Boolean);
}

/* ── CSV header helpers ──────────────────────────────────────────────────── */

/** snake_case-ifies an item's label for use as a stable CSV column header. */
export function csvHeaderFor(item: QuestionnaireItem): string {
  const base = (item.text ?? item.linkId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || item.linkId;
}

/** CSV template: `EPID` plus every visible input field for the form. */
export function csvTemplateForForm(form: LabFormDefinition): string {
  const items = flattenItems(form.questionnaire);
  const headers = ["EPID", ...items.map(csvHeaderFor)];
  return headers.join(",") + "\n";
}

/** Friendly label for the UI: the questionnaire item text, falling back to a
 * humanised linkId. */
export function labelFor(item: QuestionnaireItem): string {
  if (item.text && item.text.trim()) return item.text;
  return item.linkId;
}

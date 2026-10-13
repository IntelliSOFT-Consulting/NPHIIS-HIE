// The bulk-upload CSV template, pre-filled with the cases still waiting for a
// result (see listCasesWithoutLabResult).

import Papa from "papaparse";
import { type LabFormDefinition, csvHeaderFor, flattenItems } from "./questionnaires";

export interface PendingLabCase {
  epid: string;
  name: string;
  county?: string;
  subCounty?: string;
}

export interface PendingLabCases {
  cases: PendingLabCase[];
  /** Records left out because they have no complete EPID yet. */
  withoutEpid: number;
}

// For identifying each case only: the upload reads EPID and the form's own
// columns and ignores these.
const REFERENCE_COLUMNS = ["Patient Name", "County", "Sub County"];

export function labTemplateCsv(form: LabFormDefinition, cases: PendingLabCase[]): string {
  const formColumns = flattenItems(form.questionnaire).map(csvHeaderFor);
  return Papa.unparse({
    fields: ["EPID", ...REFERENCE_COLUMNS, ...formColumns],
    data: cases.map((c) => [c.epid, c.name, c.county ?? "", c.subCounty ?? "", ...formColumns.map(() => "")]),
  }) + "\n";
}

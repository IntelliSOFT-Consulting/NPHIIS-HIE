import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { hasFormValues } from "./lab-submission";
import { labTemplateCsv } from "./lab-template";
import { getLabForm, type LabFormDefinition } from "./questionnaires";

function measlesForm(): LabFormDefinition {
  const form = getLabForm("measles-lab-results");
  if (!form) throw new Error("measles-lab-results not registered");
  return form;
}

describe("labTemplateCsv", () => {
  it("pre-fills EPID and reference columns, leaving the form's columns blank", () => {
    const csv = labTemplateCsv(measlesForm(), [
      { epid: "KEN-BOM-KON-2026-MEA-001", name: "Achieng, Mary", county: "BOMET", subCounty: "KONOIN" },
    ]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.meta.fields?.slice(0, 4)).toEqual(["EPID", "Patient Name", "County", "Sub County"]);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]).toMatchObject({ EPID: "KEN-BOM-KON-2026-MEA-001", "Patient Name": "Achieng, Mary" });
  });

  it("produces rows the upload treats as blank until a result is entered", () => {
    const form = measlesForm();
    const csv = labTemplateCsv(form, [{ epid: "KEN-BOM-KON-2026-MEA-001", name: "A", county: "BOMET" }]);
    const [row] = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
    expect(hasFormValues(form, row)).toBe(false);
    expect(hasFormValues(form, { ...row, lab_id_no: "LAB-1" })).toBe(true);
  });

  it("has only the header row when no case is waiting", () => {
    const csv = labTemplateCsv(measlesForm(), []);
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
});

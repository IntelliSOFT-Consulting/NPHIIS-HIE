import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RowMappingError,
  buildLabSubmissionBundle,
  extractAnswers,
  formsForDisease,
} from "./lab-submission";
import { getLabForm, isItemEnabled, type LabFormDefinition } from "./questionnaires";

function vhfForm(): LabFormDefinition {
  const form = getLabForm("vhf-lab-results");
  if (!form) throw new Error("vhf-lab-results not registered");
  return form;
}

/** A complete, valid VHF lab row keyed by linkId (as SingleResultForm sends it). */
function vhfRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    date_sample_received: "2026-10-01",
    condition_of_sample: "good",
    laboratory_tests: "pcr",
    preliminary_laboratory_result: "positive",
    date_of_preliminary_result: "2026-10-02",
    final_laboratory_result: "positive",
    date_of_final_laboratory_result: "2026-10-03",
    final_classification: "confirmed",
    ...overrides,
  };
}

describe("VHF lab form registration", () => {
  it("is suggested for VHF EPIDs", () => {
    expect(formsForDisease("VHF")).toEqual(["vhf-lab-results"]);
  });

  it("uses a Lab Information encounter reason so hie-auth sends LAB_RESULT", () => {
    const form = vhfForm();
    expect(form.encounterReason).toBe("VHF Lab Information");
    expect(form.questionnaireUrl).toBe(
      "http://nphiis.health.go.ke/Questionnaire/vhf-lab-results",
    );
  });

  it("is a byte-identical copy of the generated form", () => {
    const generated = readFileSync(
      path.resolve(__dirname, "../../../forms/vhf/out/vhf-lab-results.json"),
      "utf8",
    );
    const copy = readFileSync(
      path.resolve(__dirname, "../questionnaires/vhf-lab-results.json"),
      "utf8",
    );
    expect(copy).toBe(generated);
  });
});

describe("multi-select (repeats) answers", () => {
  it("accepts several options separated by ; or , in CSV", () => {
    for (const raw of ["PCR; ELISA", "pcr,elisa", "PCR;ELISA"]) {
      const answers = extractAnswers(vhfForm(), vhfRow({ laboratory_tests: raw }));
      const tests = answers.find((a) => a.item.linkId === "laboratory_tests");
      expect(tests?.answer.normalised).toBe("pcr;elisa");
      expect(tests?.answer.display).toBe("PCR, ELISA");
    }
  });

  it("rejects an unknown option inside a multi-select", () => {
    expect(() =>
      extractAnswers(vhfForm(), vhfRow({ laboratory_tests: "pcr;xray" })),
    ).toThrow(RowMappingError);
  });

  it("rejects a cell that holds only separators", () => {
    expect(() =>
      extractAnswers(vhfForm(), vhfRow({ laboratory_tests: " ; , " })),
    ).toThrow(RowMappingError);
  });

  it("enables dependent items when any selected option matches", () => {
    const other = vhfForm()
      .questionnaire.item!.flatMap((g) => g.item ?? [])
      .find((i) => i.linkId === "laboratory_tests_other")!;
    expect(isItemEnabled(other, { laboratory_tests: "pcr;other" })).toBe(true);
    expect(isItemEnabled(other, { laboratory_tests: "pcr;elisa" })).toBe(false);
    expect(isItemEnabled(other, { laboratory_tests: "other" })).toBe(true);
  });

  it("requires the 'other' text only when other is among the selections", () => {
    expect(() =>
      extractAnswers(vhfForm(), vhfRow({ laboratory_tests: "pcr;other" })),
    ).toThrow(/Laboratory tests - other/);
  });

  it("writes one QR answer per option and one Observation with joined displays", () => {
    const bundle = buildLabSubmissionBundle({
      form: vhfForm(),
      row: vhfRow({ laboratory_tests: "pcr;elisa" }),
      patientId: "p1",
      originalEncounterId: "case-enc",
    });
    const qr = bundle.entry.find((e) => e.resource.resourceType === "QuestionnaireResponse")!
      .resource as { item: Array<{ linkId: string; answer: unknown[] }> };
    const qrTests = qr.item.find((i) => i.linkId === "laboratory_tests")!;
    expect(qrTests.answer).toEqual([
      { valueCoding: { code: "pcr", display: "PCR" } },
      { valueCoding: { code: "elisa", display: "ELISA" } },
    ]);
    const obs = bundle.entry
      .map((e) => e.resource as { resourceType: string; code?: { coding: Array<{ code: string }> }; valueString?: string })
      .filter((r) => r.resourceType === "Observation" && r.code?.coding[0].code === "laboratory_tests");
    expect(obs).toHaveLength(1);
    expect(obs[0].valueString).toBe("PCR, ELISA");
  });
});

describe("VHF lab form rules", () => {
  it("rejects a final result dated before the sample was received", () => {
    expect(() =>
      extractAnswers(vhfForm(), vhfRow({ date_of_final_laboratory_result: "2026-09-30" })),
    ).toThrow(RowMappingError);
  });

  it("does not ask for a preliminary result date while it is pending", () => {
    const answers = extractAnswers(
      vhfForm(),
      vhfRow({ preliminary_laboratory_result: "pending", date_of_preliminary_result: "" }),
    );
    expect(answers.find((a) => a.item.linkId === "date_of_preliminary_result")).toBeUndefined();
  });

  it("requires a final classification", () => {
    expect(() => extractAnswers(vhfForm(), vhfRow({ final_classification: "" }))).toThrow(
      /Final classification/,
    );
  });

  it("links the lab encounter to the case and uses the VHF reason code", () => {
    const bundle = buildLabSubmissionBundle({
      form: vhfForm(),
      row: vhfRow(),
      patientId: "p1",
      originalEncounterId: "case-enc",
    });
    const enc = bundle.entry[0].resource as {
      reasonCode: Array<{ coding: Array<{ code: string }> }>;
      partOf: { reference: string };
    };
    expect(enc.reasonCode[0].coding[0].code).toBe("VHF Lab Information");
    expect(enc.partOf.reference).toBe("Encounter/case-enc");
  });
});

describe("existing single-choice forms are unchanged", () => {
  it("stores one coding for a measles choice and honours != enableWhen", () => {
    const measles = getLabForm("measles-lab-results")!;
    const answers = extractAnswers(measles, {
      labId: "L1",
      "specimen-condition": "Inadequate",
      "specimen-inadequate-narrative": "Haemolysed",
    });
    const cond = answers.find((a) => a.item.linkId === "specimen-condition")!;
    expect(cond.answer.fhir).toEqual({ valueCoding: { code: "Inadequate", display: "Inadequate" } });
    expect(cond.answer.fhirValues).toBeUndefined();
    // measles-igm is enabled only when specimen-condition != Inadequate.
    expect(answers.find((a) => a.item.linkId === "measles-igm")).toBeUndefined();
  });
});

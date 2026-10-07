import { describe, expect, it } from "vitest";
import {
  formatLabResultLinesForPush,
  formatObservationValue,
  isLabResultEncounter,
} from "./lab-result-notification";

describe("isLabResultEncounter", () => {
  it("returns true for lab encounter with partOf and Lab Information reason", () => {
    expect(
      isLabResultEncounter({
        partOf: { reference: "Encounter/case-1" },
        reasonCode: [{ coding: [{ code: "Measles Lab Information" }] }],
      }),
    ).toBe(true);
  });

  it("returns true for AFP and VL lab reason codes", () => {
    expect(
      isLabResultEncounter({
        partOf: { reference: "Encounter/case-1" },
        reasonCode: [{ coding: [{ code: "AFP Lab Information" }] }],
      }),
    ).toBe(true);
    expect(
      isLabResultEncounter({
        partOf: { reference: "Encounter/case-1" },
        reasonCode: [{ coding: [{ code: "VL Lab Information" }] }],
      }),
    ).toBe(true);
  });

  it("returns true for VHF lab reason code", () => {
    expect(
      isLabResultEncounter({
        partOf: { reference: "Encounter/case-1" },
        reasonCode: [{ coding: [{ code: "VHF Lab Information" }] }],
      }),
    ).toBe(true);
  });

  it("returns false without partOf", () => {
    expect(
      isLabResultEncounter({
        reasonCode: [{ coding: [{ code: "Measles Lab Information" }] }],
      }),
    ).toBe(false);
  });

  it("returns false for non-lab encounter reason", () => {
    expect(
      isLabResultEncounter({
        partOf: { reference: "Encounter/case-1" },
        reasonCode: [{ coding: [{ code: "Measles Case Information" }] }],
      }),
    ).toBe(false);
  });

  it("returns false when reason is missing", () => {
    expect(
      isLabResultEncounter({
        partOf: { reference: "Encounter/case-1" },
      }),
    ).toBe(false);
  });
});

describe("formatObservationValue", () => {
  it("formats string, date, coding, and boolean values", () => {
    expect(formatObservationValue({ valueString: "Positive" })).toBe("Positive");
    expect(formatObservationValue({ valueDate: "2024-06-01" })).toBe("2024-06-01");
    expect(
      formatObservationValue({
        valueCoding: { display: "Confirmed", code: "confirmed" },
      }),
    ).toBe("Confirmed");
    expect(formatObservationValue({ valueBoolean: true })).toBe("Yes");
    expect(formatObservationValue({ valueBoolean: false })).toBe("No");
    expect(formatObservationValue({})).toBe("—");
  });
});

describe("formatLabResultLinesForPush", () => {
  it("joins result lines with semicolons", () => {
    const body = formatLabResultLinesForPush([
      { label: "Measles IgM", value: "Positive" },
      { label: "Final classification", value: "Confirmed" },
    ]);
    expect(body).toContain("Measles IgM: Positive");
    expect(body).toContain("Final classification: Confirmed");
  });

  it("returns fallback when no lines", () => {
    expect(formatLabResultLinesForPush([])).toMatch(/Lab results recorded/);
  });

  it("truncates long bodies", () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      label: `Field ${i}`,
      value: "A moderately long value here",
    }));
    const body = formatLabResultLinesForPush(lines, 100);
    expect(body.length).toBeLessThanOrEqual(100);
    expect(body.endsWith("…")).toBe(true);
  });
});

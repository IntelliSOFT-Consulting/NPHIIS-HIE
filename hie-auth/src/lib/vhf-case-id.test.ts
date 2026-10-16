import { describe, expect, it } from "vitest";
import {
  caseIdIdentifier,
  formatVhfCaseId,
  getCaseId,
  isVhfCaseId,
  vhfCaseIdCounterKey,
  vhfCaseYear,
} from "./vhf-case-id";
import { EPID_SYSTEM_URI } from "./epid-utils";

describe("formatVhfCaseId", () => {
  it("pads to three digits and grows past 999", () => {
    expect(formatVhfCaseId(2026, 1)).toBe("KEN-2026-001");
    expect(formatVhfCaseId(2026, 999)).toBe("KEN-2026-999");
    expect(formatVhfCaseId(2026, 1000)).toBe("KEN-2026-1000");
    expect(formatVhfCaseId(2026, 999999)).toBe("KEN-2026-999999");
  });
});

describe("isVhfCaseId", () => {
  it("accepts only the national format", () => {
    expect(isVhfCaseId("KEN-2026-001")).toBe(true);
    expect(isVhfCaseId("KEN-2026-123456")).toBe(true);
    expect(isVhfCaseId("KEN-2026-01")).toBe(false);
    expect(isVhfCaseId("KEN-KER-KIE-2026-VHF-001")).toBe(false);
    expect(isVhfCaseId(undefined)).toBe(false);
  });
});

describe("getCaseId", () => {
  it("reads the Case ID and ignores the EPID", () => {
    const encounter = {
      identifier: [
        { system: EPID_SYSTEM_URI, value: "KEN-KER-KIE-2026-VHF-001" },
        caseIdIdentifier("KEN-2026-007"),
      ],
    };
    expect(getCaseId(encounter)).toBe("KEN-2026-007");
    expect(getCaseId({ identifier: [{ system: EPID_SYSTEM_URI, value: "KEN-KER-KIE-2026-VHF-001" }] })).toBeUndefined();
  });
});

describe("vhfCaseIdCounterKey", () => {
  it("restarts the counter each year", () => {
    expect(vhfCaseIdCounterKey(2026)).not.toEqual(vhfCaseIdCounterKey(2027));
  });

  it("does not share a counter with the VHF EPIDs", () => {
    expect(vhfCaseIdCounterKey(2026).county).toBe("NATIONAL");
  });
});

describe("vhfCaseYear", () => {
  const now = new Date("2027-01-02T00:00:00Z");
  it("prefers the phone's creation time, then the encounter start, then now", () => {
    expect(vhfCaseYear("2026-12-30 18:01:00", "2027-01-01", now)).toBe(2026);
    expect(vhfCaseYear(undefined, "2025-06-01T08:00:00+03:00", now)).toBe(2025);
    expect(vhfCaseYear("garbage", undefined, now)).toBe(2027);
  });
});

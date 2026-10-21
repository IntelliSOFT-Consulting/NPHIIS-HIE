import { describe, expect, it } from "vitest";
import { conditionCodeForReason, encounterGetsNoEpid } from "./condition-codes";

describe("conditionCodeForReason", () => {
  it("maps known case forms", () => {
    expect(conditionCodeForReason("Measles Case Information")).toBe("MEA");
    expect(conditionCodeForReason("AFP Case Information")).toBe("AFP");
    expect(conditionCodeForReason("MOH 505 Reporting Form")).toBe("MOH505");
    expect(conditionCodeForReason("VHF Case Information")).toBe("VHF");
  });

  it("keeps the 3-char fallback for unmapped forms", () => {
    expect(conditionCodeForReason("Mpox Register")).toBe("MPO");
  });

  it("returns UNK for a missing reason", () => {
    expect(conditionCodeForReason(undefined)).toBe("UNK");
    expect(conditionCodeForReason("")).toBe("UNK");
  });
});

describe("encounterGetsNoEpid", () => {
  it("is true for call logs, whichever reason coding names them", () => {
    expect(encounterGetsNoEpid({ reasonCode: [{ coding: [{ code: "Alert Rumor Log" }] }] })).toBe(true);
    expect(
      encounterGetsNoEpid({ reasonCode: [{ coding: [{ code: "case-information" }] }, { coding: [{ code: "Alert Rumor Log" }] }] }),
    ).toBe(true);
  });

  it("is false for case forms and encounters without a reason", () => {
    expect(encounterGetsNoEpid({ reasonCode: [{ coding: [{ code: "VHF Case Information" }] }] })).toBe(false);
    expect(encounterGetsNoEpid({})).toBe(false);
    expect(encounterGetsNoEpid(null)).toBe(false);
  });
});

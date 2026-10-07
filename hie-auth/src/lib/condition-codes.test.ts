import { describe, expect, it } from "vitest";
import { conditionCodeForReason } from "./condition-codes";

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

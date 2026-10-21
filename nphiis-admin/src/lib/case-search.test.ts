import { describe, expect, it } from "vitest";
import { parseCaseQuery, phoneVariants } from "./case-search";

describe("parseCaseQuery", () => {
  it("opens EPIDs and Case IDs directly", () => {
    expect(parseCaseQuery(" KEN-2026-001 ")).toEqual({ kind: "id", value: "KEN-2026-001" });
    expect(parseCaseQuery("KEN-NAI-KIB-2026-VHF-001")).toEqual({ kind: "id", value: "KEN-NAI-KIB-2026-VHF-001" });
  });

  it("reads phone numbers in any common form", () => {
    for (const q of ["0712345678", "+254712345678", "254 712 345 678", "0712-345-678"]) {
      const parsed = parseCaseQuery(q);
      expect(parsed.kind).toBe("phone");
      if (parsed.kind === "phone") expect(parsed.variants).toEqual(expect.arrayContaining(["0712345678", "+254712345678"]));
    }
  });

  it("keeps foreign numbers as typed", () => {
    expect(phoneVariants("+256772004519")).toEqual(expect.arrayContaining(["+256772004519", "256772004519"]));
  });

  it("splits names into terms", () => {
    expect(parseCaseQuery("Mary-Jane  Wanjiru")).toEqual({ kind: "name", terms: ["Mary-Jane", "Wanjiru"] });
    expect(parseCaseQuery("O'Brien")).toEqual({ kind: "name", terms: ["O'Brien"] });
  });

  it("ignores input too short to search", () => {
    expect(parseCaseQuery("  ")).toEqual({ kind: "empty" });
    expect(parseCaseQuery("a")).toEqual({ kind: "empty" });
  });
});

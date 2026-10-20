import { describe, expect, it } from "vitest";
import { buildDrafts, checkContact, draftKey, HAND_ROW_BASE, savable } from "./contact-drafts";
import type { ImportedContact, ParsedRow } from "./contact-import";

const TODAY = "2026-10-20";
const row = (rowNumber: number, contact: Partial<ImportedContact>, errors: string[] = []): ParsedRow => ({
  rowNumber,
  contact: { rowNumber, givenNames: "", familyName: "", ...contact },
  errors,
  warnings: ["from the sheet"],
});

describe("checkContact", () => {
  it("needs a name and a valid phone, and no dates in the future", () => {
    const c: ImportedContact = { rowNumber: 1, givenNames: "", familyName: "", phone: "12345", contactDate: "2026-10-21" };
    expect(checkContact(c, TODAY).errors).toEqual(["No name", '"12345" is not a mobile number', "Date of contact is in the future"]);
  });

  it("warns without a date of contact or residence", () => {
    const c: ImportedContact = { rowNumber: 1, givenNames: "Jane", familyName: "Otieno", phone: "0712345678" };
    expect(checkContact(c, TODAY)).toEqual({
      errors: [],
      warnings: ["No date of contact: follow up counts from today", "No county / sub-county of residence"],
    });
  });
});

describe("buildDrafts", () => {
  const fileRows = [
    row(5, { givenNames: "Jane", familyName: "Otieno", phone: "0712345678" }),
    row(6, {}, ["No name"]),
  ];
  const hand: ImportedContact = { rowNumber: HAND_ROW_BASE + 1, givenNames: "Jane", familyName: "Otieno", phone: "+254712345678" };

  it("lists file rows then contacts entered by hand, and marks the same person twice", () => {
    const drafts = buildDrafts(fileRows, [hand], new Map(), TODAY);
    expect(drafts.map((d) => [d.rowNumber, d.source])).toEqual([
      [5, "file"],
      [6, "file"],
      [HAND_ROW_BASE + 1, "hand"],
    ]);
    expect(drafts[0].warnings).toEqual(["from the sheet"]);
    expect(drafts.map(savable)).toEqual([true, false, false]);
    expect(drafts[2].duplicateOf).toBe("row 5");
  });

  it("re-checks an edited file row with the form's checks", () => {
    const fixed: ImportedContact = { rowNumber: 6, givenNames: "Peter", familyName: "Kamau", contactDate: "2026-10-10", subCountyName: "Kibra" };
    const drafts = buildDrafts(fileRows, [], new Map([[6, fixed]]), TODAY);
    expect(drafts[1]).toMatchObject({ edited: true, errors: [], warnings: [], contact: fixed });
    expect(savable(drafts[1])).toBe(true);
  });

  it("keys a contact by its content", () => {
    expect(draftKey(hand)).toBe(draftKey({ ...hand }));
    expect(draftKey(hand)).not.toBe(draftKey({ ...hand, phone: "0700000000" }));
  });
});

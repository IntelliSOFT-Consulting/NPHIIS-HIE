import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  autoMapColumns,
  TEMPLATE_HEADERS,
  TEMPLATE_INSTRUCTIONS,
  parseDate,
  parseLineList,
  parsePhone,
  parseRelationship,
  personKey,
  splitName,
} from "./contact-import";

// The MoH contact line list header, as exported (multi-line headers, a merged follow-up block).
const MOH_HEADER = [
  "No", "Full Name", "Date of Exposure\n(dd.mm.yyyy)", "Mobile Phone Number (+254)", "Sex\n(M/F)",
  "Age\n(Years at last Birthday)", "Comment", "Relation to confirmed case\n- Family member\n- Healthcare worker\n- Other",
  "Flight Seat No.", "Exposure Type", "Quarantine Facility", "Address", "County", "Sub-county", "Date of Admission",
  "Comorbidities (Yes/NO)", "If yes, what type of comorbidity", "Accessing care for comorbidity",
  "On each day of follow-up indicate\n1. No symptoms\n2. Has symptoms - classified as a suspected case and referred for isolation and care",
  ...Array(20).fill(""),
  "Days post exposure", "Days in quarantine",
];

const row = (over: Record<number, unknown>) => {
  const cells: unknown[] = Array(MOH_HEADER.length).fill("");
  for (const [i, v] of Object.entries(over)) cells[Number(i)] = v;
  return cells;
};

describe("autoMapColumns", () => {
  it("maps the MoH line list, including the 21 follow-up day columns", () => {
    const cols = autoMapColumns(MOH_HEADER);
    const field = (i: number) => cols[i].field;
    expect([field(0), field(1), field(2), field(3), field(4), field(5)]).toEqual([
      "ignore", "fullName", "contactDate", "phone", "sex", "age",
    ]);
    expect([field(6), field(7), field(8), field(11), field(12), field(13)]).toEqual([
      "comment", "relationship", "flightSeat", "village", "county", "subCounty",
    ]);
    expect([field(9), field(10), field(14), field(15)]).toEqual(["note", "note", "note", "note"]);
    const days = cols.filter((c) => c.field === "day").map((c) => c.day);
    expect(days).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(cols[39].field).toBe("ignore");
    expect(cols[40].field).toBe("ignore");
  });

  it("reads Day N headers", () => {
    const cols = autoMapColumns(["Name", "Day 1", "Day 2", "D3"]);
    expect(cols.slice(1).map((c) => [c.field, c.day])).toEqual([["day", 1], ["day", 2], ["day", 3]]);
  });
});

describe("parseLineList", () => {
  it("reads rows of the MoH sheet into contacts", () => {
    const table = [
      ["CONTACT LINE LIST - VHF"],
      MOH_HEADER,
      row({ 0: 1, 1: "Jane Akinyi Otieno", 2: "03.10.2026", 3: "712345678", 4: "F", 5: "34", 7: "Sister",
        8: "N/A", 10: "KNH Isolation", 11: "Kibera Lindi", 12: "Nairobi", 13: "Kibra", 18: "1", 19: "1", 20: "2" }),
      row({ 0: 2, 1: "Peter Mwangi", 2: 46298, 3: "+254 722 000 111", 4: "M", 5: "41", 7: "Nurse", 8: "14C" }),
      row({ 0: 3, 1: "Jane Akinyi Otieno", 3: "0712345678" }),
      row({ 0: 4, 1: "Alice W", 6: "Confirmed case" }),
      row({}),
    ];
    const sheet = parseLineList(table);
    expect(sheet.headerRow).toBe(1);
    expect(sheet.rows).toHaveLength(4);

    const [jane, peter, again, confirmed] = sheet.rows;
    expect(jane.errors).toEqual([]);
    expect(jane.contact).toMatchObject({
      rowNumber: 3,
      givenNames: "Jane Akinyi",
      familyName: "Otieno",
      contactDate: "2026-10-03",
      phone: "0712345678",
      sex: "female",
      ageYears: 34,
      relationship: "family",
      village: "Kibera Lindi",
      countyName: "Nairobi",
      subCountyName: "Kibra",
      followUps: [
        { day: 1, symptomatic: false },
        { day: 2, symptomatic: false },
        { day: 3, symptomatic: true },
      ],
    });
    expect(jane.contact.notes).toBe("Quarantine Facility: KNH Isolation");
    expect(jane.contact.contactLocation).toBeUndefined();

    expect(peter.contact).toMatchObject({
      contactDate: "2026-10-03",
      phone: "0722000111",
      relationship: "hcw",
      contactLocation: "travel",
      exposureLocation: "Flight, seat 14C",
    });

    expect(again.duplicateOfRow).toBe(3);
    expect(confirmed.errors).toContain("Marked as a confirmed case, not a contact");
  });

  it("skips a row of day numbers under a merged follow-up header", () => {
    const header = ["Full Name", "Date of exposure", "Phone", "On each day of follow-up indicate", "", ""];
    const sheet = parseLineList([header, ["", "", "", "1", "2", "3"], ["Ann Bett", "2026-10-01", "0711111111", "1", "", "2"]]);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].contact.followUps).toEqual([
      { day: 1, symptomatic: false },
      { day: 3, symptomatic: true },
    ]);
  });

  it("uses a mapping chosen by the user", () => {
    const table = [["Jina", "Simu", "Tarehe", "x"], ["Ann Bett", "0711111111", "01/10/2026", "y"]];
    const cols = autoMapColumns(table[0]).map((c, i) => ({
      ...c,
      field: (["fullName", "phone", "contactDate", "ignore"] as const)[i],
    }));
    const sheet = parseLineList(table, cols);
    expect(sheet.rows[0].contact).toMatchObject({ givenNames: "Ann", familyName: "Bett", phone: "0711111111", contactDate: "2026-10-01" });
  });
});

describe("values", () => {
  it("parses dates day first, ISO, by month name and Excel serials", () => {
    expect(parseDate("03.10.2026")).toBe("2026-10-03");
    expect(parseDate("3/10/2026")).toBe("2026-10-03");
    expect(parseDate("2026-10-03")).toBe("2026-10-03");
    expect(parseDate("3 Oct 2026")).toBe("2026-10-03");
    expect(parseDate(46298)).toBe("2026-10-03");
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });

  it("normalises Kenyan mobile numbers", () => {
    expect(parsePhone("712345678")).toBe("0712345678");
    expect(parsePhone("+254712345678")).toBe("0712345678");
    expect(parsePhone("0712345678 / 0733")).toBe("0712345678");
    expect(parsePhone("12345")).toBeNull();
  });

  it("maps relations and names as mobile does", () => {
    expect(parseRelationship("Family member")).toBe("family");
    expect(parseRelationship("Healthcare worker")).toBe("hcw");
    expect(parseRelationship("Clinical officer")).toBe("hcw");
    expect(parseRelationship("Neighbour")).toBe("other");
    expect(splitName("Otieno")).toEqual({ givenNames: "Otieno", familyName: "Otieno" });
  });

  it("identifies a person by ID number, else name and phone", () => {
    expect(personKey({ givenNames: "Jane", familyName: "Otieno", phone: "+254712345678" })).toBe(
      personKey({ givenNames: "jane ", familyName: "OTIENO", phone: "0712345678" }),
    );
    expect(personKey({ givenNames: "A", familyName: "B", idNumber: "123" })).toBe("id:123");
  });
});

describe("Excel template", () => {
  it("maps every template column without manual matching", () => {
    const mapped = autoMapColumns([...TEMPLATE_HEADERS]);
    const fields = new Set(mapped.map((c) => c.field));
    for (const f of ["fullName", "contactDate", "phone", "sex", "age", "relationship", "county", "subCounty", "village", "comment"]) {
      expect(fields, f).toContain(f);
    }
    expect(mapped.filter((c) => c.field === "day").map((c) => c.day)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });

  it("reads back a filled-in template as an upload would", () => {
    const sheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]]);
    const row = new Array(TEMPLATE_HEADERS.length).fill("");
    const at = (h: string) => TEMPLATE_HEADERS.indexOf(h);
    row[at("Full Name")] = "Jane Achieng Otieno";
    row[at("Date of Exposure (dd.mm.yyyy)")] = "03.10.2026";
    row[at("Mobile Phone Number (+254)")] = "+254712345678";
    row[at("Sex (M/F)")] = "F";
    row[at("County")] = "Nairobi";
    row[at("Sub-county")] = "Embakasi East";
    row[at("Day 1")] = 1;
    row[at("Day 2")] = 2;
    XLSX.utils.sheet_add_aoa(sheet, [row], { origin: 1 });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Contacts");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(TEMPLATE_INSTRUCTIONS.map((r) => [...r])), "Instructions");

    const read = XLSX.read(XLSX.write(book, { type: "array", bookType: "xlsx" }), { type: "array" });
    expect(read.SheetNames).toEqual(["Contacts", "Instructions"]);
    const table = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets.Contacts, { header: 1, raw: true, defval: "" });
    const parsed = parseLineList(table);
    expect(parsed.rows).toHaveLength(1);
    const [only] = parsed.rows;
    expect(only.errors).toEqual([]);
    expect(only.contact).toMatchObject({
      contactDate: "2026-10-03",
      phone: "0712345678",
      sex: "female",
      countyName: "Nairobi",
      subCountyName: "Embakasi East",
      followUps: [{ day: 1, symptomatic: false }, { day: 2, symptomatic: true }],
    });
  });
});

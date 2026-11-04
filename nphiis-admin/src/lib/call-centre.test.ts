import { describe, expect, it } from "vitest";
import { cleanPayload, isVisible, todayInKenya, validateCallLog, visibleItems } from "./call-centre";

const YES_NO_UNKNOWN = [
  "alert-fever",
  "alert-headache",
  "alert-chills",
  "alert-weakness",
  "alert-joint-pain",
  "alert-fatigue",
  "alert-muscle-pain",
  "alert-diarrhoea",
  "alert-nose-bleeding",
  "alert-vomiting",
  "alert-unexplained-bleeding",
  "alert-known-case-contact",
];

/** Every required question of the mobile Alert Log form, answered. */
const base: Record<string, string> = {
  "alert-date": "2026-10-21",
  "alert-source-type": "hotline",
  "alert-reporter-name": "Peter Reporter",
  "alert-reporter-mobile": "0712345678",
  "486402457213": "Otieno",
  "873240407472": "Mary",
  "929966324957": "female",
  "alert-age-unit": "years",
  "492731638700": "34",
  "alert-home-country": "KE",
  "alert-mobile": "0798765432",
  "alert-vital-status": "alive",
  "alert-onset-date": "2026-10-18",
  "alert-true-onset-date": "2026-10-17",
  "alert-travelled": "no",
  "alert-facilities-visited": "None",
  "alert-sample-collected": "no",
  "alert-meets-case-definition": "no",
  "alert-specimen-date": "2026-10-21",
  "alert-specimen-type": "oral-swab",
  "alert-investigator-name": "Dr Investigator",
  ...Object.fromEntries(YES_NO_UNKNOWN.map((id) => [id, "no"])),
};
const locations = {
  "a4-county": { id: "c1", name: "Nairobi" },
  "a3-sub-county": { id: "s1", name: "Embakasi East" },
};

describe("alert log form", () => {
  it("is the mobile form: no reporting-site group, no call-centre questions", () => {
    const linkIds = visibleItems({}).map((i) => i.linkId);
    expect(linkIds).not.toContain("294367770999");
    expect(linkIds).not.toContain("alert-call-pathway");
    expect(linkIds).toContain("alert-source-type");
    expect(linkIds).toContain("alert-vital-status");
  });

  it("asks for the reporting facility only for facility reports", () => {
    expect(isVisible("alert-facility", { "alert-source-type": "hotline" })).toBe(false);
    expect(isVisible("alert-facility", { "alert-source-type": "health-facility" })).toBe(true);
  });

  it("accepts a complete alert", () => {
    expect(validateCallLog({ answers: base, locations })).toEqual({});
  });

  it("requires the county and sub-county, and the 'Other' text when Other is picked", () => {
    const errors = validateCallLog({
      answers: { ...base, "alert-source-type": "other" },
      locations: {},
    });
    expect(errors["a4-county"]).toBeDefined();
    expect(errors["a3-sub-county"]).toBeDefined();
    expect(errors["alert-source-type-other"]).toBeDefined();
  });

  it("rejects unknown options and non-numeric ages", () => {
    const errors = validateCallLog({
      answers: { ...base, "alert-vital-status": "nonsense", "492731638700": "abc" },
      locations,
    });
    expect(errors["alert-vital-status"]).toBe("Select one of the options");
    expect(errors["492731638700"]).toBe("Must be a whole number");
  });

  it("drops answers to questions that are no longer asked", () => {
    const cleaned = cleanPayload({
      answers: { ...base, "alert-source-type-other": "left over", "alert-travel-from": "Uganda" },
      locations,
    });
    expect(cleaned.answers["alert-source-type-other"]).toBeUndefined();
    expect(cleaned.answers["alert-travel-from"]).toBeUndefined();
    expect(cleaned.answers["a4-county"]).toBeUndefined();
    expect(cleaned.locations["a4-county"]).toEqual({ id: "c1", name: "Nairobi" });
  });
});

describe("date alerted", () => {
  it("is a date, in Kenya time", () => {
    expect(todayInKenya()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts today and rejects the future or a malformed date", () => {
    expect(validateCallLog({ answers: { ...base, "alert-date": todayInKenya() }, locations })["alert-date"]).toBeUndefined();
    expect(validateCallLog({ answers: { ...base, "alert-date": "2999-01-01" }, locations })["alert-date"]).toBe("Cannot be in the future");
    expect(validateCallLog({ answers: { ...base, "alert-date": "yesterday" }, locations })["alert-date"]).toBe("Enter a valid date");
  });

  it("is the only system-filled field", async () => {
    const { AUTO_FIELDS } = await import("./call-centre");
    expect(Array.from(AUTO_FIELDS)).toEqual(["alert-date"]);
  });
});

describe("kenya time", () => {
  it("reads a date and time as Kenya time whatever the server's timezone", async () => {
    const { parseKenyaDateTime } = await import("./call-centre");
    expect(parseKenyaDateTime("2026-10-21T10:15")).toBe(Date.parse("2026-10-21T07:15:00Z"));
    expect(Number.isNaN(parseKenyaDateTime("yesterday"))).toBe(true);
  });
});

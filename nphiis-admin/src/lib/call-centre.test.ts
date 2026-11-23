import { describe, expect, it } from "vitest";
import {
  AUTO_FIELDS,
  CALL_LOG_FORM,
  LEGACY_CALL_LOG_FORM,
  cleanPayload,
  formOf,
  isVisible,
  validateCallLog,
  visibleItems,
} from "./call-centre";

const base = {
  "alert-date": "2026-11-23",
  "alert-time": "10:15",
  "alert-received-by": "Jane Officer",
  "alert-source-type": "hotline",
  "alert-mode": "phone",
  "alert-reporter-name": "Peter Reporter",
  "alert-reporter-mobile": "0712345678",
  "alert-facility": "Mukuru Health Centre",
  "alert-description": "Three people in one family with fever and bleeding",
  "alert-first-noticed": "2026-11-20",
  "alert-suspected-cases": "3",
  "alert-confirmed": "no",
  "alert-risk-level": "high",
  "alert-actions": "notify-county;activate-rrt",
  "alert-officer-name": "Jane Officer",
  "alert-officer-signature": "Jane Officer",
  "alert-officer-date": "2026-11-23",
};
const locations = {
  "a4-county": { id: "c1", name: "Nairobi" },
  "a3-sub-county": { id: "s1", name: "Embakasi East" },
};

describe("alert triage form", () => {
  it("is the form new alerts use, in sections A to G", () => {
    expect(formOf({ answers: base, locations })).toBe(CALL_LOG_FORM);
    const linkIds = visibleItems(base).map((i) => i.linkId);
    expect(linkIds).toContain("alert-risk-level");
    expect(linkIds).toContain("alert-actions");
    expect(linkIds).not.toContain("alert-call-pathway");
  });

  it("accepts a complete alert", () => {
    expect(validateCallLog({ answers: base, locations })).toEqual({});
  });

  it("requires the county, sub-county, risk level and recommended action", () => {
    const answers: Record<string, string> = { ...base };
    delete answers["alert-risk-level"];
    delete answers["alert-actions"];
    const errors = validateCallLog({ answers, locations: {} });
    expect(Object.keys(errors).sort()).toEqual(["a3-sub-county", "a4-county", "alert-actions", "alert-risk-level"]);
  });

  it("asks for the 'Other' text and the confirming source only when they apply", () => {
    expect(isVisible("alert-source-type-other", base)).toBe(false);
    expect(isVisible("alert-confirmed-source", base)).toBe(false);
    const errors = validateCallLog({
      answers: { ...base, "alert-source-type": "other", "alert-confirmed": "yes" },
      locations,
    });
    expect(errors["alert-source-type-other"]).toBeDefined();
    expect(errors["alert-confirmed-source"]).toBeDefined();
  });

  it("rejects future dates, bad phone numbers and unknown options", () => {
    const errors = validateCallLog({
      answers: {
        ...base,
        "alert-first-noticed": "2999-01-01",
        "alert-reporter-mobile": "12",
        "alert-risk-level": "nonsense",
        "alert-time": "25:99",
      },
      locations,
    });
    expect(errors["alert-first-noticed"]).toBe("Cannot be a date in the future");
    expect(errors["alert-reporter-mobile"]).toMatch(/valid phone number/);
    expect(errors["alert-risk-level"]).toBe("Select one of the options");
    expect(errors["alert-time"]).toBe("Enter a valid time");
  });

  it("drops answers to questions that are no longer asked", () => {
    const cleaned = cleanPayload({
      answers: { ...base, "alert-source-type-other": "left over" },
      locations,
    });
    expect(cleaned.answers["alert-source-type-other"]).toBeUndefined();
    expect(cleaned.answers["a4-county"]).toBeUndefined();
    expect(cleaned.locations["a4-county"]).toEqual({ id: "c1", name: "Nairobi" });
  });

  it("fills who received the alert from the account", () => {
    expect(AUTO_FIELDS.has("alert-received-by")).toBe(true);
    expect(AUTO_FIELDS.has("alert-date")).toBe(false);
  });
});

describe("alerts logged on the earlier Alert Log form", () => {
  const legacy: Record<string, string> = {
    "alert-date": "2026-11-10",
    "alert-source-type": "hotline",
    "alert-facility": "Mukuru Health Centre",
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
    "alert-onset-date": "2026-11-08",
    "alert-true-onset-date": "2026-11-08",
    "alert-fever": "yes",
    "alert-headache": "no",
    "alert-chills": "no",
    "alert-weakness": "yes",
    "alert-joint-pain": "no",
    "alert-fatigue": "no",
    "alert-muscle-pain": "no",
    "alert-diarrhoea": "no",
    "alert-nose-bleeding": "no",
    "alert-vomiting": "yes",
    "alert-unexplained-bleeding": "no",
    "alert-known-case-contact": "no",
    "alert-travelled": "no",
    "alert-facilities-visited": "None",
    "alert-sample-collected": "no",
    "alert-meets-case-definition": "yes",
    "alert-investigator-name": "Jane Investigator",
  };

  it("are still read and checked with that form", () => {
    expect(formOf({ answers: legacy, locations })).toBe(LEGACY_CALL_LOG_FORM);
    expect(validateCallLog({ answers: legacy, locations })).toEqual({});
    expect(isVisible("alert-specimen-date", legacy)).toBe(false);
    expect(isVisible("alert-specimen-date", { ...legacy, "alert-sample-collected": "yes" })).toBe(true);
  });

  it("are not accepted as new alerts", () => {
    const errors = validateCallLog({ answers: legacy, locations }, CALL_LOG_FORM);
    expect(errors["alert-risk-level"]).toBeDefined();
  });
});

describe("call time", () => {
  it("is read as Kenya time whatever the server's timezone", async () => {
    const { parseKenyaDateTime } = await import("./call-centre");
    expect(parseKenyaDateTime("2026-10-21T10:15")).toBe(Date.parse("2026-10-21T07:15:00Z"));
    expect(parseKenyaDateTime("2026-10-21T10:15:00+03:00")).toBe(Date.parse("2026-10-21T07:15:00Z"));
    expect(Number.isNaN(parseKenyaDateTime("yesterday"))).toBe(true);
  });

  it("accepts an alert received today", async () => {
    const { todayInKenya } = await import("./call-centre");
    const errors = validateCallLog({ answers: { ...base, "alert-date": todayInKenya() }, locations });
    expect(errors["alert-date"]).toBeUndefined();
  });
});

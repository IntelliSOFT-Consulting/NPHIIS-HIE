import { describe, expect, it } from "vitest";
import { cleanPayload, isVisible, validateCallLog, visibleItems } from "./call-centre";

const base = {
  "alert-date": "2026-10-21T10:15",
  "alert-agent-id": "Jane Agent",
  "alert-reporter-name": "Peter Caller",
  "alert-reporter-mobile": "0712345678",
  "alert-source-type": "hotline",
  "alert-call-end": "10:20",
};
const locations = {
  "a4-county": { id: "c1", name: "Nairobi" },
  "a3-sub-county": { id: "s1", name: "Embakasi East" },
};

describe("call log form", () => {
  it("never shows the reporting-site or hidden questions", () => {
    const linkIds = visibleItems({}).map((i) => i.linkId);
    expect(linkIds).not.toContain("user_role");
    expect(linkIds).not.toContain("294367770999");
    expect(linkIds).not.toContain("alert-suspected");
    expect(linkIds).toContain("alert-call-pathway");
  });

  it("asks about the person and symptoms only on the assessment pathway", () => {
    expect(isVisible("alert-symptoms", { "alert-call-pathway": "general-advice" })).toBe(false);
    expect(isVisible("alert-symptoms", { "alert-call-pathway": "assessment" })).toBe(true);
    expect(isVisible("alert-action-status", { "alert-call-pathway": "assessment" })).toBe(true);
  });

  it("requires the questions the pathway asks", () => {
    const errors = validateCallLog({
      answers: { ...base, "alert-call-pathway": "assessment" },
      locations,
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["alert-action-status", "alert-classification", "alert-exposures", "alert-routed-action", "alert-symptoms"].sort(),
    );
  });

  it("accepts a complete general-advice call", () => {
    expect(validateCallLog({ answers: { ...base, "alert-call-pathway": "general-advice" }, locations })).toEqual({});
  });

  it("requires the county and sub-county, and the 'Other' text when Other is picked", () => {
    const errors = validateCallLog({
      answers: { ...base, "alert-call-pathway": "general-advice", "alert-source-type": "other" },
      locations: {},
    });
    expect(errors["a4-county"]).toBeDefined();
    expect(errors["a3-sub-county"]).toBeDefined();
    expect(errors["alert-source-type-other"]).toBeDefined();
  });

  it("rejects bad times and unknown options", () => {
    const errors = validateCallLog({
      answers: { ...base, "alert-call-pathway": "nonsense", "alert-call-end": "25:99" },
      locations,
    });
    expect(errors["alert-call-pathway"]).toBe("Select one of the options");
    expect(errors["alert-call-end"]).toBe("Enter a valid time");
  });

  it("drops answers to questions that are no longer asked", () => {
    const cleaned = cleanPayload({
      answers: {
        ...base,
        "alert-call-pathway": "general-advice",
        "alert-symptoms": "fever",
        "alert-source-type-other": "left over",
      },
      locations,
    });
    expect(cleaned.answers["alert-symptoms"]).toBeUndefined();
    expect(cleaned.answers["alert-source-type-other"]).toBeUndefined();
    expect(cleaned.answers["a4-county"]).toBeUndefined();
    expect(cleaned.locations["a4-county"]).toEqual({ id: "c1", name: "Nairobi" });
  });
});

describe("call time", () => {
  it("is read as Kenya time whatever the server's timezone", async () => {
    const { parseKenyaDateTime } = await import("./call-centre");
    expect(parseKenyaDateTime("2026-10-21T10:15")).toBe(Date.parse("2026-10-21T07:15:00Z"));
    expect(parseKenyaDateTime("2026-10-21T10:15:00+03:00")).toBe(Date.parse("2026-10-21T07:15:00Z"));
    expect(Number.isNaN(parseKenyaDateTime("yesterday"))).toBe(true);
  });

  it("accepts a call logged just now", async () => {
    const { nowInKenya } = await import("./call-centre");
    const errors = validateCallLog({
      answers: { ...base, "alert-date": nowInKenya(), "alert-call-pathway": "general-advice" },
      locations,
    });
    expect(errors["alert-date"]).toBeUndefined();
  });
});

describe("call end time", () => {
  it("is typed by the agent and required", () => {
    const answers: Record<string, string> = { ...base, "alert-call-pathway": "general-advice" };
    delete answers["alert-call-end"];
    expect(validateCallLog({ answers, locations })["alert-call-end"]).toBeDefined();
    expect(validateCallLog({ answers: { ...answers, "alert-call-end": "14:05" }, locations })["alert-call-end"]).toBeUndefined();
  });

  it("is not a system-filled field", async () => {
    const { AUTO_FIELDS } = await import("./call-centre");
    expect(AUTO_FIELDS.has("alert-call-end")).toBe(false);
  });
});

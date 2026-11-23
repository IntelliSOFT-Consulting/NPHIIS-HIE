import { describe, expect, it } from "vitest";
import {
  COUNT_FIELDS,
  buildQuestionnaireResponse,
  inputFromSummary,
  isOnTime,
  periodCovered,
  snapshotId,
  summaryFromResponse,
  todayInKenya,
  validateSnapshot,
  type SnapshotInput,
} from "./evd-snapshot";

// Distinct numbers per field, with follow-up and traveller figures that add up.
const counts: Record<string, string> = {
  ...Object.fromEntries(COUNT_FIELDS.map((f, i) => [f.id, String(i)])),
  "b-contacts-due": "10",
  "b-contacts-followed-up": "6",
  "b-contacts-lost": "4",
  "b-travellers-screened": "50",
  "b-travellers-referred": "2",
};

const valid = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  county: { id: "34", name: "KAJIADO" },
  subCounty: { id: "KAJIADO-EAST", name: "KAJIADO EAST" },
  reportingDate: "2026-11-24",
  focalPerson: "Jane Wanjiru",
  phone: "0712 345 678",
  email: "jane@example.org",
  counts,
  challenges: "No transport for specimens",
  certified: true,
  ...over,
});

const NOW = new Date("2026-11-24T05:00:00Z"); // 08:00 EAT

describe("dates", () => {
  it("uses Kenya time for today", () => {
    expect(todayInKenya(new Date("2026-11-23T22:30:00Z"))).toBe("2026-11-24");
  });
  it("covers the day before the reporting date", () => {
    expect(periodCovered("2026-03-01")).toBe("2026-02-28");
    expect(periodCovered("nope")).toBe("");
  });
  it("is on time up to 09:00 EAT on the reporting date", () => {
    expect(isOnTime("2026-11-24", "2026-11-24T06:00:00Z")).toBe(true); // 09:00 EAT sharp
    expect(isOnTime("2026-11-24", "2026-11-24T06:00:01Z")).toBe(false);
    expect(isOnTime("2026-11-24", "2026-11-23T20:00:00Z")).toBe(true); // the evening before
    expect(isOnTime("2026-11-24", undefined)).toBe(false);
  });
});

describe("validateSnapshot", () => {
  it("accepts a complete snapshot", () => {
    const { errors, warnings } = validateSnapshot(valid(), NOW);
    expect(errors).toEqual({});
    expect(warnings).toEqual([]);
  });

  it("requires every count, accepting 0", () => {
    const { errors } = validateSnapshot(valid({ counts: { ...counts, "a-alerts-received": "", "b-new-contacts": "0" } }), NOW);
    expect(Object.keys(errors)).toEqual(["a-alerts-received"]);
  });

  it("rejects negatives, decimals and text in counts", () => {
    for (const bad of ["-1", "2.5", "abc", "1e3"]) {
      expect(validateSnapshot(valid({ counts: { ...counts, "a-lab-positive": bad } }), NOW).errors["a-lab-positive"]).toBeTruthy();
    }
  });

  it("needs the certification, the area and the contact details", () => {
    const { errors } = validateSnapshot(
      valid({ certified: false, county: undefined, subCounty: undefined, focalPerson: " ", phone: "123", email: "x" }),
      NOW,
    );
    expect(Object.keys(errors).sort()).toEqual(["certification", "county", "email", "focal-person", "phone", "sub-county"].sort());
  });

  it("accepts Kenyan phone formats", () => {
    for (const p of ["0712345678", "+254712345678", "254112345678", "0712-345-678"]) {
      expect(validateSnapshot(valid({ phone: p }), NOW).errors.phone).toBeUndefined();
    }
  });

  it("does not allow a future reporting date", () => {
    expect(validateSnapshot(valid({ reportingDate: "2026-11-25" }), NOW).errors["reporting-date"]).toBeTruthy();
    expect(validateSnapshot(valid({ reportingDate: "2026-02-30" }), NOW).errors["reporting-date"]).toBeTruthy();
  });

  it("warns, without blocking, when follow-up does not add up", () => {
    const r = validateSnapshot(
      valid({ counts: { ...counts, "b-contacts-due": "5", "b-contacts-followed-up": "4", "b-contacts-lost": "3", "b-travellers-screened": "2", "b-travellers-referred": "3" } }),
      NOW,
    );
    expect(r.errors).toEqual({});
    expect(r.warnings).toHaveLength(2);
  });
});

describe("QuestionnaireResponse", () => {
  it("has one id per sub-county and day, safe for FHIR", () => {
    expect(snapshotId("KAJIADO-EAST", "2026-11-24")).toBe("evd-snapshot-KAJIADO-EAST-20261124");
    expect(snapshotId("ODD NAME/1", "2026-11-24")).toBe("evd-snapshot-ODD-NAME-1-20261124");
    expect(snapshotId("X".repeat(80), "2026-11-24").length).toBeLessThanOrEqual(64);
  });

  it("round-trips through the saved resource", () => {
    const r = buildQuestionnaireResponse(valid(), { now: NOW, practitionerId: "p1", submittedBy: "Jane (jw)" });
    expect(r.questionnaire).toBe("http://nphiis.health.go.ke/Questionnaire/evd-daily-snapshot");
    expect(r.author).toEqual({ reference: "Practitioner/p1", display: "Jane (jw)" });
    const tags = r.meta.tag.map((t: any) => `${t.system.split("/").pop()}=${t.code}`);
    expect(tags).toEqual(
      expect.arrayContaining([
        "evd-snapshot-county=34",
        "evd-snapshot-subcounty=KAJIADO-EAST",
        "evd-snapshot-date=2026-11-24",
        "evd-snapshot-managingLocation=Location/KAJIADO-EAST",
      ]),
    );
    const s = summaryFromResponse({ ...r, meta: { ...r.meta, lastUpdated: "2026-11-24T05:00:00Z" } });
    expect(s).toMatchObject({
      county: "KAJIADO",
      countyId: "34",
      subCounty: "KAJIADO EAST",
      subCountyId: "KAJIADO-EAST",
      reportingDate: "2026-11-24",
      focalPerson: "Jane Wanjiru",
      phone: "0712345678",
      challenges: "No transport for specimens",
      certified: true,
      onTime: true,
    });
    for (const f of COUNT_FIELDS) expect(s.counts[f.id]).toBe(Number(counts[f.id]));
    // Editing form starts uncertified.
    expect(inputFromSummary(s).certified).toBe(false);
    expect(inputFromSummary(s).counts["a-lab-positive"]).toBe(String(counts["a-lab-positive"]));
  });

  it("keeps the first submission time when edited, so on-time does not change", () => {
    const first = "2026-11-24T05:00:00.000Z";
    const edited = buildQuestionnaireResponse(valid(), { now: new Date("2026-11-24T12:00:00Z"), firstAuthored: first });
    expect(edited.authored).toBe(first);
    expect(summaryFromResponse(edited).onTime).toBe(true);
  });

  it("marks a late submission", () => {
    const r = buildQuestionnaireResponse(valid(), { now: new Date("2026-11-24T08:00:00Z") }); // 11:00 EAT
    expect(summaryFromResponse(r).onTime).toBe(false);
  });

  it("leaves out an empty Challenges section", () => {
    const r = buildQuestionnaireResponse(valid({ challenges: "  " }), { now: NOW });
    expect(r.item.map((i: any) => i.linkId)).not.toContain("challenges-section");
  });
});

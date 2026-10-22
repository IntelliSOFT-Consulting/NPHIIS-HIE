import { describe, expect, it } from "vitest";
import {
  contactFollowUp,
  kenyaToday,
  monitoringToStatus,
  normalizeCaseType,
  type ContactRecord,
} from "./vhf-contact-status";

let seq = 0;
const obs = (code: string, value: string, issued = "2026-10-01T08:00:00Z") => ({
  resourceType: "Observation",
  id: `o${++seq}`,
  code: { coding: [{ system: "http://snomed.info/sct", code }], text: value },
  issued,
  valueString: value,
});

const followUp = (day: number, date: string, symptomatic = false) => ({
  encounter: {
    resourceType: "Encounter",
    id: `f${day}-${++seq}`,
    reasonCode: [{ coding: [{ code: "VHF Contact Follow Up" }] }],
    identifier: [{ system: "system-creation", value: `${date} 09:00:00` }],
  },
  observations: [
    obs("vhf-follow-up-day", String(day)),
    obs("vhf-follow-up-date", date),
    obs("vhf-follow-up-symptomatic", symptomatic ? "Yes" : "No"),
  ],
});

const monitoring = (status: string, created: string) => ({
  encounter: {
    resourceType: "Encounter",
    id: `m${++seq}`,
    reasonCode: [{ coding: [{ code: "VHF Contact Monitoring" }] }],
    identifier: [{ system: "system-creation", value: created }],
  },
  observations: [obs("vhf-monitoring-status", status)],
});

const contact = (children: ContactRecord["children"] = [], extra: any[] = []): ContactRecord => ({
  encounterId: "e1",
  registeredDate: "2026-10-02",
  observations: [obs("vhf-case-type", "Contact"), obs("vhf-contact-date", "2026-10-01"), ...extra],
  children,
});

describe("contactFollowUp", () => {
  it("counts days from the date of contact and marks today due", () => {
    const s = contactFollowUp(contact([followUp(1, "2026-10-02"), followUp(2, "2026-10-03")]), "2026-10-04");
    expect(s.dayZero).toBe("2026-10-01");
    expect(s.daysSinceExposure).toBe(3);
    expect(s.lastDay).toBe("2026-10-22");
    expect(s.status).toBe("active");
    expect(s.dueToday).toBe(true);
    expect(s.missedDays).toEqual([]);
    expect(s.days.slice(0, 4).map((d) => d.state)).toEqual(["seen", "seen", "due", "upcoming"]);
  });

  it("takes the day from the follow-up date, not the entered day, as mobile does", () => {
    const record = contact([followUp(9, "2026-10-03")]);
    expect(contactFollowUp(record, "2026-10-04").days[1].state).toBe("seen");
  });

  it("lists missed days and calls a contact lost after 3 missed in a row", () => {
    const some = contactFollowUp(contact([followUp(1, "2026-10-02")]), "2026-10-04");
    expect(some.missedDays).toEqual([2]);
    expect(some.status).toBe("active");

    const lost = contactFollowUp(contact([followUp(1, "2026-10-02")]), "2026-10-06");
    expect(lost.missedDays).toEqual([2, 3, 4]);
    expect(lost.status).toBe("lost");
    expect(lost.dueToday).toBe(true);
  });

  it("flags a symptomatic follow up", () => {
    const s = contactFollowUp(contact([followUp(1, "2026-10-02"), followUp(2, "2026-10-03", true)]), "2026-10-03");
    expect(s.status).toBe("flagged");
    expect(s.firstSymptomaticDay).toBe(2);
    expect(s.dueToday).toBe(false);
    expect(s.days[1].state).toBe("symptomatic");
  });

  it("completes after day 21, or on day 21 once it is recorded", () => {
    const all = Array.from({ length: 21 }, (_, i) => followUp(i + 1, `2026-10-${String(i + 2).padStart(2, "0")}`));
    expect(contactFollowUp(contact(all), "2026-10-22").status).toBe("completed");
    expect(contactFollowUp(contact(all.slice(0, 20)), "2026-10-22").status).toBe("active");
    expect(contactFollowUp(contact(all.slice(0, 20)), "2026-10-23").status).toBe("completed");
  });

  it("uses the latest date of contact when the contact was exposed again", () => {
    const s = contactFollowUp(contact([], [obs("vhf-contact-date", "2026-10-05", "2026-10-06T08:00:00Z")]), "2026-10-06");
    expect(s.dayZero).toBe("2026-10-05");
    expect(s.daysSinceExposure).toBe(1);
  });

  describe("moved to a newer case", () => {
    const link = (epid: string, issued: string) => obs("vhf-source-case-epid", epid, issued);
    const brian = link("KEN-BRIAN-001", "2026-10-01T08:00:00Z");

    it("restarts the 21 days from the date of contact given with the newer link", () => {
      const record = contact(
        [followUp(1, "2026-10-02"), followUp(2, "2026-10-03", true), monitoring("Completed follow up (released)", "2026-10-04 10:00:00")],
        [brian, link("KEN-YAO-002", "2026-10-10T08:00:00Z"), obs("vhf-contact-date", "2026-10-09", "2026-10-10T08:00:00Z")],
      );
      const s = contactFollowUp(record, "2026-10-11");
      expect(s.restartedOn).toBe("2026-10-10");
      expect(s.dayZero).toBe("2026-10-09");
      expect(s.lastDay).toBe("2026-10-30");
      expect(s.daysSinceExposure).toBe(2);
      // Visits and the release recorded under the earlier case no longer count.
      expect(s.status).toBe("active");
      expect(s.firstSymptomaticDay).toBeNull();
      expect(s.days[0].state).toBe("missed");
      expect(s.dueToday).toBe(true);
    });

    it("starts from the day of the newer link when no date of contact came with it", () => {
      const record = contact([followUp(1, "2026-10-02")], [brian, link("KEN-YAO-002", "2026-10-09T22:30:00Z")]);
      const s = contactFollowUp(record, "2026-10-12");
      expect(s.restartedOn).toBe("2026-10-10");
      expect(s.dayZero).toBe("2026-10-10");
      expect(s.daysSinceExposure).toBe(2);
    });

    it("counts visits recorded after the move", () => {
      const record = contact(
        [followUp(1, "2026-10-02"), followUp(1, "2026-10-11")],
        [brian, link("KEN-YAO-002", "2026-10-10T08:00:00Z")],
      );
      const s = contactFollowUp(record, "2026-10-12");
      expect(s.days.slice(0, 2).map((d) => d.state)).toEqual(["seen", "due"]);
    });

    it("does not restart when the same case is linked again", () => {
      const s = contactFollowUp(contact([], [brian, link("KEN-BRIAN-001  Brian (Confirmed)", "2026-10-05T08:00:00Z")]), "2026-10-06");
      expect(s.restartedOn).toBeNull();
      expect(s.dayZero).toBe("2026-10-01");
    });
  });

  it("falls back to the registration date when the date of contact is missing", () => {
    const record: ContactRecord = { ...contact(), observations: [obs("vhf-case-type", "Contact")] };
    const s = contactFollowUp(record, "2026-10-03");
    expect(s.exposureDate).toBeNull();
    expect(s.dayZero).toBe("2026-10-02");
  });

  it("reports a converted contact from the latest type of case", () => {
    const s = contactFollowUp(contact([], [obs("vhf-case-type", "Suspected", "2026-10-03T08:00:00Z")]), "2026-10-04");
    expect(s.caseType).toBe("suspected");
    expect(s.status).toBe("converted");
    expect(s.dueToday).toBe(false);
  });

  it("closes follow up from the latest monitoring status", () => {
    const record = contact([
      monitoring("Under follow up", "2026-10-02 10:00:00"),
      monitoring("Lost to follow up", "2026-10-03 10:00:00"),
    ]);
    const s = contactFollowUp(record, "2026-10-04");
    expect(s.status).toBe("lost");
    expect(s.monitoringStatus).toBe("Lost to follow up");
  });
});

describe("helpers", () => {
  it("normalises type of case and monitoring status", () => {
    expect(normalizeCaseType(" Contact ")).toBe("contact");
    expect(normalizeCaseType("")).toBeNull();
    expect(monitoringToStatus("Completed follow up (released)")).toBe("completed");
    expect(monitoringToStatus("Became a suspected case")).toBe("converted");
    expect(monitoringToStatus("Died")).toBe("died");
    expect(monitoringToStatus("Under follow up")).toBeNull();
  });

  it("gives today in Kenya time", () => {
    expect(kenyaToday(new Date("2026-10-17T22:30:00Z"))).toBe("2026-10-18");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({ prisma: {} }));
vi.mock("./utils", () => ({ FhirApi: vi.fn() }));
vi.mock("./fcm", () => ({ fcmService: {} }));
vi.mock("./keycloak", () => ({ getKeycloakUserById: vi.fn(), isNotificationsEnabledForKeycloakUser: vi.fn() }));
vi.mock("./epid-assignment", () => ({ promoteConvertedVhfContact: vi.fn(), ensureVhfContactId: vi.fn() }));

import { reminderAreas, remindersFor } from "./vhf-contact-reminders";

const contact = (over: any = {}) =>
  ({
    encounterId: "e1",
    patientId: "p1",
    contactId: "KEN-NAI-KIB-2026-VHF-001-C004",
    epid: null,
    subCounty: "KIBRA",
    status: "active",
    daysSinceExposure: 5,
    dueToday: true,
    missedDays: [],
    ...over,
  }) as any;

describe("remindersFor", () => {
  it("reminds the sub-county officer of a contact due today", () => {
    const [r, ...rest] = remindersFor(contact(), "KEN-NAI-KIB-2026-VHF-001");
    expect(rest).toHaveLength(0);
    expect(r).toMatchObject({ type: "VHF_CONTACT_FOLLOW_UP", followUpDay: 5, area: "sub-county", subCounty: "KIBRA" });
    expect(r.body).toBe("KEN-NAI-KIB-2026-VHF-001-C004, contact of KEN-NAI-KIB-2026-VHF-001, is due for day 5 follow up today.");
  });

  it("escalates yesterday's missed day to the county officer", () => {
    const reminders = remindersFor(contact({ missedDays: [2, 4] }), "X");
    expect(reminders.map((r) => [r.type, r.followUpDay, r.area])).toEqual([
      ["VHF_CONTACT_FOLLOW_UP", 5, "sub-county"],
      ["VHF_CONTACT_MISSED", 4, "county"],
    ]);
  });

  it("sends nothing for a closed or unplaced contact", () => {
    expect(remindersFor(contact({ status: "completed", dueToday: false, missedDays: [4] }), "X")).toEqual([]);
    expect(remindersFor(contact({ subCounty: null }), "X")).toEqual([]);
  });
});

describe("reminderAreas", () => {
  const typed = (id: string, code: string, partOf?: string) => ({
    id,
    type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-RoleCode", code }] }],
    ...(partOf ? { partOf: { reference: `Location/${partOf}` } } : {}),
  });

  it("uses the sub-county and its county", () => {
    expect(reminderAreas(typed("4710", "SUB-COUNTY", "47"), typed("47", "COUNTY", "0"))).toEqual({ subCountyId: "4710", countyId: "47" });
  });

  it("treats a county named as the sub-county as that county, never the country", () => {
    expect(reminderAreas(typed("47", "COUNTY", "0"), null)).toEqual({ countyId: "47" });
    expect(reminderAreas(typed("0", "COUNTY"), null)).toEqual({ countyId: undefined });
  });

  it("names no area for a ward or a facility", () => {
    expect(reminderAreas(typed("NAIROBI-CENTRAL", "WARD", "STAREHE"), null)).toEqual({});
    expect(reminderAreas(null, null)).toEqual({});
  });
});

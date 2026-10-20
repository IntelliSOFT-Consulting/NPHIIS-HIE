import { describe, expect, it, vi } from "vitest";

vi.mock("./utils", () => ({ FhirApi: vi.fn() }));

import {
  buildContactList,
  CONTACT_STATUS_SYSTEM,
  contactListId,
  epidFromAnswer,
  liveEntryIds,
} from "./vhf-contact-list";

const index = {
  resourceType: "Encounter",
  id: "e0",
  subject: { reference: "Patient/p0" },
  reasonCode: [{ coding: [{ code: "VHF Case Information" }] }],
  identifier: [
    { use: "official", system: "http://hie.org/identifiers/EPID", value: "KEN-NAI-KIB-2026-VHF-001" },
    { use: "official", system: "http://hie.org/identifiers/CASE_ID", value: "KEN-2026-001" },
  ],
};
const NOW = "2026-10-17T10:00:00.000Z";
const flag = (e: any) => e.flag.coding[0].code;

describe("buildContactList", () => {
  it("is found by the case's EPID and Case ID and lists each contact with its status", () => {
    const list = buildContactList(index, [
      { encounterId: "e1", status: "active" },
      { encounterId: "e2", status: "flagged" },
    ], null, NOW);
    expect(list.id).toBe(contactListId("e0"));
    expect(list.identifier.map((i: any) => i.value)).toEqual(["KEN-NAI-KIB-2026-VHF-001", "KEN-2026-001"]);
    expect(list.subject).toEqual({ reference: "Patient/p0" });
    expect(list.encounter).toEqual({ reference: "Encounter/e0" });
    expect(list.title).toBe("Contacts of KEN-NAI-KIB-2026-VHF-001");
    expect(list.status).toBe("current");
    expect(list.entry.map((e: any) => [e.item.reference, flag(e), e.date])).toEqual([
      ["Encounter/e1", "active", "2026-10-17"],
      ["Encounter/e2", "flagged", "2026-10-17"],
    ]);
    expect(list.entry[0].flag.coding[0].system).toBe(CONTACT_STATUS_SYSTEM);
  });

  it("keeps the date a contact was added and keeps unlinked or removed contacts flagged removed", () => {
    const existing = buildContactList(index, [
      { encounterId: "e1", status: "active" },
      { encounterId: "e2", status: "active" },
    ], null, "2026-10-12T08:00:00Z");
    const list = buildContactList(index, [
      { encounterId: "e1", status: "active" },
      { encounterId: "e3", status: "active" },
    ], existing, NOW, new Set(["e3"]));
    const byRef = Object.fromEntries(list.entry.map((e: any) => [e.item.reference, e]));
    expect(byRef["Encounter/e1"].date).toBe("2026-10-12");
    expect(flag(byRef["Encounter/e1"])).toBe("active");
    expect(flag(byRef["Encounter/e2"])).toBe("removed");
    expect(flag(byRef["Encounter/e3"])).toBe("removed");
    expect(list.entry.some((e: any) => "deleted" in e)).toBe(false);
    expect([...liveEntryIds(list)]).toEqual(["e1"]);

    // A contact taken off stays off when the list is rebuilt.
    const again = buildContactList(index, [{ encounterId: "e3", status: "active" }], list, NOW);
    expect(flag(again.entry.find((e: any) => e.item.reference === "Encounter/e3"))).toBe("removed");
  });

  it("is retired once every contact's follow up has ended", () => {
    const done = buildContactList(index, [
      { encounterId: "e1", status: "completed" },
      { encounterId: "e2", status: "converted" },
    ], null, NOW);
    expect(done.status).toBe("retired");
    const lost = buildContactList(index, [{ encounterId: "e1", status: "lost" }], null, NOW);
    expect(lost.status).toBe("current");
  });
});

describe("epidFromAnswer", () => {
  it("reads the EPID from a picked or typed answer", () => {
    expect(epidFromAnswer("KEN-NAI-KIB-2026-VHF-001  Jane Doe (Confirmed)")).toBe("KEN-NAI-KIB-2026-VHF-001");
    expect(epidFromAnswer(" KEN-2026-001 ")).toBe("KEN-2026-001");
    expect(epidFromAnswer("")).toBeNull();
  });
});

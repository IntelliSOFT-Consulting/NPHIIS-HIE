import { describe, expect, it } from "vitest";
import {
  CONTACT_ID_SYSTEM_URI,
  contactIdIdentifier,
  formatVhfContactId,
  getContactId,
  isVhfContactId,
  vhfContactIdCounterKey,
} from "./vhf-contact-id";
import { EPID_SYSTEM_URI } from "./epid-utils";

const EPID = "KEN-NAI-KIB-2026-VHF-001";

describe("formatVhfContactId", () => {
  it("is the case's EPID, -C and a number padded to three digits that grows past 999", () => {
    expect(formatVhfContactId(EPID, 1)).toBe("KEN-NAI-KIB-2026-VHF-001-C001");
    expect(formatVhfContactId(` ${EPID} `, 42)).toBe("KEN-NAI-KIB-2026-VHF-001-C042");
    expect(formatVhfContactId(EPID, 1000)).toBe("KEN-NAI-KIB-2026-VHF-001-C1000");
  });
});

describe("isVhfContactId", () => {
  it("accepts Contact IDs only", () => {
    expect(isVhfContactId("KEN-NAI-KIB-2026-VHF-001-C001")).toBe(true);
    expect(isVhfContactId(EPID)).toBe(false);
    expect(isVhfContactId("KEN-2026-001")).toBe(false);
    expect(isVhfContactId("KEN NAI-C001")).toBe(false);
    expect(isVhfContactId(undefined)).toBe(false);
  });
});

describe("getContactId", () => {
  it("reads the Contact ID and ignores the EPID", () => {
    const encounter = {
      identifier: [{ system: EPID_SYSTEM_URI, value: "KEN-NAI-KIB-2026-VHF-002" }, contactIdIdentifier("KEN-NAI-KIB-2026-VHF-001-C003")],
    };
    expect(getContactId(encounter)).toBe("KEN-NAI-KIB-2026-VHF-001-C003");
    expect(getContactId({ identifier: [{ system: CONTACT_ID_SYSTEM_URI, value: "junk" }] })).toBeUndefined();
    expect(getContactId({})).toBeUndefined();
  });
});

describe("vhfContactIdCounterKey", () => {
  it("numbers each case's contacts on their own counter, apart from EPIDs and Case IDs", () => {
    expect(vhfContactIdCounterKey(EPID)).toEqual({ country: "KEN", county: "CONTACT", subCounty: EPID, condition: "VHF" });
  });
});

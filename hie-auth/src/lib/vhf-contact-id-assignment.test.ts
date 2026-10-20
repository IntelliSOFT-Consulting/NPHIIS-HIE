import { beforeEach, describe, expect, it, vi } from "vitest";

const fhir = vi.hoisted(() => ({ FhirApi: vi.fn() }));
const tracker = vi.hoisted(() => ({ generateCaseId: vi.fn() }));
vi.mock("./utils", () => ({ FhirApi: fhir.FhirApi, FhirIdentifier: vi.fn() }));
vi.mock("./caseIdTracker", () => tracker);
vi.mock("./fhir", () => ({ processFollowUpObservations: vi.fn() }));
vi.mock("./notification", () => ({ notifyCaseSubmissionIfEnabled: vi.fn() }));
vi.mock("./nphl-lab-sync", () => ({ queueCaseSync: vi.fn() }));
vi.mock("./epid-location-segment", () => ({ buildEpidFormattedId: vi.fn(), resolveLocationNamesForEncounter: vi.fn() }));
vi.mock("./county-segment-registry", () => ({ resolveCountyLocationSegment: vi.fn() }));

import { ensureVhfContactId } from "./epid-assignment";
import { CONTACT_ID_SYSTEM_URI } from "./vhf-contact-id";

const EPID = "http://hie.org/identifiers/EPID";
const VHF = [{ coding: [{ code: "VHF Case Information" }] }];

/** A tiny HAPI: GET by path from [store], PUT saves the body and records it. */
function hapi(store: Record<string, any>) {
  const puts: Array<{ url: string; body: any }> = [];
  fhir.FhirApi.mockImplementation(async ({ url, method, data }: any) => {
    if (method === "PUT") {
      const body = JSON.parse(data);
      puts.push({ url, body });
      store[url] = body;
      return { status: "success", data: body };
    }
    const path = url.split("?")[0];
    if (url.startsWith("/Observation?")) return { status: "success", data: { entry: (store.observations ?? []).map((resource: any) => ({ resource })) } };
    if (url.includes("/_history")) return { status: "success", data: { entry: [] } };
    if (url.startsWith("/Encounter?") || url.startsWith("/Patient?")) {
      const value = decodeURIComponent(url).split("|")[1]?.split("&")[0];
      const hits = Object.values(store).filter((r: any) => r?.resourceType === url.slice(1, url.indexOf("?")) && r.identifier?.some((i: any) => i.value === value));
      return { status: "success", data: { entry: hits.map((resource) => ({ resource })) } };
    }
    return store[path] ? { status: "success", data: store[path] } : { status: "error", data: {} };
  });
  return puts;
}

const caseEncounter = (epid?: string) => ({
  resourceType: "Encounter",
  id: "case1",
  subject: { reference: "Patient/cp1" },
  reasonCode: VHF,
  identifier: epid ? [{ system: EPID, value: epid }] : [],
});
const contactEncounter = (identifier: any[] = []) => ({ resourceType: "Encounter", id: "c1", subject: { reference: "Patient/p1" }, reasonCode: VHF, identifier });
const link = (valueString: string, issued: string) => ({ resourceType: "Observation", id: `o-${issued}`, valueString, issued, encounter: { reference: "Encounter/c1" } });

beforeEach(() => {
  fhir.FhirApi.mockReset();
  tracker.generateCaseId.mockReset();
});

describe("ensureVhfContactId", () => {
  it("prefixes the next number with the first linked case's EPID, on the Encounter and the Patient", async () => {
    tracker.generateCaseId.mockResolvedValue(7);
    const puts = hapi({
      "/Encounter/c1": contactEncounter(),
      "/Patient/p1": { resourceType: "Patient", id: "p1" },
      "/Encounter/case1": caseEncounter("KEN-NAI-KIB-2026-VHF-001"),
      observations: [link("KEN-NAI-KIB-2026-VHF-001  Jane Doe (Confirmed)", "2026-10-10T08:00:00Z")],
    });

    const r = await ensureVhfContactId("c1");

    expect(r).toMatchObject({ kind: "assigned", contactId: "KEN-NAI-KIB-2026-VHF-001-C007" });
    expect(tracker.generateCaseId).toHaveBeenCalledWith("KEN", "CONTACT", "KEN-NAI-KIB-2026-VHF-001", "VHF");
    expect(puts.map((p) => p.url)).toEqual(["/Encounter/c1", "/Patient/p1"]);
    for (const p of puts) {
      expect(p.body.identifier).toContainEqual(expect.objectContaining({ system: CONTACT_ID_SYSTEM_URI, value: "KEN-NAI-KIB-2026-VHF-001-C007" }));
      expect(p.body.identifier.some((i: any) => i.system === EPID)).toBe(false);
    }
  });

  it("keeps an assigned Contact ID and copies it back after a re-sync dropped it", async () => {
    const id = { system: CONTACT_ID_SYSTEM_URI, value: "KEN-NAI-KIB-2026-VHF-001-C002" };
    const puts = hapi({
      "/Encounter/c1": contactEncounter(),
      "/Patient/p1": { resourceType: "Patient", id: "p1", identifier: [id] },
    });

    const r = await ensureVhfContactId("c1");

    expect(r).toMatchObject({ kind: "present", contactId: "KEN-NAI-KIB-2026-VHF-001-C002" });
    expect(tracker.generateCaseId).not.toHaveBeenCalled();
    expect(puts.map((p) => p.url)).toEqual(["/Encounter/c1"]);
  });

  it("waits while the case has no EPID", async () => {
    const puts = hapi({
      "/Encounter/c1": contactEncounter(),
      "/Patient/p1": { resourceType: "Patient", id: "p1" },
      "/Encounter/case1": caseEncounter(),
      observations: [{ ...link("anything", "2026-10-10T08:00:00Z"), focus: [{ reference: "Encounter/case1" }] }],
    });

    const r = await ensureVhfContactId("c1");

    expect(r).toEqual({ kind: "pending", reason: "case Encounter/case1 has no EPID yet" });
    expect(puts).toEqual([]);
  });

  it("is pending when no answer names a known case", async () => {
    hapi({
      "/Encounter/c1": contactEncounter(),
      "/Patient/p1": { resourceType: "Patient", id: "p1" },
      observations: [link("KEN-XXX-404", "2026-10-10T08:00:00Z")],
    });
    expect(await ensureVhfContactId("c1")).toMatchObject({ kind: "pending" });
  });
});

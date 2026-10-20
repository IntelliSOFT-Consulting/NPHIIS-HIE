import { beforeEach, describe, expect, it, vi } from "vitest";

const fhir = vi.hoisted(() => ({ handler: (_p: any): any => ({ status: "success", data: {} }), calls: [] as any[] }));

vi.mock("./utils", () => ({
  FhirApi: vi.fn(async (params: any) => {
    fhir.calls.push(params);
    return fhir.handler(params);
  }),
  FhirIdentifier: (system: string, code: string, display: string, value: string, official?: boolean) => ({
    ...(official ? { use: "official" } : {}),
    system,
    type: { coding: [{ system, code, display }] },
    value,
  }),
}));
vi.mock("./fhir", () => ({ processFollowUpObservations: vi.fn() }));
vi.mock("./caseIdTracker", () => ({ generateCaseId: vi.fn(async () => 7) }));
vi.mock("./notification", () => ({ notifyCaseSubmissionIfEnabled: vi.fn(async () => ({})) }));
vi.mock("./nphl-lab-sync", () => ({ queueCaseSync: vi.fn() }));
vi.mock("./epid-location-segment", () => ({
  buildEpidFormattedId: vi.fn(() => "KEN-NAI-KIB-2026-VHF-020"),
  resolveLocationNamesForEncounter: vi.fn(async () => ({ countyName: "NAIROBI", subCountyName: "KIBRA" })),
}));
vi.mock("./county-segment-registry", () => ({ resolveCountyLocationSegment: vi.fn() }));

import { generateCaseId } from "./caseIdTracker";
import { queueCaseSync } from "./nphl-lab-sync";
import { notifyCaseSubmissionIfEnabled } from "./notification";
import { assignEpidForEncounter, promoteConvertedVhfContact } from "./epid-assignment";
import { isVhfContactEncounter } from "./vhf-contact";
import { CASE_ID_SYSTEM_URI } from "./vhf-case-id";
import { CONTACT_ID_SYSTEM_URI, getContactId } from "./vhf-contact-id";
import { getEpidValueFromEncounter } from "./epid-utils";

const EPID = { system: "http://hie.org/identifiers/EPID", value: "KEN-NAI-KIB-2026-VHF-014" };

const encounter = (extra: any = {}) => ({
  resourceType: "Encounter",
  id: "e1",
  subject: { reference: "Patient/p1" },
  reasonCode: [{ coding: [{ code: "VHF Case Information" }] }],
  period: { start: "2026-10-12T09:00:00+03:00" },
  identifier: [EPID],
  ...extra,
});
const patient = { resourceType: "Patient", id: "p1", meta: { versionId: "1" }, identifier: [] as any[] };

function caseType(value: string | null) {
  return value == null
    ? []
    : [{ resource: { resourceType: "Observation", code: { coding: [{ code: "vhf-case-type" }] }, valueString: value } }];
}

const indexCase = {
  resourceType: "Encounter",
  id: "case1",
  subject: { reference: "Patient/cp1" },
  reasonCode: [{ coding: [{ code: "VHF Case Information" }] }],
  identifier: [{ system: "http://hie.org/identifiers/EPID", value: "KEN-NAI-KIB-2026-VHF-001" }],
};
const linkToCase = {
  resourceType: "Observation",
  code: { coding: [{ code: "vhf-source-case-epid" }] },
  valueString: "KEN-NAI-KIB-2026-VHF-001  Jane Doe (Confirmed)",
  focus: [{ reference: "Encounter/case1" }],
};

/** Serves the records; a PUT of the Encounter or Patient is read back by later GETs. */
function serve(type: string | null, enc: any = encounter(), pat: any = patient) {
  const store: Record<string, any> = { "/Encounter/e1": enc, "/Patient/p1": pat, "/Encounter/case1": indexCase };
  fhir.handler = ({ url, method, data }: any) => {
    if (method === "PUT") {
      store[url] = JSON.parse(data);
      return { status: "success", data: store[url] };
    }
    if (url.startsWith("/Observation?encounter=Encounter/e1&code=vhf-case-type")) {
      return { status: "success", data: { entry: caseType(type) } };
    }
    if (url.startsWith("/Observation?encounter=Encounter/e1&code=vhf-source-case-epid")) {
      return { status: "success", data: { entry: [{ resource: linkToCase }] } };
    }
    if (url.startsWith("/Encounter/e1/_history")) return { status: "success", data: { entry: [] } };
    if (store[url]) return { status: "success", data: store[url] };
    return { status: "success", data: {} };
  };
  return store;
}

beforeEach(() => {
  fhir.calls = [];
  vi.clearAllMocks();
});

describe("isVhfContactEncounter", () => {
  it("is true only for a VHF record whose type of case is Contact", async () => {
    serve("Contact");
    expect(await isVhfContactEncounter(encounter())).toBe(true);
    serve("Suspected");
    expect(await isVhfContactEncounter(encounter())).toBe(false);
    serve(null);
    expect(await isVhfContactEncounter(encounter())).toBe(false);
  });

  it("does not look up other diseases", async () => {
    serve("Contact");
    const measles = encounter({ reasonCode: [{ coding: [{ code: "Measles Case Information" }] }] });
    expect(await isVhfContactEncounter(measles)).toBe(false);
    expect(fhir.calls).toHaveLength(0);
  });
});

describe("assignEpidForEncounter for VHF contacts", () => {
  it("gives a contact a Contact ID from its case's EPID, and no EPID, Case ID, NPHL sync or alert", async () => {
    const store = serve("Contact", encounter({ identifier: [] }));
    const result = await assignEpidForEncounter(encounter({ identifier: [] }), { notify: true });
    expect(result.kind).toBe("success");
    expect(generateCaseId).toHaveBeenCalledWith("KEN", "CONTACT", "KEN-NAI-KIB-2026-VHF-001", "VHF");
    expect(getContactId(store["/Encounter/e1"])).toBe("KEN-NAI-KIB-2026-VHF-001-C007");
    expect(getContactId(store["/Patient/p1"])).toBe("KEN-NAI-KIB-2026-VHF-001-C007");
    expect(getEpidValueFromEncounter(store["/Encounter/e1"])).toBeUndefined();
    expect(queueCaseSync).not.toHaveBeenCalled();
    expect(notifyCaseSubmissionIfEnabled).not.toHaveBeenCalled();
  });

  it("still gives a case its Case ID and NPHL sync", async () => {
    serve("Suspected");
    await assignEpidForEncounter(encounter(), { notify: true });
    expect(generateCaseId).toHaveBeenCalledTimes(1);
    expect(queueCaseSync).toHaveBeenCalledWith("e1");
  });
});

describe("promoteConvertedVhfContact", () => {
  it("assigns the Case ID, syncs and alerts once the contact is converted", async () => {
    serve("Suspected");
    const result = await promoteConvertedVhfContact("e1");
    expect(result.kind).toBe("promoted");
    expect(generateCaseId).toHaveBeenCalledTimes(1);
    expect(queueCaseSync).toHaveBeenCalledWith("e1");
    expect(notifyCaseSubmissionIfEnabled).toHaveBeenCalledTimes(1);
  });

  it("gives a converted contact its own EPID and Case ID, and keeps its Contact ID", async () => {
    const contactId = { system: CONTACT_ID_SYSTEM_URI, value: "KEN-NAI-KIB-2026-VHF-001-C007" };
    const store = serve("Suspected", encounter({ identifier: [contactId] }), { ...patient, identifier: [contactId] });
    const result = await promoteConvertedVhfContact("e1");
    expect(result).toEqual({ kind: "promoted", caseId: "KEN-2026-007" });
    const saved = store["/Encounter/e1"];
    expect(getEpidValueFromEncounter(saved)).toBe("KEN-NAI-KIB-2026-VHF-020");
    expect(getContactId(saved)).toBe("KEN-NAI-KIB-2026-VHF-001-C007");
    expect(queueCaseSync).toHaveBeenCalledWith("e1");
    expect(notifyCaseSubmissionIfEnabled).toHaveBeenCalledTimes(1);
  });

  it("skips a record that is still a contact or already has a Case ID", async () => {
    serve("Contact");
    expect((await promoteConvertedVhfContact("e1")).kind).toBe("skipped");
    serve("Suspected", encounter({ identifier: [EPID, { system: CASE_ID_SYSTEM_URI, value: "KEN-2026-007" }] }));
    expect((await promoteConvertedVhfContact("e1")).kind).toBe("skipped");
    expect(generateCaseId).not.toHaveBeenCalled();
  });
});

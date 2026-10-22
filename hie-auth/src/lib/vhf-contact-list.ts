import { FhirApi } from "./utils";
import { toRelativeRequestPath } from "./fhir-resource-history";
import { EPID_SYSTEM_URI, getEpidValueFromEncounter } from "./epid-utils";
import { CASE_ID_SYSTEM_URI, getCaseId } from "./vhf-case-id";
import { getContactId } from "./vhf-contact-id";
import { isVhfEncounter } from "./vhf-contact";
import {
  contactFollowUp,
  kenyaToday,
  latestLinkOf,
  type ContactFollowUp,
  type ContactRecord,
  type ContactStatus,
} from "./vhf-contact-status";
import { VHF_CONTACT_LINK_IDS } from "./vhf-link-ids";
import { observationValues } from "./nphl-lab";

/**
 * One List per VHF case: its contacts. The List is the link between a contact and the case it
 * was exposed to (never Patient.link). It is rebuilt from each contact's "Contact Link to Case"
 * answer (vhf-source-case-epid), so contacts registered on mobile join it too, and it is found
 * by the case's EPID or Case ID (mode "working": entries are never deleted, a contact taken
 * off the list keeps its entry with flag "removed"):
 *   GET List?identifier=http://hie.org/identifiers/EPID|<EPID>&_include=List:item
 */

const BASE = "http://nphiis.health.go.ke/fhir";
export const CONTACT_LIST_PROFILE = `${BASE}/StructureDefinition/vhf-contact-list`;
export const CONTACT_LIST_CODE_SYSTEM = `${BASE}/CodeSystem/contact-list`;
export const CONTACT_LIST_CODE = "vhf-contact-list";
export const CONTACT_STATUS_SYSTEM = `${BASE}/CodeSystem/contact-status`;

/** Entry flag of a contact taken off the list, or no longer linked to the case (kept for history). */
export const REMOVED = "removed";
type EntryFlag = ContactStatus | typeof REMOVED;

const STATUS_DISPLAY: Record<EntryFlag, string> = {
  active: "Under follow up",
  flagged: "Symptomatic: convert to case",
  completed: "Completed follow up",
  converted: "Became a case",
  lost: "Lost to follow up",
  died: "Died",
  transferred: "Moved to another case",
  removed: "Taken off the list",
};
/** Statuses that end follow-up: a List whose contacts all ended is retired. */
const CLOSED: ContactStatus[] = ["completed", "converted", "died", "transferred"];

export const contactListId = (indexEncounterId: string) => `vhf-contacts-${indexEncounterId}`;

const ref = (resource: any) => `${resource.resourceType}/${resource.id}`;
const idOf = (reference: string | undefined) => reference?.split("/").pop() ?? "";

async function searchAll(path: string, maxPages = 50): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < maxPages; page++) {
    const bundle: any = (await FhirApi({ url: next, headers: { "Cache-Control": "no-cache" } })).data;
    for (const e of bundle?.entry ?? []) if (e?.resource) out.push(e.resource);
    const link: string | undefined = bundle?.link?.find((l: any) => l.relation === "next")?.url;
    next = link ? toRelativeRequestPath(link) : null;
  }
  return out;
}

/**
 * The EPID in a "Contact Link to Case" answer: mobile's picker stores "EPID  Name (Type)", a
 * typed answer is the EPID itself. EPIDs contain no spaces (android-fhir VhfSourceCases.epidFrom).
 */
export function epidFromAnswer(answer: string | null | undefined): string | null {
  return answer?.trim().split(/\s+/)[0] || null;
}

function isCaseEncounter(encounter: any): boolean {
  return encounter?.resourceType === "Encounter" && isVhfEncounter(encounter) && !encounter?.partOf?.reference;
}

/** The VHF case Encounter with this EPID or Case ID, if any. */
export async function findCaseEncounter(epidOrCaseId: string): Promise<any | null> {
  const value = epidOrCaseId.trim();
  if (!value) return null;
  for (const system of [EPID_SYSTEM_URI, CASE_ID_SYSTEM_URI]) {
    const found = await searchAll(`/Encounter?identifier=${encodeURIComponent(`${system}|${value}`)}&_count=10`, 1);
    const hit = found.find(isCaseEncounter);
    if (hit) return hit;
  }
  // Older cases carry the EPID on the Patient only; the Patient names its case Encounter.
  const patients = await searchAll(`/Patient?identifier=${encodeURIComponent(`${EPID_SYSTEM_URI}|${value}`)}&_count=5`, 1);
  for (const patient of patients) {
    const encounterId = patient?.identifier?.find((i: any) => i?.system === "vhf-case-information")?.value;
    if (!encounterId) continue;
    const encounter = (await FhirApi({ url: `/Encounter/${encounterId}` })).data;
    if (isCaseEncounter(encounter)) return encounter;
  }
  return null;
}

/** "Contact Link to Case" Observations naming this case, by its EPID, its Case ID or a focus reference. */
export async function sourceObservationsOf(indexEncounter: any): Promise<any[]> {
  const code = VHF_CONTACT_LINK_IDS.sourceCaseEpid;
  const values = [getEpidValueFromEncounter(indexEncounter), getCaseId(indexEncounter)].filter(Boolean) as string[];
  const byId = new Map<string, any>();
  for (const value of values) {
    // value-string matches by prefix; keep answers whose EPID is exactly this one.
    const found = await searchAll(`/Observation?code=${code}&value-string=${encodeURIComponent(value)}&_count=200`);
    for (const o of found) {
      if (epidFromAnswer(o?.valueString)?.toLowerCase() === value.toLowerCase()) byId.set(o.id, o);
    }
  }
  for (const o of await searchAll(`/Observation?code=${code}&focus=Encounter/${indexEncounter.id}&_count=200`)) {
    byId.set(o.id, o);
  }
  return [...byId.values()].filter((o) => idOf(o?.encounter?.reference) && idOf(o.encounter.reference) !== indexEncounter.id);
}

function registeredDate(encounter: any): string {
  const created = encounter?.identifier?.find((i: any) => i?.system === "system-creation")?.value;
  const text = String(created ?? encounter?.period?.start ?? encounter?.meta?.lastUpdated ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : kenyaToday();
}

/** A contact's case Encounter with its answers and child records (follow ups, monitoring). */
export async function loadContactRecord(encounterId: string): Promise<{ encounter: any; record: ContactRecord } | null> {
  const encounter = (await FhirApi({ url: `/Encounter/${encounterId}`, headers: { "Cache-Control": "no-cache" } })).data;
  if (encounter?.resourceType !== "Encounter") return null;
  const observations = await searchAll(`/Observation?encounter=Encounter/${encounterId}&_count=200`);
  const children = await searchAll(`/Encounter?part-of=Encounter/${encounterId}&_count=200`);
  const childObs = new Map<string, any[]>();
  for (let i = 0; i < children.length; i += 40) {
    const ids = children.slice(i, i + 40).map((c) => `Encounter/${c.id}`).join(",");
    for (const o of await searchAll(`/Observation?encounter=${ids}&_count=500`)) {
      const key = idOf(o?.encounter?.reference);
      childObs.set(key, [...(childObs.get(key) ?? []), o]);
    }
  }
  return {
    encounter,
    record: {
      encounterId,
      observations,
      registeredDate: registeredDate(encounter),
      children: children.map((c) => ({ encounter: c, observations: childObs.get(c.id) ?? [] })),
    },
  };
}

export type ListEntryInput = { encounterId: string; status: ContactStatus };

const flagOf = (entry: any): string | undefined => entry?.flag?.coding?.[0]?.code;
const flag = (code: EntryFlag) => ({ coding: [{ system: CONTACT_STATUS_SYSTEM, code, display: STATUS_DISPLAY[code] }] });

/** Contact Encounters on the List that are not taken off it. */
export function liveEntryIds(list: any): Set<string> {
  return new Set((list?.entry ?? []).filter((e: any) => flagOf(e) !== REMOVED).map((e: any) => idOf(e?.item?.reference)));
}

/**
 * The case's contact List. Entries already on [existing] keep their date; contacts no longer
 * linked, or taken off by a user, keep their entry with flag "removed" (List.entry.deleted is
 * only allowed on mode "changes" lists, invariant lst-2). [restored]: contacts a user put back.
 */
export function buildContactList(
  indexEncounter: any,
  contacts: ListEntryInput[],
  existing: any | null,
  now: string,
  removed: Set<string> = new Set(),
  restored: Set<string> = new Set(),
): any {
  const epid = getEpidValueFromEncounter(indexEncounter);
  const caseId = getCaseId(indexEncounter);
  const previous = new Map<string, any>(
    (existing?.entry ?? []).map((e: any) => [idOf(e?.item?.reference), e] as [string, any]),
  );
  const current = new Set(contacts.map((c) => c.encounterId));
  const today = now.slice(0, 10);

  const entries: any[] = contacts.map((c) => {
    const before = previous.get(c.encounterId);
    // A contact put back by a user loses its "removed" flag; removal wins if both are asked.
    const off = removed.has(c.encounterId) || (flagOf(before) === REMOVED && !restored.has(c.encounterId));
    return {
      item: { reference: `Encounter/${c.encounterId}` },
      flag: flag(off ? REMOVED : c.status),
      date: before?.date ?? today,
    };
  });
  for (const [id, before] of previous) {
    if (!current.has(id)) entries.push({ item: before.item, flag: flag(REMOVED), date: before.date ?? today });
  }

  const live = entries.filter((e) => flagOf(e) !== REMOVED);
  const allClosed = live.length > 0 && live.every((e) => CLOSED.includes(flagOf(e) as ContactStatus));

  return {
    resourceType: "List",
    id: contactListId(indexEncounter.id),
    meta: { profile: [CONTACT_LIST_PROFILE] },
    identifier: [
      ...(epid ? [{ use: "official", system: EPID_SYSTEM_URI, value: epid }] : []),
      ...(caseId ? [{ use: "official", system: CASE_ID_SYSTEM_URI, value: caseId }] : []),
    ],
    status: allClosed ? "retired" : "current",
    mode: "working",
    title: `Contacts of ${epid ?? caseId ?? `Encounter/${indexEncounter.id}`}`,
    code: { coding: [{ system: CONTACT_LIST_CODE_SYSTEM, code: CONTACT_LIST_CODE, display: "VHF contact list" }] },
    subject: indexEncounter.subject,
    encounter: { reference: ref(indexEncounter) },
    date: now,
    entry: entries,
  };
}

/**
 * Points a "Contact Link to Case" answer at the case Encounter (focus), once. Versioned so a
 * mobile re-sync in between is not overwritten; on a version conflict it re-reads and retries once.
 */
async function ensureFocus(observation: any, indexEncounterId: string): Promise<void> {
  const target = `Encounter/${indexEncounterId}`;
  let current = observation;
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((current.focus ?? []).some((f: any) => f?.reference === target)) return;
    const body = { ...current, focus: [...(current.focus ?? []), { reference: target }] };
    const headers: Record<string, string> = current?.meta?.versionId ? { "If-Match": `W/"${current.meta.versionId}"` } : {};
    const put = await FhirApi({ url: `/Observation/${current.id}`, method: "PUT", data: JSON.stringify(body), headers });
    if (put.status === "success") return;
    const reason = put.data?.issue?.[0]?.diagnostics ?? JSON.stringify(put.data).slice(0, 200);
    if (attempt === 0 && /version|conflict|precondition/i.test(reason)) {
      current = (await FhirApi({ url: `/Observation/${current.id}`, headers: { "Cache-Control": "no-cache" } })).data;
      continue;
    }
    console.warn(`[VhfContacts] focus on Observation/${current.id} not set: ${reason}`);
    return;
  }
}

export type ContactListResult = {
  list: any;
  indexEncounter: any;
  /** epid: null until the contact is converted to a case; contactId: null until its case has an EPID. */
  contacts: Array<
    ContactFollowUp & {
      patientId: string;
      contactId: string | null;
      epid: string | null;
      subCounty: string | null;
      /** Status "transferred": the newer case now following the contact up, as linked (EPID or Case ID). */
      movedTo: string | null;
    }
  >;
  /** Contacts still linked to the case but taken off its list by a user (can be put back). */
  removed: ContactListResult["contacts"];
};

/**
 * Rebuilds and saves the case's contact List with fresh statuses. [opts.remove]: contact
 * Encounters a user took off the list (kept as removed entries); [opts.restore]: removed
 * contacts a user put back. [opts.ensureContactId]: gives
 * a contact without one its Contact ID (epid-assignment's ensureVhfContactId); null when it
 * cannot be assigned yet.
 */
export async function upsertContactList(
  indexEncounterId: string,
  opts: {
    remove?: string[];
    restore?: string[];
    today?: string;
    ensureContactId?: (encounterId: string) => Promise<string | null>;
  } = {},
): Promise<ContactListResult> {
  const indexEncounter = (await FhirApi({ url: `/Encounter/${indexEncounterId}`, headers: { "Cache-Control": "no-cache" } })).data;
  if (!isCaseEncounter(indexEncounter)) throw new Error(`Encounter/${indexEncounterId} is not a VHF case record`);
  const today = opts.today ?? kenyaToday();

  const sources = await sourceObservationsOf(indexEncounter);
  const sourceIds = new Set(sources.map((o) => String(o.id)));
  const caseEpid = getEpidValueFromEncounter(indexEncounter);
  const contactIds = [...new Set(sources.map((o) => idOf(o.encounter.reference)))];
  const contacts: ContactListResult["contacts"] = [];
  for (const id of contactIds) {
    const loaded = await loadContactRecord(id);
    if (!loaded) continue;
    const computed = contactFollowUp(loaded.record, today);
    // A newer case linked the contact since: its follow-up stopped here and goes on there.
    const latest = latestLinkOf(loaded.record.observations);
    const transferred = !!latest && !sourceIds.has(String(latest.id));
    const followUp: ContactFollowUp = transferred ? { ...computed, status: "transferred", dueToday: false } : computed;
    let contactId = getContactId(loaded.encounter) ?? null;
    // A contact moved here from another case gets a Contact ID under this case's EPID.
    const needsId = !contactId || (!transferred && !!caseEpid && !contactId.startsWith(`${caseEpid}-C`));
    if (needsId && !transferred && followUp.caseType === "contact" && opts.ensureContactId) {
      try {
        contactId = (await opts.ensureContactId(id)) ?? contactId;
      } catch (e) {
        console.warn(`[VhfContacts] Contact ID for Encounter/${id} not assigned:`, e);
      }
    }
    contacts.push({
      ...followUp,
      patientId: idOf(loaded.encounter?.subject?.reference),
      contactId,
      epid: getEpidValueFromEncounter(loaded.encounter) ?? null,
      subCounty: observationValues(loaded.record.observations).get(VHF_CONTACT_LINK_IDS.subCounty) ?? null,
      movedTo: transferred ? epidFromAnswer(latest?.valueString) : null,
    });
  }
  // One at a time: parallel updates of a patient's answers conflict in HAPI.
  for (const o of sources) await ensureFocus(o, indexEncounterId);

  const url = `/List/${contactListId(indexEncounterId)}`;
  const removed = new Set(opts.remove ?? []);
  const restored = new Set(opts.restore ?? []);
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await FhirApi({ url, headers: { "Cache-Control": "no-cache" } });
    const existing = read.status === "success" && read.data?.resourceType === "List" ? read.data : null;
    const list = buildContactList(
      indexEncounter,
      contacts.map((c) => ({ encounterId: c.encounterId, status: c.status })),
      existing,
      new Date().toISOString(),
      removed,
      restored,
    );
    const headers: Record<string, string> = existing?.meta?.versionId ? { "If-Match": `W/"${existing.meta.versionId}"` } : {};
    const put = await FhirApi({ url, method: "PUT", data: JSON.stringify(list), headers });
    if (put.status === "success") {
      const live = liveEntryIds(put.data?.entry ? put.data : list);
      return {
        list: put.data ?? list,
        indexEncounter,
        contacts: contacts.filter((c) => live.has(c.encounterId)),
        removed: contacts.filter((c) => !live.has(c.encounterId)),
      };
    }
    if (attempt === 1 || !/precondition/i.test(put.statusText ?? "")) {
      throw new Error(`List ${url} not saved (${put.statusText}): ${JSON.stringify(put.data).slice(0, 300)}`);
    }
  }
  throw new Error("unreachable");
}

/** Every case named by a "Contact Link to Case" answer, as EPID / Case ID values. */
export async function linkedCaseValues(): Promise<string[]> {
  const answers = await searchAll(`/Observation?code=${VHF_CONTACT_LINK_IDS.sourceCaseEpid}&_elements=valueString&_count=500`, 200);
  return [...new Set(answers.map((o) => epidFromAnswer(o?.valueString)).filter(Boolean) as string[])];
}

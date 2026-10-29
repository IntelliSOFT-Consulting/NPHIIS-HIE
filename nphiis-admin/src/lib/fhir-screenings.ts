// Screened people and what happened to them next. Two sources:
// - hie-auth POST /provider/screenings: a Patient tagged record-origin|screened
//   plus one QuestionnaireResponse per screening (hie-auth src/lib/screening.ts);
// - the mobile app, which puts a Screening No. (vhf-screening-number) on the
//   Patient of a VHF case without a screening QuestionnaireResponse.
// Follow-up comes from the Patient's EPID and the NPHL specimen Tasks.

import { FHIR_BASE_URL, chunk, searchAll, searchAllWithIncludes } from "./fhir-search";
import {
  type FollowUpStage,
  type ScreenedPerson,
  type ScreenedSpecimen,
  type Screening,
  type Trip,
  isScreeningOutcome,
} from "./screenings";
import { isSpecimenStatus } from "./specimens";

const SCREENED_TAG = "http://nphiis.health.go.ke/fhir/CodeSystem/record-origin|screened";
const OUTCOME_SYSTEM = "http://nphiis.health.go.ke/fhir/CodeSystem/screening-outcome";
const TYPE_SYSTEM = "http://nphiis.health.go.ke/fhir/CodeSystem/screening-type";
const SCREENING_NUMBER_SYSTEM = "vhf-screening-number";
/** hie-auth also writes the Screening No. under this system. */
const SCREENED_SYSTEM = "vhf-screened";
const CASE_SYSTEM = "vhf-case-information";
const EPID_SYSTEM = "http://hie.org/identifiers/EPID";
const TASK_CODE = "http://nphiis.health.go.ke/fhir/CodeSystem/task-code|nphl-specimen-submission";
const SPECIMEN_LABEL_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/specimen-id";
const NATIONALITY_EXT = "http://hl7.org/fhir/StructureDefinition/patient-nationality";

/** Identifiers that are bookkeeping, not documents a person would be looked up by. */
const HIDDEN_ID_SYSTEMS = new Set([SCREENING_NUMBER_SYSTEM, SCREENED_SYSTEM, CASE_SYSTEM, "system-creation", EPID_SYSTEM]);

const PAGE_SIZE = 200;
const PATIENTS_PER_TASK_QUERY = 40;

type QrItem = { linkId?: string; text?: string; answer?: any[]; item?: QrItem[] };

function find(items: QrItem[] | undefined, linkId: string): QrItem | undefined {
  return items?.find((i) => i.linkId === linkId);
}

function all(items: QrItem[] | undefined, linkId: string): QrItem[] {
  return items?.filter((i) => i.linkId === linkId) ?? [];
}

function answer(items: QrItem[] | undefined, linkId: string): any {
  const a = find(items, linkId)?.answer?.[0];
  if (!a) return undefined;
  return (
    a.valueString ??
    a.valueDate ??
    a.valueDecimal ??
    a.valueBoolean ??
    a.valueReference?.display ??
    a.valueCoding?.code
  );
}

// The screening response uses the mobile vhf-case.json linkIds (hie-auth src/lib/screening.ts),
// plus point-of-entry and screening-* items for answers vhf-case has no question for.

export function toScreening(qr: any): Screening {
  const poe = find(qr.item, "point-of-entry")?.item;
  const clinical = find(qr.item, "vhf-clinical")?.item;
  const travel = find(qr.item, "vhf-travel")?.item;
  const outcome = qr.meta?.tag?.find((t: any) => t?.system === OUTCOME_SYSTEM)?.code;

  const notes: Record<string, string | undefined> = {
    "unexplained-bleeding": answer(clinical, "vhf-bleeding-site"),
    other: answer(clinical, "vhf-symptoms-other"),
  };
  const symptoms = (find(clinical, "vhf-symptoms")?.answer ?? [])
    .map((a) => a?.valueCoding?.code as string | undefined)
    .filter((code): code is string => !!code)
    .map((code) => ({
      code,
      onsetDate: answer(clinical, `vhf-onset-${code}`) as string | undefined,
      note: notes[code],
    }));

  const travelled = answer(travel, "vhf-travelled");
  // The trip is the other end of the journey: the origin of an entry screening, the destination of an exit one.
  const exit = qr.meta?.tag?.some((t: any) => t?.system === TYPE_SYSTEM && t.code === "exit");
  const end = exit ? "destination" : "origin";
  const originCountry = find(travel, `vhf-travel-${end}-country`)?.answer?.[0]?.valueCoding;
  const trips: Trip[] = [];
  if (originCountry) {
    trips.push({
      country: originCountry.display ?? originCountry.code ?? "",
      city: answer(travel, `vhf-travel-${end}-place`),
      departureDate: answer(travel, "vhf-travel-departure-date"),
      arrivalDate: answer(travel, "vhf-travel-arrival-date"),
      purpose: answer(qr.item, "screening-travel-purpose"),
    });
  }
  const stopovers: string | undefined = answer(travel, "vhf-travel-stopovers");
  // "None" is what the form asks for when there were no stopovers.
  for (const s of stopovers?.split(";") ?? []) if (s.trim() && !/^none$/i.test(s.trim())) trips.push({ country: s.trim() });

  const temperature = answer(qr.item, "screening-temperature");
  return {
    id: qr.id,
    screenedAt: qr.authored,
    screeningType: exit ? "exit" : "entry",
    outcome: isScreeningOutcome(outcome) ? outcome : undefined,
    pointOfEntry: answer(poe, "point-of-entry.name"),
    pointOfEntryType: answer(poe, "point-of-entry.type"),
    temperatureCelsius: typeof temperature === "number" ? temperature : undefined,
    symptoms,
    hasTravelled: travelled === "yes" ? true : travelled === "no" ? false : undefined,
    trips,
  };
}

function isEpid(id: any): boolean {
  return id?.system === EPID_SYSTEM || id?.type?.coding?.some((c: any) => c?.system === EPID_SYSTEM);
}

function identifierLabel(id: any): string | undefined {
  if (!id?.value?.trim() || HIDDEN_ID_SYSTEMS.has(id.system) || isEpid(id)) return undefined;
  const kind =
    id.type?.coding?.[0]?.display ??
    id.type?.text ??
    String(id.system ?? "ID")
      .split(/[-_\s]+/)
      .map((w) => (w.toLowerCase() === "id" ? "ID" : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ");
  return `${kind} ${id.value.trim()}`;
}

/**
 * hie-auth's screening writes county to `state` and sub-county to `district`; the mobile
 * app writes county to `city` and sub-county to `state`.
 */
function countyAndSubCounty(patient: any): { county?: string; subCounty?: string } {
  const a = patient?.address?.[0];
  if (!a) return {};
  if (a.district) return { county: a.state, subCounty: a.district };
  return { county: a.city, subCounty: a.state };
}

function stageFor(epid: string | undefined, isCase: boolean, specimens: ScreenedSpecimen[]): FollowUpStage {
  if (specimens.some((s) => s.result)) return "result";
  if (specimens.length) return "specimen";
  if (epid || isCase) return "case";
  return "screened";
}

export function toScreenedSpecimen(task: any): ScreenedSpecimen {
  const specimenId = (task.focus?.reference ?? "").split("/")[1] ?? "";
  const code = task.businessStatus?.coding?.[0]?.code;
  return {
    specimenId,
    label: task.identifier?.find((i: any) => i?.system === SPECIMEN_LABEL_SYSTEM)?.value ?? specimenId,
    status: isSpecimenStatus(code) ? code : undefined,
    statusText: task.businessStatus?.text,
    result: task.output?.find((o: any) => o?.type?.text === "result")?.valueString,
    submittedAt: task.authoredOn,
  };
}

export function toScreenedPerson(patient: any, qrs: any[], tasks: any[]): ScreenedPerson {
  const ids: any[] = patient.identifier ?? [];
  const epid = ids.find((i) => isEpid(i) && i.value?.trim())?.value?.trim();
  const screenings = qrs
    .map(toScreening)
    .sort((a, b) => (b.screenedAt ?? "").localeCompare(a.screenedAt ?? ""));
  const specimens = tasks
    .map(toScreenedSpecimen)
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
  const name = patient.name?.[0];
  const activity = [
    patient.meta?.lastUpdated,
    ...screenings.map((s) => s.screenedAt),
    ...tasks.map((t) => t.lastModified ?? t.meta?.lastUpdated),
  ]
    .filter((d): d is string => !!d)
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  return {
    patientId: patient.id,
    screeningNumbers: Array.from(
      new Set(
        ids
          .filter((i) => (i.system === SCREENING_NUMBER_SYSTEM || i.system === SCREENED_SYSTEM) && i.value?.trim())
          .map((i) => i.value.trim() as string),
      ),
    ),
    name:
      (name?.text ?? [...(name?.given ?? []), name?.family].filter(Boolean).join(" ")).trim() ||
      undefined,
    gender: patient.gender,
    birthDate: patient.birthDate,
    phone: patient.telecom?.find((t: any) => t?.system === "phone")?.value,
    nationality: patient.extension?.find((e: any) => e?.url === NATIONALITY_EXT)?.extension?.[0]
      ?.valueCodeableConcept?.text,
    ...countyAndSubCounty(patient),
    identifiers: ids.map(identifierLabel).filter((l): l is string => !!l),
    screenings,
    epid,
    specimens,
    stage: stageFor(epid, ids.some((i) => i.system === CASE_SYSTEM), specimens),
    lastActivity: activity[0],
  };
}

export async function listScreenedPeople(token: string): Promise<ScreenedPerson[]> {
  const qrParams = new URLSearchParams({ _tag: SCREENED_TAG, _count: String(PAGE_SIZE) });
  qrParams.append("_include", "QuestionnaireResponse:subject");
  const { matches: qrs, included } = await searchAllWithIncludes<any>(
    `${FHIR_BASE_URL}/QuestionnaireResponse?${qrParams}`,
    token,
  );
  const numbered = await searchAll<any>(
    `${FHIR_BASE_URL}/Patient?${new URLSearchParams({
      identifier: `${SCREENING_NUMBER_SYSTEM}|`,
      _count: String(PAGE_SIZE),
    })}`,
    token,
  );

  const patients = new Map<string, any>();
  for (const [ref, r] of Array.from(included)) if (ref.startsWith("Patient/")) patients.set(r.id, r);
  for (const p of numbered) patients.set(p.id, p);
  if (patients.size === 0) return [];

  const qrsByPatient = new Map<string, any[]>();
  for (const qr of qrs) {
    const id = (qr.subject?.reference ?? "").replace(/^Patient\//, "");
    if (!patients.has(id)) continue;
    qrsByPatient.set(id, [...(qrsByPatient.get(id) ?? []), qr]);
  }

  const tasksByPatient = new Map<string, any[]>();
  for (const ids of chunk(Array.from(patients.keys()), PATIENTS_PER_TASK_QUERY)) {
    const query = new URLSearchParams({
      code: TASK_CODE,
      patient: ids.map((id) => `Patient/${id}`).join(","),
      _count: String(PAGE_SIZE),
    });
    for (const t of await searchAll<any>(`${FHIR_BASE_URL}/Task?${query}`, token)) {
      const id = (t.for?.reference ?? "").replace(/^Patient\//, "");
      tasksByPatient.set(id, [...(tasksByPatient.get(id) ?? []), t]);
    }
  }

  return Array.from(patients.values())
    .map((p) => toScreenedPerson(p, qrsByPatient.get(p.id) ?? [], tasksByPatient.get(p.id) ?? []))
    .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}

// Specimens hie-auth has submitted to NPHL (hie-auth src/lib/nphl-lab.ts).
// Each Specimen is tracked by Task/nphl-<specimen id>, whose businessStatus
// moves from submitted to awaiting result, preliminary, final or rejected.
// The lab result is DiagnosticReport/nphl-report-<specimen id>, whose result[]
// lists the overall Observation/nphl-result-<specimen id> and one Observation
// per test.

import { FHIR_BASE_URL, chunk, fhirHeaders, searchAll, searchAllWithIncludes } from "./fhir-search";
import { type CaseSpecimen, type LabTest, type SubmittedSpecimen, isSpecimenStatus } from "./specimens";

const TASK_CODE = "http://nphiis.health.go.ke/fhir/CodeSystem/task-code|nphl-specimen-submission";
const RESULT_CODE = "http://nphiis.health.go.ke/fhir/CodeSystem/nphl-lab|nphl-lab-result";
const SPECIMEN_LABEL_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/specimen-id";
const LAB_NUMBER_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/nphl-lab-number";
const WORKFLOW_ENCOUNTER_EXT = "http://hl7.org/fhir/StructureDefinition/workflow-encounter";
const EPID_SYSTEM = "http://hie.org/identifiers/EPID";
const MANAGING_LOCATION_EXT = "specimen-managingLocation";

const TASK_PAGE_SIZE = 200;
const SPECIMENS_PER_RESULT_QUERY = 40;

interface Identifier {
  system?: string;
  value?: string;
  use?: string;
  type?: { coding?: Array<{ system?: string }> };
}

interface Task {
  id?: string;
  identifier?: Identifier[];
  businessStatus?: { text?: string; coding?: Array<{ code?: string }> };
  statusReason?: { text?: string };
  focus?: { reference?: string };
  for?: { reference?: string };
  encounter?: { reference?: string };
  authoredOn?: string;
  lastModified?: string;
  meta?: { lastUpdated?: string };
  input?: Array<{ type?: { text?: string }; valueString?: string }>;
  output?: Array<{ type?: { text?: string }; valueString?: string; valueDateTime?: string }>;
  note?: Array<{ authorString?: string; time?: string; text?: string }>;
}

interface ResultObservation {
  id?: string;
  status?: string;
  code?: { text?: string; coding?: Array<{ system?: string; code?: string }> };
  specimen?: { reference?: string };
  effectiveDateTime?: string;
  performer?: Array<{ display?: string }>;
  valueString?: string;
  component?: Array<{ code?: { text?: string }; valueString?: string }>;
}

interface DiagnosticReport {
  id?: string;
  status?: string;
  specimen?: Array<{ reference?: string }>;
  effectiveDateTime?: string;
  performer?: Array<{ display?: string }>;
  result?: Array<{ reference?: string }>;
  conclusion?: string;
}

/** A specimen's lab result: the report when there is one, its overall Observation and each test's. */
export interface LabResult {
  report?: DiagnosticReport;
  observation?: ResultObservation;
  tests?: ResultObservation[];
}

/** The report's Observations from the search's includes: the overall result, then each test in report order. */
export function labResultFromReport(report: DiagnosticReport, included: Map<string, any>): LabResult {
  const observations = (report.result ?? [])
    .map((r) => included.get(r.reference ?? ""))
    .filter((o): o is ResultObservation => !!o);
  const isOverall = (o: ResultObservation) =>
    o.code?.coding?.some((c) => `${c.system}|${c.code}` === RESULT_CODE) ?? false;
  return {
    report,
    observation: observations.find(isOverall),
    tests: observations.filter((o) => !isOverall(o)),
  };
}

function epidFrom(identifiers: Identifier[] | undefined, officialOnly: boolean): string | undefined {
  for (const id of identifiers ?? []) {
    const isEpid =
      id.system === EPID_SYSTEM || id.type?.coding?.some((c) => c.system === EPID_SYSTEM);
    if (isEpid && id.value?.trim() && (!officialOnly || id.use === "official")) {
      return id.value.trim();
    }
  }
  return undefined;
}

function patientName(patient: any): string | undefined {
  const name = patient?.name?.[0];
  if (!name) return undefined;
  const full = name.text ?? [...(name.given ?? []), name.family].filter(Boolean).join(" ");
  return full.trim() || undefined;
}

function sampleType(specimen: any): string | undefined {
  return (
    specimen?.type?.text ??
    specimen?.type?.coding?.find((c: any) => c?.system === "specimen-details")?.display ??
    specimen?.type?.coding?.[0]?.display
  );
}

export function toSubmittedSpecimen(
  task: Task,
  included: Map<string, any>,
  lab: LabResult = {},
): SubmittedSpecimen {
  const { report, observation } = lab;
  const specimen = included.get(task.focus?.reference ?? "");
  const patient = included.get(task.for?.reference ?? "");
  const encounter = included.get(task.encounter?.reference ?? "");
  const specimenId = (task.focus?.reference ?? "").split("/")[1] ?? task.id ?? "";
  const input = (name: string) => task.input?.find((i) => i.type?.text === name)?.valueString;
  const output = (name: string) => task.output?.find((o) => o.type?.text === name);
  const code = task.businessStatus?.coding?.[0]?.code;
  const label =
    task.identifier?.find((i) => i.system === SPECIMEN_LABEL_SYSTEM)?.value ??
    input("specimen-label") ??
    specimenId;
  // One Observation per test; results stored before those existed only have components.
  const tests: LabTest[] = lab.tests?.length
    ? lab.tests.map((o) => ({ name: o.code?.text ?? "Test", result: o.valueString ?? "" }))
    : (observation?.component ?? []).map((c) => ({
        name: c.code?.text ?? "Test",
        result: c.valueString ?? "",
      }));
  const resultStatus = report?.status ?? observation?.status;

  return {
    taskId: task.id ?? "",
    specimenId,
    label,
    labelIsFhirId: input("specimen-label-source") === "fhir-id",
    epid: epidFrom(encounter?.identifier, false) ?? epidFrom(patient?.identifier, true),
    patientName: patientName(patient),
    county: patient?.address?.[0]?.city,
    subCounty: patient?.address?.[0]?.state,
    facility: specimen?.extension?.find((e: any) => e?.url?.endsWith(MANAGING_LOCATION_EXT))
      ?.valueReference?.display,
    sampleType: sampleType(specimen),
    collectedAt: specimen?.collection?.collectedDateTime,
    submittedAt: task.authoredOn,
    updatedAt: task.lastModified ?? task.meta?.lastUpdated,
    status: isSpecimenStatus(code) ? code : undefined,
    statusText: task.businessStatus?.text,
    statusReason: task.statusReason?.text,
    result: report?.conclusion ?? observation?.valueString ?? output("result")?.valueString,
    resultType: resultStatus ? (resultStatus === "final" ? "Final" : "Preliminary") : undefined,
    resultDate: report?.effectiveDateTime ?? observation?.effectiveDateTime,
    testingLab: (report?.performer ?? observation?.performer)?.[0]?.display,
    tests,
    rejectedBy: output("rejected-by")?.valueString,
    rejectedOn: output("rejected-on")?.valueDateTime,
    labNumber: task.identifier?.find((i) => i.system === LAB_NUMBER_SYSTEM)?.value,
    // Notes with an author are the lab's; hie-auth writes its own without one.
    notes: (task.note ?? [])
      .filter((n) => n.authorString && n.text)
      .map((n) => ({ author: n.authorString!, time: n.time, text: n.text! })),
  };
}

/** The tube label hie-auth would submit for a Specimen (nphl-lab.ts specimenLabel). */
export function specimenLabel(specimen: any): { value: string; isFhirId: boolean } {
  const ids: Identifier[] = specimen?.identifier ?? [];
  const found =
    ids.find((i) => i.system === SPECIMEN_LABEL_SYSTEM && i.value?.trim()) ??
    ids.find((i) => i.value?.trim()) ??
    specimen?.accessionIdentifier;
  if (found?.value?.trim()) return { value: found.value.trim(), isFhirId: false };
  return { value: String(specimen?.id ?? ""), isFhirId: true };
}

function specimenCaseEncounter(specimen: any): string | undefined {
  const ref = specimen?.extension?.find((e: any) => e?.url === WORKFLOW_ENCOUNTER_EXT)?.valueReference?.reference;
  return typeof ref === "string" && ref.startsWith("Encounter/") ? ref : undefined;
}

/** A case's specimens without a Task: what is known from the Specimen itself. */
export function untrackedSpecimen(specimen: any, patient: any): CaseSpecimen {
  const label = specimenLabel(specimen);
  return {
    taskId: "",
    specimenId: specimen.id,
    label: label.value,
    labelIsFhirId: label.isFhirId,
    epid: epidFrom(patient?.identifier, true),
    patientName: patientName(patient),
    sampleType: sampleType(specimen),
    collectedAt: specimen?.collection?.collectedDateTime,
    facility: specimen?.extension?.find((e: any) => e?.url?.endsWith(MANAGING_LOCATION_EXT))?.valueReference?.display,
    tests: [],
    tracked: false,
    linkedToCase: !!specimenCaseEncounter(specimen),
  };
}

/**
 * Every Specimen of a patient with its tracking Task and lab result, for entering
 * results. Collected first, oldest first.
 */
export async function listCaseSpecimens(patientId: string, token: string): Promise<CaseSpecimen[]> {
  const subject = `Patient/${patientId}`;
  const specimens = await searchAll<any>(
    `${FHIR_BASE_URL}/Specimen?${new URLSearchParams({ subject, _count: "100" })}`,
    token,
  );
  if (!specimens.length) return [];
  const patient = await fetch(`${FHIR_BASE_URL}/${subject}`, { headers: fhirHeaders(token), cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const taskQuery = new URLSearchParams({ code: TASK_CODE, patient: subject, _count: "100" });
  taskQuery.append("_include", "Task:encounter");
  const { matches: tasks, included } = await searchAllWithIncludes<Task>(`${FHIR_BASE_URL}/Task?${taskQuery}`, token);
  for (const s of specimens) included.set(`Specimen/${s.id}`, s);
  if (patient) included.set(subject, patient);
  const taskBySpecimen = new Map(tasks.map((t) => [t.focus?.reference ?? "", t]));

  const resultBySpecimen = new Map<string, LabResult>();
  for (const refs of chunk(specimens.map((s) => `Specimen/${s.id}`), SPECIMENS_PER_RESULT_QUERY)) {
    const query = new URLSearchParams({ code: RESULT_CODE, specimen: refs.join(","), _include: "DiagnosticReport:result", _count: "200" });
    const { matches: reports, included: observations } = await searchAllWithIncludes<DiagnosticReport>(
      `${FHIR_BASE_URL}/DiagnosticReport?${query}`,
      token,
    );
    for (const r of reports) {
      const ref = r.specimen?.[0]?.reference;
      if (ref) resultBySpecimen.set(ref, labResultFromReport(r, observations));
    }
  }

  return specimens
    .map((s): CaseSpecimen => {
      const ref = `Specimen/${s.id}`;
      const task = taskBySpecimen.get(ref);
      const linkedToCase = !!specimenCaseEncounter(s);
      if (!task) return untrackedSpecimen(s, patient);
      return { ...toSubmittedSpecimen(task, included, resultBySpecimen.get(ref)), tracked: true, linkedToCase };
    })
    .sort((a, b) => (a.collectedAt ?? "").localeCompare(b.collectedAt ?? "") || a.label.localeCompare(b.label));
}

export async function listSubmittedSpecimens(token: string): Promise<SubmittedSpecimen[]> {
  const params = new URLSearchParams({
    code: TASK_CODE,
    _sort: "-authored-on",
    _count: String(TASK_PAGE_SIZE),
  });
  params.append("_include", "Task:focus");
  params.append("_include", "Task:patient");
  params.append("_include", "Task:encounter");

  const { matches: tasks, included } = await searchAllWithIncludes<Task>(
    `${FHIR_BASE_URL}/Task?${params}`,
    token,
  );
  if (tasks.length === 0) return [];

  const resultBySpecimen = new Map<string, LabResult>();
  const specimenRefs = tasks.map((t) => t.focus?.reference).filter((r): r is string => !!r);
  for (const refs of chunk(specimenRefs, SPECIMENS_PER_RESULT_QUERY)) {
    const query = new URLSearchParams({
      code: RESULT_CODE,
      specimen: refs.join(","),
      _include: "DiagnosticReport:result",
      _count: "200",
    });
    const { matches: reports, included: observations } =
      await searchAllWithIncludes<DiagnosticReport>(
        `${FHIR_BASE_URL}/DiagnosticReport?${query}`,
        token,
      );
    for (const r of reports) {
      const ref = r.specimen?.[0]?.reference;
      if (ref) resultBySpecimen.set(ref, labResultFromReport(r, observations));
    }
  }

  // A result Observation without its report: written before reports existed and not yet backfilled.
  const withoutReport = specimenRefs.filter((r) => !resultBySpecimen.has(r));
  for (const refs of chunk(withoutReport, SPECIMENS_PER_RESULT_QUERY)) {
    const query = new URLSearchParams({
      code: RESULT_CODE,
      specimen: refs.join(","),
      _count: "200",
    });
    const observations = await searchAll<ResultObservation>(
      `${FHIR_BASE_URL}/Observation?${query}`,
      token,
    );
    for (const o of observations) {
      if (o.specimen?.reference) resultBySpecimen.set(o.specimen.reference, { observation: o });
    }
  }

  return tasks.map((t) =>
    toSubmittedSpecimen(t, included, resultBySpecimen.get(t.focus?.reference ?? "")),
  );
}

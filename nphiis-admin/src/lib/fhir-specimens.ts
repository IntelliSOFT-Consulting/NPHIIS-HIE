// Specimens hie-auth has submitted to NPHL (hie-auth src/lib/nphl-lab.ts).
// Each Specimen is tracked by Task/nphl-<specimen id>, whose businessStatus
// moves from submitted to awaiting result, preliminary, final or rejected;
// the lab result is Observation/nphl-result-<specimen id>.

import { FHIR_BASE_URL, chunk, searchAll, searchAllWithIncludes } from "./fhir-search";
import { type LabTest, type SubmittedSpecimen, isSpecimenStatus } from "./specimens";

const TASK_CODE = "http://nphiis.health.go.ke/fhir/CodeSystem/task-code|nphl-specimen-submission";
const RESULT_CODE = "http://nphiis.health.go.ke/fhir/CodeSystem/nphl-lab|nphl-lab-result";
const SPECIMEN_LABEL_SYSTEM = "http://nphiis.health.go.ke/fhir/identifiers/specimen-id";
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
}

interface ResultObservation {
  status?: string;
  specimen?: { reference?: string };
  effectiveDateTime?: string;
  performer?: Array<{ display?: string }>;
  valueString?: string;
  component?: Array<{ code?: { text?: string }; valueString?: string }>;
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
  observation?: ResultObservation,
): SubmittedSpecimen {
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
  const tests: LabTest[] = (observation?.component ?? []).map((c) => ({
    name: c.code?.text ?? "Test",
    result: c.valueString ?? "",
  }));

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
    result: observation?.valueString ?? output("result")?.valueString,
    resultType: observation
      ? observation.status === "final"
        ? "Final"
        : "Preliminary"
      : undefined,
    resultDate: observation?.effectiveDateTime,
    testingLab: observation?.performer?.[0]?.display,
    tests,
    rejectedBy: output("rejected-by")?.valueString,
    rejectedOn: output("rejected-on")?.valueDateTime,
  };
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

  const resultBySpecimen = new Map<string, ResultObservation>();
  const specimenRefs = tasks.map((t) => t.focus?.reference).filter((r): r is string => !!r);
  for (const refs of chunk(specimenRefs, SPECIMENS_PER_RESULT_QUERY)) {
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
      if (o.specimen?.reference) resultBySpecimen.set(o.specimen.reference, o);
    }
  }

  return tasks.map((t) =>
    toSubmittedSpecimen(t, included, resultBySpecimen.get(t.focus?.reference ?? "")),
  );
}

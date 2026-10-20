import { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { FhirApi } from "./utils";
import { fcmService } from "./fcm";
import {
  getKeycloakUserById,
  isNotificationsEnabledForKeycloakUser,
} from "./keycloak";
import { getEpidValueFromPatient } from "./epid-utils";
import { sendLabResultEmail } from "./email";
import {
  resolveCaseSubmitterInfo,
  resolveCaseSubmitterPractitionerId,
  practitionerIdFromReference,
  formatHumanName,
  formatKeycloakName,
} from "./case-submitter";

/** Matches encounterReason values from nphiis-admin questionnaires (e.g. "Measles Lab Information"). */
const LAB_REASON_SUFFIX = "Lab Information";

export type LabResultLine = { label: string; value: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encounterReasonCode(encounter: unknown): string | null {
  const enc = encounter as {
    reasonCode?: Array<{ coding?: Array<{ code?: string; display?: string }> }>;
  };
  const coding = enc?.reasonCode?.[0]?.coding?.[0];
  const code = coding?.code?.trim();
  if (code) return code;
  return coding?.display?.trim() || null;
}

function parentEncounterId(encounter: unknown): string | null {
  const enc = encounter as { partOf?: { reference?: string } };
  const ref = enc?.partOf?.reference?.trim();
  if (!ref?.startsWith("Encounter/")) return null;
  const id = ref.split("/")[1]?.trim();
  return id || null;
}

/** True when this Encounter is a lab-result submission linked to an existing case. */
export function isLabResultEncounter(encounter: unknown): boolean {
  if (!parentEncounterId(encounter)) return false;
  const reason = encounterReasonCode(encounter);
  if (!reason) return false;
  return reason.includes(LAB_REASON_SUFFIX);
}

export function formatObservationValue(obs: unknown): string {
  const o = obs as Record<string, unknown>;
  if (o.valueString != null && String(o.valueString).trim()) {
    return String(o.valueString).trim();
  }
  if (o.valueDate != null) return String(o.valueDate);
  if (o.valueDateTime != null) return String(o.valueDateTime);
  const coding = o.valueCoding as { display?: string; code?: string } | undefined;
  if (coding?.display?.trim()) return coding.display.trim();
  if (coding?.code?.trim()) return coding.code.trim();
  if (o.valueInteger != null) return String(o.valueInteger);
  if (o.valueDecimal != null) return String(o.valueDecimal);
  if (typeof o.valueBoolean === "boolean") return o.valueBoolean ? "Yes" : "No";
  return "—";
}

function observationLabel(obs: unknown): string {
  const o = obs as {
    code?: { coding?: Array<{ display?: string }>; text?: string };
  };
  return (
    o?.code?.coding?.[0]?.display?.trim() ||
    o?.code?.text?.trim() ||
    "Result"
  );
}

function linesFromObservations(resources: unknown[]): LabResultLine[] {
  return resources.map((obs) => ({
    label: observationLabel(obs),
    value: formatObservationValue(obs),
  }));
}

async function fetchObservationsForEncounter(
  encounterId: string,
): Promise<LabResultLine[]> {
  const resp = await FhirApi({
    url: `/Observation?encounter=Encounter/${encodeURIComponent(encounterId)}&_count=100`,
  });
  const bundle = resp.data as { entry?: Array<{ resource?: unknown }> };
  const resources = (bundle?.entry ?? [])
    .map((e) => e.resource)
    .filter(Boolean);
  return linesFromObservations(resources);
}

function qrAnswerDisplay(answer: Record<string, unknown>): string {
  if (answer.valueString != null) return String(answer.valueString);
  if (answer.valueDate != null) return String(answer.valueDate);
  if (answer.valueDateTime != null) return String(answer.valueDateTime);
  const coding = answer.valueCoding as { display?: string; code?: string } | undefined;
  if (coding?.display) return coding.display;
  if (coding?.code) return coding.code;
  if (answer.valueInteger != null) return String(answer.valueInteger);
  if (answer.valueDecimal != null) return String(answer.valueDecimal);
  if (typeof answer.valueBoolean === "boolean") {
    return answer.valueBoolean ? "Yes" : "No";
  }
  return "—";
}

async function fetchResultsFromQuestionnaireResponse(
  labEncounterId: string,
): Promise<LabResultLine[]> {
  const resp = await FhirApi({
    url: `/QuestionnaireResponse?encounter=Encounter/${encodeURIComponent(labEncounterId)}&_sort=-authored&_count=1`,
  });
  const bundle = resp.data as {
    entry?: Array<{
      resource?: {
        item?: Array<{ linkId?: string; text?: string; answer?: Array<Record<string, unknown>> }>;
      };
    }>;
  };
  const items = bundle?.entry?.[0]?.resource?.item ?? [];
  const lines: LabResultLine[] = [];
  for (const item of items) {
    const ans = item.answer?.[0];
    if (!ans) continue;
    lines.push({
      label: item.text?.trim() || item.linkId || "Result",
      value: qrAnswerDisplay(ans),
    });
  }
  return lines;
}

/** Fetch lab result lines with retry (transaction bundle race) and QR fallback. */
export async function fetchLabResultLines(
  labEncounterId: string,
): Promise<LabResultLine[]> {
  const delays = [0, 500, 1000, 1500];
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    const fromObs = await fetchObservationsForEncounter(labEncounterId);
    if (fromObs.length > 0) return fromObs;
  }
  return fetchResultsFromQuestionnaireResponse(labEncounterId);
}

export function formatLabResultLinesForPush(
  lines: LabResultLine[],
  maxLen = 480,
): string {
  if (lines.length === 0) return "Lab results recorded (details in email or portal).";
  const parts = lines.map((l) => `${l.label}: ${l.value}`);
  let body = parts.join("; ");
  if (body.length <= maxLen) return body;
  return `${body.slice(0, maxLen - 1)}…`;
}

function inferDiseaseFromEpid(epid: string): string {
  const parts = epid.trim().split("-");
  if (parts.length < 5) return "Surveillance";
  const disease = parts[4].trim();
  return disease || "Surveillance";
}

async function resolveLabEntererName(labEncounter: unknown): Promise<string> {
  const enc = labEncounter as {
    participant?: Array<{ individual?: { reference?: string; display?: string } }>;
  };
  const individual = enc?.participant?.[0]?.individual;
  if (individual?.display?.trim()) return individual.display.trim();

  const practitionerId = practitionerIdFromReference(individual?.reference);
  if (!practitionerId) return "Not recorded";

  const kcUser = await getKeycloakUserById(practitionerId);
  const fromKc = formatKeycloakName(kcUser);
  if (fromKc) return fromKc;

  const resp = await FhirApi({ url: `/Practitioner/${practitionerId}` });
  const practitioner = resp.data as {
    name?: Array<{ given?: string[]; family?: string }>;
  };
  return formatHumanName(practitioner?.name?.[0]) || "Not recorded";
}

/**
 * Notifies the practitioner who posted the original case when lab results are submitted.
 * Idempotent per (caseSubmitter, labEncounterId, LAB_RESULT).
 */
export async function notifyLabResultToCaseSubmitter(
  labEncounter: unknown,
  patient: unknown,
): Promise<{
  skipped?: boolean;
  reason?: string;
  sentFcm?: boolean;
  sentEmail?: boolean;
}> {
  const labEncounterId =
    (labEncounter as { id?: string })?.id != null
      ? String((labEncounter as { id: string }).id)
      : "";
  if (!labEncounterId) {
    console.warn("[LabResultNotify] Missing lab encounter id; skipping");
    return { skipped: true, reason: "missing_lab_encounter_id" };
  }

  if (!isLabResultEncounter(labEncounter)) {
    return { skipped: true, reason: "not_lab_encounter" };
  }

  const caseEncounterId = parentEncounterId(labEncounter);
  if (!caseEncounterId) {
    console.warn("[LabResultNotify] Lab encounter missing partOf; skipping");
    return { skipped: true, reason: "missing_part_of" };
  }

  const caseEncounterResp = await FhirApi({ url: `/Encounter/${caseEncounterId}` });
  const caseEncounter = caseEncounterResp.data;
  if (
    caseEncounterResp.status !== "success" ||
    (caseEncounter as { resourceType?: string })?.resourceType !== "Encounter"
  ) {
    console.warn(`[LabResultNotify] Case encounter ${caseEncounterId} not found; skipping`);
    return { skipped: true, reason: "case_encounter_not_found" };
  }

  const { practitionerId } = await resolveCaseSubmitterPractitionerId(
    caseEncounter,
    caseEncounterId,
  );
  if (!practitionerId) {
    console.warn(
      `[LabResultNotify] Could not resolve case submitter for encounter ${caseEncounterId}; skipping`,
    );
    return { skipped: true, reason: "submitter_not_found" };
  }

  const keycloakUser = await getKeycloakUserById(practitionerId);
  if (!isNotificationsEnabledForKeycloakUser(keycloakUser)) {
    console.warn(
      `[LabResultNotify] Notifications disabled for practitioner ${practitionerId}; skipping`,
    );
    return { skipped: true, reason: "notifications_disabled" };
  }

  const epid = getEpidValueFromPatient(patient) ?? "Unknown EPID";
  const labFormName = encounterReasonCode(labEncounter) ?? "Lab results";
  const diseaseCondition = inferDiseaseFromEpid(epid);
  const resultLines = await fetchLabResultLines(labEncounterId);
  const labEntererName = await resolveLabEntererName(labEncounter);
  const submittedAt = new Date();

  const submitter = await resolveCaseSubmitterInfo(caseEncounter, caseEncounterId);
  const pushTitle = `Lab results available — ${epid}`;
  const pushBody =
    `Lab results for case ${epid} (${labFormName}) entered by ${labEntererName}. ` +
    formatLabResultLinesForPush(resultLines);

  const compositeWhere = {
    practitionerId_encounterId_type_followUpDay: {
      practitionerId,
      encounterId: labEncounterId,
      type: NotificationType.LAB_RESULT,
      followUpDay: -1,
    },
  };

  let row = await prisma.notification.findUnique({ where: compositeWhere });

  if (row?.status === "SENT" && row.caseSubmissionEmailSentAt != null) {
    return { skipped: true, reason: "already_sent" };
  }

  if (!row) {
    try {
      row = await prisma.notification.create({
        data: {
          practitionerId,
          encounterId: labEncounterId,
          type: NotificationType.LAB_RESULT,
          investigationDate: null,
          dueDate: submittedAt,
          title: pushTitle,
          body: pushBody,
          status: "PENDING",
        },
      });
    } catch (err: unknown) {
      const code =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        String((err as { code?: string }).code);
      if (code === "P2002") {
        row = await prisma.notification.findUnique({ where: compositeWhere });
      } else {
        throw err;
      }
    }
  }

  if (!row) {
    console.warn("[LabResultNotify] No LAB_RESULT row after create");
    return { skipped: true, reason: "row_create_failed" };
  }

  if (row.status !== "SENT") {
    row = await prisma.notification.update({
      where: { id: row.id },
      data: { title: pushTitle, body: pushBody, dueDate: submittedAt },
    });
  }

  let sentFcm = false;
  let sentEmail = false;
  const email = keycloakUser?.email?.trim() || null;
  const device = await prisma.notificationRecipient.findFirst({
    where: { practitionerId },
  });

  if (row.status !== "SENT" && device?.token) {
    const fcm = await fcmService.sendToDevice(device.token, {
      title: pushTitle,
      body: pushBody,
    });
    if (fcm?.success) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: "SENT", failureReason: null },
      });
      sentFcm = true;
    } else {
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          failureReason: fcm?.error ?? "FCM delivery failed",
        },
      });
    }
  } else if (row.status !== "SENT" && !device?.token) {
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: email ? "PENDING" : "FAILED",
        failureReason: email
          ? "No FCM token registered for this practitioner"
          : "No FCM token or email for this practitioner",
      },
    });
  } else if (row.status === "SENT") {
    sentFcm = true;
  }

  const portalUrl = process.env.ADMIN_PORTAL_URL?.trim() || null;

  if (email && row.caseSubmissionEmailSentAt == null) {
    const mailed = await sendLabResultEmail(email, {
      epid,
      diseaseCondition,
      labFormName,
      submittedAt,
      portalUrl,
      labEntererName,
      submittedByName: submitter.name,
      resultLines,
    });
    if (mailed) {
      sentEmail = true;
      await prisma.notification.update({
        where: { id: row.id },
        data: { caseSubmissionEmailSentAt: new Date() },
      });
    }
  }

  if (!sentFcm && !sentEmail) {
    console.warn(
      `[LabResultNotify] No delivery channel for practitioner ${practitionerId} (lab encounter ${labEncounterId})`,
    );
  } else {
    console.log(
      `[LabResultNotify] labEncounter=${labEncounterId} EPID=${epid} recipient=${practitionerId} FCM=${sentFcm} email=${sentEmail}`,
    );
  }

  return { sentFcm, sentEmail };
}

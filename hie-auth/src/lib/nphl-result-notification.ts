import { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { FhirApi } from "./utils";
import { getKeycloakUserById, isNotificationsEnabledForKeycloakUser } from "./keycloak";
import { getEpidValueFromEncounter, getEpidValueFromPatient } from "./epid-utils";
import { sendLabResultEmail } from "./email";
import { resolveCaseSubmitterInfo, resolveCaseSubmitterPractitionerId } from "./case-submitter";
import { labOutcomeEmailLines } from "./nphl-lab";

const COPY: Record<string, { subject: string; heading: string; intro: string }> = {
  "preliminary-result": {
    subject: "Preliminary lab result",
    heading: "Preliminary lab result",
    intro: "NPHL has a preliminary result for a specimen from a case you submitted.",
  },
  "final-result": {
    subject: "Final lab result",
    heading: "Final lab result",
    intro: "NPHL has a final result for a specimen from a case you submitted.",
  },
  "specimen-rejected": {
    subject: "Specimen rejected by the lab",
    heading: "Specimen rejected",
    intro: "The lab rejected a specimen from a case you submitted. A new specimen may be needed.",
  },
};

async function patientEpid(encounter: any): Promise<string | undefined> {
  const ref = encounter?.subject?.reference;
  if (!ref?.startsWith("Patient/")) return undefined;
  const r = await FhirApi({ url: `/${ref}` });
  return r.status === "success" ? getEpidValueFromPatient(r.data) : undefined;
}

/**
 * Emails the practitioner who submitted the case when a specimen gets a preliminary result,
 * a final result or is rejected. Each (specimen, outcome) is emailed once: the Notification
 * row is keyed on the Task id and outcome, so a preliminary then final result sends two emails.
 */
export async function notifySpecimenOutcome(args: {
  outcome: string;
  task: any;
  caseEncounterId: string;
  observation?: any;
}): Promise<{ sent: boolean; reason?: string }> {
  const copy = COPY[args.outcome];
  if (!copy) return { sent: false, reason: "not_notifiable" };

  const encResp = await FhirApi({ url: `/Encounter/${args.caseEncounterId}` });
  const encounter = encResp.data;
  if (encResp.status !== "success" || encounter?.resourceType !== "Encounter") {
    return { sent: false, reason: "case_encounter_not_found" };
  }

  const { practitionerId } = await resolveCaseSubmitterPractitionerId(encounter, args.caseEncounterId);
  if (!practitionerId) return { sent: false, reason: "submitter_not_found" };

  const user = await getKeycloakUserById(practitionerId);
  if (!isNotificationsEnabledForKeycloakUser(user)) return { sent: false, reason: "notifications_disabled" };
  const email = user?.email?.trim();
  if (!email) return { sent: false, reason: "no_email" };

  const key = `${args.task.id}:${args.outcome}`;
  const where = { practitionerId_encounterId_type: { practitionerId, encounterId: key, type: NotificationType.LAB_RESULT } };
  const epid = getEpidValueFromEncounter(encounter) ?? (await patientEpid(encounter)) ?? "Unknown EPID";
  const resultLines = labOutcomeEmailLines(args.task, args.observation);
  const title = `${copy.subject} — ${epid}`;
  const body = resultLines.map((l) => `${l.label}: ${l.value}`).join("; ").slice(0, 480);

  let row = await prisma.notification.findUnique({ where });
  if (row?.caseSubmissionEmailSentAt) return { sent: false, reason: "already_sent" };
  if (!row) {
    try {
      row = await prisma.notification.create({
        data: {
          practitionerId,
          encounterId: key,
          type: NotificationType.LAB_RESULT,
          dueDate: new Date(),
          title,
          body,
          status: "PENDING",
        },
      });
    } catch (e: any) {
      // Another sync is sending this one.
      if (e?.code === "P2002") return { sent: false, reason: "already_sending" };
      throw e;
    }
  }

  const submitter = await resolveCaseSubmitterInfo(encounter, args.caseEncounterId);
  const testingLab =
    args.observation?.performer?.[0]?.display ??
    (args.task.output ?? []).find((o: any) => o?.type?.text === "rejected-by")?.valueString ??
    "NPHL";
  const mailed = await sendLabResultEmail(email, {
    epid,
    diseaseCondition: "VHF",
    labFormName: "NPHL specimen result",
    submittedAt: new Date(),
    portalUrl: process.env.ADMIN_PORTAL_URL?.trim() || null,
    labEntererName: testingLab,
    submittedByName: submitter.name,
    resultLines,
    subject: title,
    heading: copy.heading,
    intro: copy.intro,
    entererLabel: "Testing lab",
  });

  await prisma.notification.update({
    where: { id: row.id },
    data: mailed
      ? { status: "SENT", failureReason: null, caseSubmissionEmailSentAt: new Date() }
      : { status: "FAILED", failureReason: "Lab result email failed or SMTP not configured" },
  });
  console.log(`[NPHL] ${args.outcome} email for ${args.task.id} to practitioner ${practitionerId}: ${mailed ? "sent" : "failed"}`);
  return mailed ? { sent: true } : { sent: false, reason: "email_failed" };
}

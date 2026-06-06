import { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { FhirApi } from "./utils";
import { fcmService } from "./fcm";
import {
  getKeycloakUserById,
  isNotificationsEnabledForKeycloakUser,
} from "./keycloak";
import { getEpidValueFromEncounter } from "./epid-utils";
import { sendCaseSubmissionEmail } from "./email";
import {
  getCaseSubmissionNotifyRolesFromEnv,
  getUsersByRoles,
} from "./notification-recipients";

const reminderMessageTemplate = `Follow up for AFP case {} is due. Please complete and submit the follow-up investigation form.`;
const messageTitle = "60-day AFP Follow Up Reminder";

function caseSubmissionPushBody(parts: {
  epid: string;
  diseaseCondition: string;
  countyName: string;
  subCountyName: string;
}): string {
  const loc = `${parts.countyName}, ${parts.subCountyName}`;
  return `Case ${parts.epid} (${parts.diseaseCondition}) submitted in ${loc}.`;
}

export const processAfpObservation = async (observation: any) => {
  const candidateDates: Array<string | undefined> = [
    observation?.valueDateTime,
    observation?.valueDate,
    observation?.valueString,
  ];

  const dateStr = candidateDates.find(Boolean);
  const investigation = dateStr ? new Date(dateStr as string) : new Date(0);
  if (isNaN(investigation.getTime())) {
    return { status: "error", error: "Invalid or missing investigation date in Observation" };
  }

  const due = new Date(investigation);
  due.setDate(due.getDate() + 60);
  const practitionerId = observation?.performer?.[0]?.reference?.split("/")[1];
  const encounterId = observation?.encounter?.reference?.split("/")[1];
  if (!practitionerId || !encounterId) {
    return {
      status: "error",
      error: "Observation must include performer[0].reference and encounter.reference",
    };
  }

  const encounter = (await FhirApi({ url: `/Encounter/${encounterId}` })).data;

  const caseId = getEpidValueFromEncounter(encounter);
  console.log("caseId:", caseId);

  const bodyText = reminderMessageTemplate.replace("{}", caseId ?? "");

  let notification = await prisma.notification.findUnique({
    where: {
      practitionerId_encounterId_type: {
        practitionerId,
        encounterId,
        type: NotificationType.AFP_FOLLOW_UP,
      },
    },
  });

  if (notification) {
    notification = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        body: bodyText,
        dueDate: due,
        title: messageTitle,
        practitionerId,
        encounterId,
        investigationDate: investigation,
        type: NotificationType.AFP_FOLLOW_UP,
      },
    });
  } else {
    notification = await prisma.notification.create({
      data: {
        title: messageTitle,
        body: bodyText,
        practitionerId,
        encounterId,
        investigationDate: investigation,
        dueDate: due,
        type: NotificationType.AFP_FOLLOW_UP,
      },
    });
  }

  const config = await prisma.notificationRecipient.findFirst({
    where: {
      practitionerId,
    },
  });

  if (!config) {
    return { status: "error", error: "User is missing notification token configuration" };
  }

  return {
    status: "success",
    notificationId: notification.id,
    message: "Notification created and scheduled successfully",
  };
};

/**
 * Fires FCM push + SMTP email after a **newly generated** EPID (Encounter subscription path only).
 * Idempotent per practitioner: composite unique `[practitionerId, encounterId, CASE_SUBMISSION]` —
 * rows in `SENT` are skipped; `PENDING` / `FAILED` are retried on a later invocation so partial
 * batches can complete after crashes or flaky FCM/email. Successful SMTP is recorded in
 * `caseSubmissionEmailSentAt` so retries do not resend the same email.
 */
export async function notifyCaseSubmissionIfEnabled(
  encounterResource: any,
  ctx: {
    epid: string;
    diseaseCondition: string;
    countyName: string;
    subCountyName: string;
  },
): Promise<{
  skipped?: boolean;
  recipients?: number;
  sentFcm?: number;
  sentEmail?: number;
}> {
  const encounterId =
    encounterResource?.id !== undefined ? String(encounterResource.id) : "";
  if (!encounterId) {
    console.warn("[CaseSubmissionNotify] Missing encounter id; skipping notifications");
    return { skipped: true };
  }

  const roles = getCaseSubmissionNotifyRolesFromEnv();
  const users = await getUsersByRoles(roles);
  if (users.length === 0) {
    console.warn(
      `[CaseSubmissionNotify] No recipients for roles ${roles.join(", ")}; skipping. ` +
        "Ensure Keycloak users have practitionerRole set (POST /provider/users/backfill-practitioner-roles).",
    );
    return { recipients: 0 };
  }

  const submittedAt = new Date();
  const pushBody = caseSubmissionPushBody({
    epid: ctx.epid,
    diseaseCondition: ctx.diseaseCondition,
    countyName: ctx.countyName,
    subCountyName: ctx.subCountyName,
  });
  const caseSubmissionPushTitle = `New ${ctx.diseaseCondition} case submitted`;

  let sentFcm = 0;
  let sentEmail = 0;
  const portalUrl = process.env.ADMIN_PORTAL_URL?.trim() || null;

  const compositeWhere = (practitionerId: string) =>
    ({
      practitionerId_encounterId_type: {
        practitionerId,
        encounterId,
        type: NotificationType.CASE_SUBMISSION,
      },
    }) as const;

  for (const recipient of users) {
    try {
      let row = await prisma.notification.findUnique({
        where: compositeWhere(recipient.practitionerId),
      });

      if (row?.status === "SENT") {
        continue;
      }

      if (!row) {
        try {
          row = await prisma.notification.create({
            data: {
              practitionerId: recipient.practitionerId,
              encounterId,
              type: NotificationType.CASE_SUBMISSION,
              investigationDate: null,
              dueDate: submittedAt,
              title: caseSubmissionPushTitle,
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
            row = await prisma.notification.findUnique({
              where: compositeWhere(recipient.practitionerId),
            });
          } else {
            throw err;
          }
        }
      }

      if (!row) {
        console.warn(
          `[CaseSubmissionNotify] No CASE_SUBMISSION row for practitioner ${recipient.practitionerId} after create`,
        );
        continue;
      }

      if (row.status === "SENT") {
        continue;
      }

      row = await prisma.notification.update({
        where: { id: row.id },
        data: {
          body: pushBody,
          title: caseSubmissionPushTitle,
          dueDate: submittedAt,
        },
      });

      const device = await prisma.notificationRecipient.findFirst({
        where: { practitionerId: recipient.practitionerId },
      });

      if (device?.token) {
        const fcm = await fcmService.sendToDevice(device.token, {
          title: caseSubmissionPushTitle,
          body: pushBody,
        });
        if (fcm?.success) {
          await prisma.notification.update({
            where: { id: row.id },
            data: { status: "SENT" },
          });
          sentFcm++;
        } else {
          await prisma.notification.update({
            where: { id: row.id },
            data: { status: "FAILED" },
          });
        }
      } else {
        await prisma.notification.update({
          where: { id: row.id },
          data: { status: "FAILED" },
        });
      }

      if (recipient.email?.trim() && row.caseSubmissionEmailSentAt == null) {
        const mailed = await sendCaseSubmissionEmail(recipient.email.trim(), {
          epid: ctx.epid,
          diseaseCondition: ctx.diseaseCondition,
          countyName: ctx.countyName,
          subCountyName: ctx.subCountyName,
          submittedAt,
          portalUrl,
          recipientRole: recipient.role,
        });
        if (mailed) {
          sentEmail++;
          await prisma.notification.update({
            where: { id: row.id },
            data: { caseSubmissionEmailSentAt: new Date() },
          });
        }
      }
    } catch (e) {
      console.error("[CaseSubmissionNotify] Recipient delivery failed:", e);
    }
  }

  console.log(
    `[CaseSubmissionNotify] encounter=${encounterId} EPID=${ctx.epid} FCM_ok=${sentFcm} emails=${sentEmail}`,
  );
  return { recipients: users.length, sentFcm, sentEmail };
}

export const sendDueNotifications = async () => {
  try {
    console.log("[Notification Cron] Starting to process due notifications...");

    const now = new Date();
    const eatOffset = 3 * 60;
    const utcOffset = now.getTimezoneOffset();
    const eatTime = new Date(now.getTime() + (eatOffset + utcOffset) * 60 * 1000);

    const todayEAT = new Date(eatTime.getFullYear(), eatTime.getMonth(), eatTime.getDate());

    const twoDaysAgo = new Date(todayEAT);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    console.log(`[Notification Cron] Current EAT date: ${todayEAT.toISOString()}`);
    console.log(`[Notification Cron] Retry window starts: ${twoDaysAgo.toISOString()}`);

    const afpPendingOnly = {
      type: NotificationType.AFP_FOLLOW_UP,
      status: "PENDING" as const,
      dueDate: { lte: todayEAT },
    };

    const afpFailedRetry = {
      type: NotificationType.AFP_FOLLOW_UP,
      status: "FAILED" as const,
      dueDate: { gte: twoDaysAgo, lte: todayEAT },
    };

    const pendingNotifications = await prisma.notification.findMany({
      where: afpPendingOnly,
    });

    const failedNotifications = await prisma.notification.findMany({
      where: afpFailedRetry,
    });

    const allNotifications = [...pendingNotifications, ...failedNotifications];

    console.log(
      `[Notification Cron] Found ${pendingNotifications.length} pending and ${failedNotifications.length} failed AFP notifications to process`,
    );

    if (allNotifications.length === 0) {
      console.log("[Notification Cron] No notifications to send");
      return { success: true, sent: 0, failed: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const notification of allNotifications) {
      try {
        const recipient = await prisma.notificationRecipient.findFirst({
          where: {
            practitionerId: notification.practitionerId,
          },
        });

        const keycloakUser = await getKeycloakUserById(notification.practitionerId);
        if (!isNotificationsEnabledForKeycloakUser(keycloakUser)) {
          console.warn(
            `[Notification Cron] Notifications disabled for practitioner ${notification.practitionerId}, skipping notification ${notification.id}`,
          );
          continue;
        }

        if (!recipient || !recipient.token) {
          console.warn(
            `[Notification Cron] No FCM token found for practitioner ${notification.practitionerId}, skipping notification ${notification.id}`,
          );
          continue;
        }

        const fcmResponse = await fcmService.sendToDevice(recipient.token, {
          title: notification.title,
          body: notification.body,
        });

        if (fcmResponse && fcmResponse.success) {
          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: "SENT" },
          });
          sentCount++;
          console.log(`[Notification Cron] Successfully sent notification ${notification.id}`);
        } else {
          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: "FAILED" },
          });
          failedCount++;
          console.error(
            `[Notification Cron] Failed to send notification ${notification.id}: ${fcmResponse?.error || "Unknown error"}`,
          );
        }
      } catch (error) {
        console.error(`[Notification Cron] Error processing notification ${notification.id}:`, error);
        try {
          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: "FAILED" },
          });
          failedCount++;
        } catch (updateError) {
          console.error("[Notification Cron] Failed to update notification status:", updateError);
        }
      }
    }

    console.log(`[Notification Cron] Completed processing. Sent: ${sentCount}, Failed: ${failedCount}`);
    return { success: true, sent: sentCount, failed: failedCount };
  } catch (error) {
    console.error("[Notification Cron] Error in sendDueNotifications:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
};

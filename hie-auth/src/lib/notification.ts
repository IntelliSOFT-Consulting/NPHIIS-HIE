import { prisma } from "./prisma";
import { FhirApi } from "./utils";
import { fcmService } from "./fcm";

const reminderMessageTemplate = `Follow up for AFP case {} is due. Please complete and submit the follow-up investigation form.`
const messageTitle = "60-day AFP Follow Up Reminder"


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
    const practitionerId = observation?.performer?.[0]?.reference?.split('/')[1];
    const encounterId = observation?.encounter?.reference?.split('/')[1];
    const encounter = (await FhirApi({ url: `/Encounter/${encounterId}` })).data;

    const caseId = encounter?.identifier?.find((id: any) => id.system === "http://hie.org/identifiers/EPID")?.value;
    console.log("caseId:", caseId);

    const bodyText = reminderMessageTemplate.replace('{}', caseId ?? '');

    let notification = await prisma.notification.findFirst({
        where: {
            practitionerId,
            encounterId,
        }
    })
    if (notification) {
        notification = await prisma.notification.update({
            where: {
                id: notification.id,
            },
            data: {
                body: bodyText,
                dueDate: due,
                title: messageTitle,
                practitionerId,
                encounterId,
                investigationDate: investigation,
            }
        })
    }
    if (!notification) {
        notification = await prisma.notification.create({
            data: {
                title: messageTitle,
                body: bodyText,
                practitionerId,
                encounterId,
                investigationDate: investigation,
                dueDate: due,
            }
        })
    }

    const config = await prisma.notificationRecipient.findFirst({
        where: {
            practitionerId,
        }
    });

    if (!config) {
        return { status: "error", error: "User is missing notification token configuration" };
    }

    return { status: "success", notificationId: notification.id, message: "Notification created and scheduled successfully" };
}


/**
 * Send notifications that are due today or earlier
 * Retries FAILED notifications if their due date is within the last 2 days
 */
export const sendDueNotifications = async () => {
    try {
        console.log('[Notification Cron] Starting to process due notifications...');
        
        const now = new Date();
        const eatOffset = 3 * 60;
        const utcOffset = now.getTimezoneOffset();
        const eatTime = new Date(now.getTime() + (eatOffset + utcOffset) * 60 * 1000);
        
        const todayEAT = new Date(eatTime.getFullYear(), eatTime.getMonth(), eatTime.getDate());
        
        const twoDaysAgo = new Date(todayEAT);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        
        console.log(`[Notification Cron] Current EAT date: ${todayEAT.toISOString()}`);
        console.log(`[Notification Cron] Retry window starts: ${twoDaysAgo.toISOString()}`);
        
        const pendingNotifications = await prisma.notification.findMany({
            where: {
                status: 'PENDING',
                dueDate: {
                    lte: todayEAT
                }
            }
        });
        
        const failedNotifications = await prisma.notification.findMany({
            where: {
                status: 'FAILED',
                dueDate: {
                    gte: twoDaysAgo,
                    lte: todayEAT
                }
            }
        });
        
        const allNotifications = [...pendingNotifications, ...failedNotifications];
        
        console.log(`[Notification Cron] Found ${pendingNotifications.length} pending and ${failedNotifications.length} failed notifications to process`);
        
        if (allNotifications.length === 0) {
            console.log('[Notification Cron] No notifications to send');
            return { success: true, sent: 0, failed: 0 };
        }
        
        let sentCount = 0;
        let failedCount = 0;
        
        for (const notification of allNotifications) {
            try {
                const recipient = await prisma.notificationRecipient.findFirst({
                    where: {
                        practitionerId: notification.practitionerId
                    }
                });
                
                if (!recipient || !recipient.token) {
                    console.warn(`[Notification Cron] No FCM token found for practitioner ${notification.practitionerId}, skipping notification ${notification.id}`);
                    continue;
                }
                
                const fcmResponse = await fcmService.sendToDevice(recipient.token, {
                    title: notification.title,
                    body: notification.body
                });
                
                if (fcmResponse && fcmResponse.success) {
                    await prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'SENT' }
                    });
                    sentCount++;
                    console.log(`[Notification Cron] Successfully sent notification ${notification.id}`);
                } else {
                    await prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'FAILED' }
                    });
                    failedCount++;
                    console.error(`[Notification Cron] Failed to send notification ${notification.id}: ${fcmResponse?.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error(`[Notification Cron] Error processing notification ${notification.id}:`, error);
                try {
                    await prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'FAILED' }
                    });
                    failedCount++;
                } catch (updateError) {
                    console.error(`[Notification Cron] Failed to update notification status:`, updateError);
                }
            }
        }
        
        console.log(`[Notification Cron] Completed processing. Sent: ${sentCount}, Failed: ${failedCount}`);
        return { success: true, sent: sentCount, failed: failedCount };
        
    } catch (error) {
        console.error('[Notification Cron] Error in sendDueNotifications:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

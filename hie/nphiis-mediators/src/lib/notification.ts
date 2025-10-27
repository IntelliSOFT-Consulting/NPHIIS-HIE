import { prisma } from "./prisma";
import { FhirApi, sendMediatorRequest } from "./utils";

const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_URL'] || "http://hie-auth:3000"

const reminderMessage = `Follow up for AFP case {} is due. Please complete and submit the follow-up investigation form.`
const messageTitle = "60-day AFP Follow Up Reminder"


export const processAfpObservation = async (observation: any) => {

    const date = observation?.code?.coding?.[0]?.text;
    const parsedDate = new Date(date);
    const practitionerId = observation?.performer?.[0]?.reference?.split('/')[1];
    const encounterId = observation?.encounter?.reference?.split('/')[1];
    const encounter = (await FhirApi({ url: `/Encounter/${encounterId}` })).data;

    const caseId = encounter?.identifier?.find((id: any) => id.system === "http://hie.org/identifiers/EPID")?.value;

    let notification = null;
    // check if notification already exists
    notification = await prisma.notification.findFirst({
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
                dueDate: parsedDate.toISOString(),
            }
        })
    }
    if (!notification) {
        notification = await prisma.notification.create({
            data: {
                title: messageTitle,
                body: reminderMessage.replace('{}', caseId),
                practitionerId,
                encounterId,
                investigationDate: new Date(date).toISOString(),
                dueDate: parsedDate.toISOString(),
            }
        })
    }

    const config = await prisma.notificationRecipient.findFirst({
        where: {
            practitionerId,
        }
    });

    if (!config) {
        return { status: "error", error: "User is missing notication token configuration" };
    }

    return { status: "success", notificationId: notification.id, message: "Notification created successfully" };
}


export const getUserInfoFromToken = async (token: string) => {
    try {
        const response = await fetch(`${AUTH_SERVICE_URL}/users/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            }
        })
        const data = await response.json()
        return data
    } catch (error) {
        console.error(error)
        return null
    }
}


/**
 * Send notifications that are due today or earlier
 * Retries FAILED notifications if their due date is within the last 2 days
 */
export const sendDueNotifications = async () => {
    try {
        console.log('[Notification Cron] Starting to process due notifications...');
        
        // Get current date in EAT timezone (Africa/Nairobi)
        const now = new Date();
        const eatOffset = 3 * 60; // EAT is UTC+3 (in minutes)
        const utcOffset = now.getTimezoneOffset();
        const eatTime = new Date(now.getTime() + (eatOffset + utcOffset) * 60 * 1000);
        
        // Set to start of day (00:00:00) for comparison
        const todayEAT = new Date(eatTime.getFullYear(), eatTime.getMonth(), eatTime.getDate());
        
        // Calculate 2 days ago for retry window
        const twoDaysAgo = new Date(todayEAT);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        
        console.log(`[Notification Cron] Current EAT date: ${todayEAT.toISOString()}`);
        console.log(`[Notification Cron] Retry window starts: ${twoDaysAgo.toISOString()}`);
        
        // Query for PENDING notifications where dueDate is today or earlier
        const pendingNotifications = await prisma.notification.findMany({
            where: {
                status: 'PENDING',
                dueDate: {
                    lte: todayEAT
                }
            }
        });
        
        // Query for FAILED notifications within the last 2 days (for retry)
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
        
        // Process each notification
        for (const notification of allNotifications) {
            try {
                // Get the FCM token for this practitioner
                const recipient = await prisma.notificationRecipient.findFirst({
                    where: {
                        practitionerId: notification.practitionerId
                    }
                });
                
                if (!recipient || !recipient.token) {
                    console.warn(`[Notification Cron] No FCM token found for practitioner ${notification.practitionerId}, skipping notification ${notification.id}`);
                    // Don't mark as failed, just skip - token might be added later
                    continue;
                }
                
                // Send notification via mediator endpoint
                const fcmResponse = await sendMediatorRequest("/notifications/send", {
                    token: recipient.token,
                    title: notification.title,
                    body: notification.body
                });
                
                if (fcmResponse && fcmResponse.success) {
                    // Update notification status to SENT
                    await prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'SENT' }
                    });
                    sentCount++;
                    console.log(`[Notification Cron] Successfully sent notification ${notification.id}`);
                } else {
                    // Update notification status to FAILED
                    await prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'FAILED' }
                    });
                    failedCount++;
                    console.error(`[Notification Cron] Failed to send notification ${notification.id}: ${fcmResponse?.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error(`[Notification Cron] Error processing notification ${notification.id}:`, error);
                // Mark as failed
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

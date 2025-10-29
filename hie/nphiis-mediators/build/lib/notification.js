"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDueNotifications = exports.getUserInfoFromToken = exports.processAfpObservation = void 0;
const prisma_1 = require("./prisma");
const utils_1 = require("./utils");
const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_URL'] || "http://hie-auth:3000";
const reminderMessage = `Follow up for AFP case {} is due. Please complete and submit the follow-up investigation form.`;
const messageTitle = "60-day AFP Follow Up Reminder";
const processAfpObservation = (observation) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const date = (_c = (_b = (_a = observation === null || observation === void 0 ? void 0 : observation.code) === null || _a === void 0 ? void 0 : _a.coding) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text;
    const parsedDate = new Date(date);
    const practitionerId = (_f = (_e = (_d = observation === null || observation === void 0 ? void 0 : observation.performer) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.reference) === null || _f === void 0 ? void 0 : _f.split('/')[1];
    const encounterId = (_h = (_g = observation === null || observation === void 0 ? void 0 : observation.encounter) === null || _g === void 0 ? void 0 : _g.reference) === null || _h === void 0 ? void 0 : _h.split('/')[1];
    const encounter = (yield (0, utils_1.FhirApi)({ url: `/Encounter/${encounterId}` })).data;
    const caseId = (_k = (_j = encounter === null || encounter === void 0 ? void 0 : encounter.identifier) === null || _j === void 0 ? void 0 : _j.find((id) => id.system === "http://hie.org/identifiers/EPID")) === null || _k === void 0 ? void 0 : _k.value;
    let notification = null;
    // check if notification already exists
    notification = yield prisma_1.prisma.notification.findFirst({
        where: {
            practitionerId,
            encounterId,
        }
    });
    if (notification) {
        notification = yield prisma_1.prisma.notification.update({
            where: {
                id: notification.id,
            },
            data: {
                dueDate: parsedDate.toISOString(),
            }
        });
    }
    if (!notification) {
        notification = yield prisma_1.prisma.notification.create({
            data: {
                title: messageTitle,
                body: reminderMessage.replace('{}', caseId),
                practitionerId,
                encounterId,
                investigationDate: new Date(date).toISOString(),
                dueDate: parsedDate.toISOString(),
            }
        });
    }
    const config = yield prisma_1.prisma.notificationRecipient.findFirst({
        where: {
            practitionerId,
        }
    });
    if (!config) {
        return { status: "error", error: "User is missing notication token configuration" };
    }
    return { status: "success", notificationId: notification.id, message: "Notification created successfully" };
});
exports.processAfpObservation = processAfpObservation;
const getUserInfoFromToken = (token) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield fetch(`${AUTH_SERVICE_URL}/provider/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            }
        });
        const data = yield response.json();
        return data;
    }
    catch (error) {
        console.error(error);
        return null;
    }
});
exports.getUserInfoFromToken = getUserInfoFromToken;
/**
 * Send notifications that are due today or earlier
 * Retries FAILED notifications if their due date is within the last 2 days
 */
const sendDueNotifications = () => __awaiter(void 0, void 0, void 0, function* () {
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
        const pendingNotifications = yield prisma_1.prisma.notification.findMany({
            where: {
                status: 'PENDING',
                dueDate: {
                    lte: todayEAT
                }
            }
        });
        // Query for FAILED notifications within the last 2 days (for retry)
        const failedNotifications = yield prisma_1.prisma.notification.findMany({
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
                const recipient = yield prisma_1.prisma.notificationRecipient.findFirst({
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
                const fcmResponse = yield (0, utils_1.sendMediatorRequest)("/notifications/send", {
                    token: recipient.token,
                    title: notification.title,
                    body: notification.body
                });
                if (fcmResponse && fcmResponse.success) {
                    // Update notification status to SENT
                    yield prisma_1.prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'SENT' }
                    });
                    sentCount++;
                    console.log(`[Notification Cron] Successfully sent notification ${notification.id}`);
                }
                else {
                    // Update notification status to FAILED
                    yield prisma_1.prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'FAILED' }
                    });
                    failedCount++;
                    console.error(`[Notification Cron] Failed to send notification ${notification.id}: ${(fcmResponse === null || fcmResponse === void 0 ? void 0 : fcmResponse.error) || 'Unknown error'}`);
                }
            }
            catch (error) {
                console.error(`[Notification Cron] Error processing notification ${notification.id}:`, error);
                // Mark as failed
                try {
                    yield prisma_1.prisma.notification.update({
                        where: { id: notification.id },
                        data: { status: 'FAILED' }
                    });
                    failedCount++;
                }
                catch (updateError) {
                    console.error(`[Notification Cron] Failed to update notification status:`, updateError);
                }
            }
        }
        console.log(`[Notification Cron] Completed processing. Sent: ${sentCount}, Failed: ${failedCount}`);
        return { success: true, sent: sentCount, failed: failedCount };
    }
    catch (error) {
        console.error('[Notification Cron] Error in sendDueNotifications:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
});
exports.sendDueNotifications = sendDueNotifications;

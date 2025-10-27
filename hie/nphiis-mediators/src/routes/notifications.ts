import express, { Request, Response } from 'express';
import { FhirApi, OperationOutcome } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { fcmService } from '../lib/fcm';
import { authenticateUser, AuthenticatedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';


export const router = express.Router();

router.use(express.json() as any);

router.post('/send', async (req: Request, res: Response) => {
    try {
        let { token, title, body } = req.body;
        let response = await fcmService.sendToDevice(token, { title, body });
        return res.status(200).json({ ...response, status: "success" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: "error",
            error: `Failed to send notification - ${JSON.stringify(error)}`
        });
    }
});

router.post('/config', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
        let data = req.body;
        const userInfo = req.userInfo;
        
        // create or update the user's notification settings
        const notificationRecipient = await prisma.notificationRecipient.create({
            data: {
                token: data?.token,
                practitionerId: userInfo?.id,
            }
        });
        const practitioner = (await FhirApi({ url: `/Practitioner/${userInfo.id}` })).data;
        return res.status(200).json({
            status: "success",
            practitioner: {
                ...practitioner, 
                extension: [...(practitioner.extension || []), {
                    url: "http://example.org/fhir/StructureDefinition/notification-recipient",
                    valueReference: {
                        reference: `NotificationRecipient/${notificationRecipient.id}`,
                        display: notificationRecipient.token
                    }
                }]
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: "error",
            error: `Failed to configure notification - ${JSON.stringify(error)}`
        });
    }
});

router.get('/', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userInfo = req.userInfo;
        const notifications = await prisma.notification.findMany({
            where: {
                practitionerId: userInfo.id
            }
        });
        return res.status(200).json({ 
            status: "success", 
            notifications,
            total: notifications.length 
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ 
            status: "error", 
            error: "Failed to get notifications" 
        });
    }
});

export default router;

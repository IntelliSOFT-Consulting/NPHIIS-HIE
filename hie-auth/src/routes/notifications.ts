import express, { Request, Response } from 'express';
import { FhirApi } from '../lib/utils';
import { fcmService } from '../lib/fcm';
import { authenticateUser } from '../lib/middleware';
import { prisma } from '../lib/prisma';

const router = express.Router();
router.use(express.json());

/** Practitioner id for FHIR + DB: prefer FHIR Practitioner id from Keycloak attributes */
function practitionerIdForUser(req: Request): string | undefined {
    const u = (req as any).user;
    return u?.attributes?.fhirPractitionerId?.[0] ?? u?.id ?? u?.sub;
}

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

router.post('/config', authenticateUser, async (req: Request, res: Response) => {
    try {
        let data = req.body;
        const practitionerId = practitionerIdForUser(req);
        
        if (!practitionerId) {
            return res.status(401).json({
                status: "error",
                error: "User information not available"
            });
        }
        
        const notificationRecipient = await prisma.notificationRecipient.create({
            data: {
                token: data?.token,
                practitionerId,
            }
        });
        const practitioner = (await FhirApi({ url: `/Practitioner/${practitionerId}` })).data;
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

router.get('/', authenticateUser, async (req: Request, res: Response) => {
    try {
        const practitionerId = practitionerIdForUser(req);
        
        if (!practitionerId) {
            return res.status(401).json({ 
                status: "error", 
                error: "User information not available" 
            });
        }
        
        const notifications = await prisma.notification.findMany({
            where: {
                practitionerId
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

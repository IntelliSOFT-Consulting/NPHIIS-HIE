import express from 'express';
import { FhirApi, OperationOutcome } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { fcmService } from '../lib/fcm';
import { getUserInfoFromToken } from '../lib/notification';
import { prisma } from '../lib/prisma';


export const router = express.Router();

router.use(express.json() as any);

router.post('/send', async (req, res) => {
    try {
        let { token, title, body } = req.body;
        let response = await fcmService.sendToDevice(token, { title, body });
        res.statusCode = 200;
        res.json(response);
    } catch (error) {
        console.error(error);
        res.statusCode = 500;
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                "severity": "error",
                "code": "exception",
                "details": {
                    "text": `Failed to send notification - ${JSON.stringify(error)}`
                }
            }]
        });
        return;
    }
});

router.post('/config', async (req, res) => {
    try {
        let accessToken = req.headers.authorization?.split(' ')[1];
        let data = req.body;
        if (!accessToken) {
            res.statusCode = 401;
            res.json(OperationOutcome("Unauthorized", "error", "security"));
            return;
        }
        const userInfo = await getUserInfoFromToken(accessToken);
        if (!userInfo) {
            res.statusCode = 401;
            res.json(OperationOutcome("Invalid Bearer token provided", "error", "security"));
            return;
        }
        // create or update the user's notification settings
        const notificationRecipient = await prisma.notificationRecipient.create({
            data: {
                token: data?.token,
                practitionerId: userInfo?.id,
            }
        });
        const practitioner = (await FhirApi({ url: `/Practitioner/${userInfo.id}` })).data;
        return res.status(200).json({...practitioner, extension: [...(practitioner.extension || []), {
            url: "http://example.org/fhir/StructureDefinition/notification-recipient",
            valueReference: {
                reference: `NotificationRecipient/${notificationRecipient.id}`,
                display: notificationRecipient.token
            }
        }]});
        return;
    } catch (error) {
        console.error(error);
        res.statusCode = 500;
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                "severity": "error",
                "code": "exception",
                "details": {
                    "text": `Failed to configure notification - ${JSON.stringify(error)}`
                }
            }]
        });
        return;
    }
});

export default router;

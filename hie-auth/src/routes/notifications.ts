import express, { Request, Response } from 'express';
import { NotificationsApi } from '../lib/utils';
import { authenticateUser } from '../lib/middleware';

const router = express.Router();
router.use(express.json());

/**
 * POST /notifications/send
 * Proxy to nphiis-mediators /notifications/send
 * No authentication required (matches nphiis-mediators behavior)
 */
router.post('/send', async (req: Request, res: Response) => {
    try {
        const response = await NotificationsApi({
            url: '/notifications/send',
            method: 'POST',
            data: JSON.stringify(req.body)
        });

        return res.status(response.statusCode || 200).json(response.data);
    } catch (error) {
        console.error('Error proxying notification send:', error);
        return res.status(500).json({
            status: "error",
            error: `Failed to proxy notification send request - ${JSON.stringify(error)}`
        });
    }
});

/**
 * POST /notifications/config
 * Proxy to nphiis-mediators /notifications/config
 * Requires authentication - validates token in hie-auth, then forwards to nphiis-mediators
 */
router.post('/config', authenticateUser, async (req: Request, res: Response) => {
    try {
        const accessToken = (req as any).accessToken;
        const response = await NotificationsApi({
            url: '/notifications/config',
            method: 'POST',
            data: JSON.stringify(req.body),
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        return res.status(response.statusCode || 200).json(response.data);
    } catch (error) {
        console.error('Error proxying notification config:', error);
        return res.status(500).json({
            status: "error",
            error: `Failed to proxy notification config request - ${JSON.stringify(error)}`
        });
    }
});

/**
 * GET /notifications/
 * Proxy to nphiis-mediators /notifications/
 * Requires authentication - validates token in hie-auth, then forwards to nphiis-mediators
 */
router.get('/', authenticateUser, async (req: Request, res: Response) => {
    try {
        const accessToken = (req as any).accessToken;
        const response = await NotificationsApi({
            url: '/notifications/',
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        return res.status(response.statusCode || 200).json(response.data);
    } catch (error) {
        console.error('Error proxying notifications list:', error);
        return res.status(500).json({
            status: "error",
            error: `Failed to proxy notifications list request - ${JSON.stringify(error)}`
        });
    }
});

export default router;

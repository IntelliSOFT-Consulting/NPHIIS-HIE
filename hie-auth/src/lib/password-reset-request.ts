import { Request, Response } from 'express';
import { sendPasswordResetEmail } from './email';
import { findKeycloakUser } from './keycloak';

const GENERIC_RESPONSE = {
    status: 'success',
    response: 'If the ID number and email match an account, a password reset code has been sent to that email.',
};

/**
 * GET /reset-password?idNumber=&email=
 * Sends a reset code when the ID number and email match an account. Always
 * gives the same answer, so callers can't use it to find out which ID numbers
 * have accounts.
 */
export async function handleResetRequest(req: Request, res: Response) {
    const idNumber = String(req.query.idNumber ?? '').trim();
    const email = String(req.query.email ?? '').trim().toLowerCase();
    if (!idNumber || !email) {
        return res.status(400).json({ status: 'error', error: 'idNumber and email are required' });
    }
    try {
        const user = await findKeycloakUser(idNumber);
        if (user?.email && String(user.email).trim().toLowerCase() === email) {
            const sent = await sendPasswordResetEmail(idNumber);
            if (!sent) console.error(`[reset] failed to send reset code for ${idNumber}`);
        }
    } catch (error) {
        console.error('[reset] request failed:', error);
    }
    return res.status(200).json(GENERIC_RESPONSE);
}

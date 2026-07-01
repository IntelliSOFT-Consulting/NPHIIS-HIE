import { Request, Response, NextFunction } from 'express';
import { FhirApi } from '../lib/utils';
import { findKeycloakUser, validateBearerToken, validateUserAuthentication } from '../lib/keycloak';
import { getRoleFromPractitioner } from '../lib/practitioner-role';

function internalApiKeyMatches(req: Request): boolean {
  const expected = process.env.INTERNAL_SUBSCRIPTION_API_KEY;
  if (!expected?.trim()) return false;
  const provided = req.headers['x-internal-api-key'];
  const key = Array.isArray(provided) ? provided[0] : provided;
  return key === expected;
}

/**
 * Accepts X-Internal-Api-Key or a bearer token for ADMINISTRATOR / SUPERUSER.
 */
export async function requireInternalApiKeyOrAdminBearer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> {
  if (internalApiKeyMatches(req)) {
    return next();
  }

  const token = validateBearerToken(req);
  if (!token) {
    return res.status(401).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'security', details: { text: 'Unauthorized' } }],
    });
  }

  const currentUser = await validateUserAuthentication(token);
  if (!currentUser) {
    return res.status(401).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'security', details: { text: 'Invalid Bearer token' } }],
    });
  }

  (req as any).user = currentUser;
  const userInfo = await findKeycloakUser(currentUser.preferred_username);
  if (!userInfo?.id) {
    return res.status(403).json({ status: 'error', error: 'User not found' });
  }

  const practitioner = (await FhirApi({ url: `/Practitioner/${userInfo.id}` })).data;
  const role = getRoleFromPractitioner(practitioner) ?? 'ADMINISTRATOR';
  if (role !== 'ADMINISTRATOR' && role !== 'SUPERUSER') {
    return res.status(403).json({ status: 'error', error: 'Administrator access required' });
  }

  next();
}

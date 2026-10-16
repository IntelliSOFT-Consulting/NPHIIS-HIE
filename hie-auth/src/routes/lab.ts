import express, { Request, Response, NextFunction } from 'express';
import { OperationOutcome } from '../lib/utils';
import { parseLabMessages } from '../lib/nphl-lab';
import { applyLabUpdates, pollLabStagingResults, pollOpenNphlTasks } from '../lib/nphl-lab-sync';
import { attachSubscriptionAuditLog } from '../lib/subscription-audit';
import { checkLabApiKey, checkLabSignature } from '../lib/lab-auth';
import { authenticateUser } from '../lib/middleware';
import { findKeycloakUser } from '../lib/keycloak';
import { FhirApi } from '../lib/utils';
import { resolvePractitionerAssignment } from '../lib/practitioner-role';

const router = express.Router();

/** The lab system's API key, checked before the body is read. See lib/lab-auth. */
function requireLabApiKey(req: Request, res: Response, next: NextFunction): void {
  const auth = checkLabApiKey(req.headers);
  if (!auth.ok) {
    res.status(auth.status).json(OperationOutcome(auth.error));
    return;
  }
  next();
}

/** Keeps the raw body, which the signature is computed over. */
const labJson = express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
}) as any;

/** The body signature, when LAB_RESULTS_HMAC_SECRET is set. */
function requireLabSignature(req: Request, res: Response, next: NextFunction): void {
  const auth = checkLabSignature(req.headers, (req as any).rawBody);
  if (!auth.ok) {
    res.status(auth.status).json(OperationOutcome(auth.error));
    return;
  }
  next();
}

const fromLab = [requireLabApiKey, labJson, requireLabSignature];

/**
 * Everything the lab system sends about submitted specimens: results, rejections, "received"
 * and "in-testing" progress, and notes, matched to Tasks by the tube label. Body: an array or
 * { data: [...] }; a message without messageType is a result. See parseLabMessages and
 * docs/deployment.md. Each message gets an outcome; ones that cannot be used are listed in
 * `invalid` by their index in the batch.
 */
router.post('/results', ...fromLab, async (req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(res, { route: 'lab-results-push', resourceType: 'Task', resourceId: 'batch' }, start);
  const { updates, invalid } = parseLabMessages(req.body);
  if (!updates.length) {
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = 'No usable messages';
    res.locals.subscriptionDetail = { received: 0, invalid: invalid.slice(0, 100) };
    return res.status(400).json({ ...OperationOutcome('No usable messages'), invalid });
  }
  try {
    const outcomes = await applyLabUpdates(updates);
    const unmatched = outcomes.filter((o) => !o.matched);
    res.locals.subscriptionOutcome = unmatched.length || invalid.length ? 'error' : 'success';
    res.locals.subscriptionDetail = {
      received: updates.length,
      unmatched: unmatched.length,
      invalid: invalid.slice(0, 100),
      results: outcomes.slice(0, 200),
    };
    if (unmatched.length || invalid.length) {
      res.locals.subscriptionErrorMessage = `${unmatched.length} update(s) did not match a specimen; ${invalid.length} message(s) invalid`;
    }
    return res.status(200).json({ message: 'Results processed', received: updates.length, results: outcomes, invalid });
  } catch (error) {
    console.error('lab results push:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(500).json(OperationOutcome(error));
  }
});

/** Roles that can see specimen tracking in the admin portal (SPECIMENS_VIEW there). */
const PULL_ROLES = new Set([
  'ADMINISTRATOR',
  'SUPERUSER',
  'LAB_TECHNICIAN',
  'NATIONAL_LAB',
  'NATIONAL_FOCAL_PERSON',
  'NATIONAL_VIEWER',
]);

/** Resolves the user's NPHIIS role the way GET /provider/me does. */
async function requirePullRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userInfo = await findKeycloakUser((req as any).user?.preferred_username);
    if (!userInfo?.id) {
      res.status(403).json(OperationOutcome('User not found'));
      return;
    }
    const practitioner = (await FhirApi({ url: `/Practitioner/${userInfo.id}` })).data;
    const role = (await resolvePractitionerAssignment(userInfo.id, practitioner))?.role ?? 'ADMINISTRATOR';
    if (!PULL_ROLES.has(role.toUpperCase())) {
      res.status(403).json(OperationOutcome('Specimen tracking access required'));
      return;
    }
    next();
  } catch (error) {
    console.error('lab pull role check:', error);
    res.status(500).json(OperationOutcome(error));
  }
}

/**
 * Pulls results now instead of waiting for the scheduled polls: re-posts open cases to NPHL
 * (whose response carries the latest results) and reads ready results from the lab staging API.
 * A source that is not configured is skipped; one that is already running reports `busy`.
 */
router.post('/pull', authenticateUser, requirePullRole, async (_req: Request, res: Response) => {
  try {
    const nphl = process.env.NPHL_SURVEILLANCE_API_KEY
      ? (await pollOpenNphlTasks()) ?? { busy: true }
      : { skipped: 'NPHL_SURVEILLANCE_API_KEY is not configured' };
    const staging = process.env.LAB_STAGING_API_KEY
      ? (await pollLabStagingResults()) ?? { busy: true }
      : { skipped: 'LAB_STAGING_API_KEY is not configured' };
    return res.status(200).json({ nphl, staging });
  } catch (error) {
    console.error('lab pull:', error);
    return res.status(500).json(OperationOutcome(error));
  }
});

export default router;

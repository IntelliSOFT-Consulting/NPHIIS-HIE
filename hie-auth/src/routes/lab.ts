import express, { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { OperationOutcome } from '../lib/utils';
import { parseLabUpdates } from '../lib/nphl-lab';
import { applyLabUpdates } from '../lib/nphl-lab-sync';
import { attachSubscriptionAuditLog } from '../lib/subscription-audit';

const router = express.Router();
router.use(express.json({ limit: '10mb' }) as any);

/** The lab system authenticates with LAB_RESULTS_API_KEY in x-api-key (or as a Bearer token). */
function requireLabApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.LAB_RESULTS_API_KEY?.trim();
  if (!expected) {
    res.status(503).json(OperationOutcome('LAB_RESULTS_API_KEY is not configured'));
    return;
  }
  const header = req.headers['x-api-key'];
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const provided = (Array.isArray(header) ? header[0] : header) ?? bearer ?? '';
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json(OperationOutcome('Unauthorized'));
    return;
  }
  next();
}

/**
 * Results and rejections from the lab system, matched to submitted specimens by tube label.
 * Body: an array or { data: [...] }; see parseLabUpdates and docs/deployment.md for the shapes.
 */
router.post('/results', requireLabApiKey, async (req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(res, { route: 'lab-results-push', resourceType: 'Task', resourceId: 'batch' }, start);
  const updates = parseLabUpdates(req.body);
  if (!updates.length) {
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = 'No results or rejections with a specimen ID';
    return res.status(400).json(OperationOutcome('No results or rejections with a specimen ID'));
  }
  try {
    const outcomes = await applyLabUpdates(updates);
    const unmatched = outcomes.filter((o) => !o.matched);
    res.locals.subscriptionOutcome = unmatched.length ? 'error' : 'success';
    res.locals.subscriptionDetail = { received: updates.length, unmatched: unmatched.length };
    if (unmatched.length) res.locals.subscriptionErrorMessage = `${unmatched.length} update(s) did not match a specimen`;
    return res.status(200).json({ message: 'Results processed', received: updates.length, results: outcomes });
  } catch (error) {
    console.error('lab results push:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(500).json(OperationOutcome(error));
  }
});

export default router;

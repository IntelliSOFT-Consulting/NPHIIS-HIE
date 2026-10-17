import express, { Request, Response } from 'express';
import { ActivityAction, patientActivityResourceTypes, recordActivity } from '../lib/patient-activity';
import { OperationOutcome } from '../lib/utils';

/**
 * HAPI REST-hook callbacks for patient-related resources (PUT on create/update, DELETE on delete).
 * Always answers 200 at once: the work is queued, so a HAPI retry would gain nothing. The body must be
 * a FHIR resource (OperationOutcome): HAPI parses it and retries the delivery when it can't.
 * Own parser so large FHIR payloads (and application/fhir+json) don't fail with 413/empty bodies.
 */
const router = express.Router();
router.use(express.json({ limit: '10mb', type: ['application/json', 'application/fhir+json'] }) as any);

function handle(action: ActivityAction) {
  return (req: Request, res: Response) => {
    const { type, id } = req.params;
    if (!patientActivityResourceTypes().includes(type)) {
      return res.status(200).json(OperationOutcome(`${type}/${id}: ignored`, 'information', 'informational'));
    }
    const status = recordActivity(type, id, action, action === 'upsert' ? req.body : undefined);
    return res.status(200).json(OperationOutcome(`${type}/${id}: ${status}`, 'information', 'informational'));
  };
}

router.put('/notifications/:type/:id', handle('upsert'));
router.post('/notifications/:type/:id', handle('upsert'));
router.delete('/notifications/:type/:id', handle('delete'));

export default router;

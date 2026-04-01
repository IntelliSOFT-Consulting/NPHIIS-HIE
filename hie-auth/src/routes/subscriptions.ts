import express, { Request, Response, NextFunction } from 'express';
import { FhirApi, OperationOutcome } from '../lib/utils';
import { processAfpObservation } from '../lib/notification';
import { assignEpidForEncounter } from '../lib/epid-assignment';
import { attachSubscriptionAuditLog } from '../lib/subscription-audit';
import { requireInternalApiKey } from '../middleware/internal-api-key';
import { orderEncounterIdsByV1 } from '../lib/fhir-resource-history';
import { runEncounterBackfillJob } from '../lib/encounter-backfill-job';

const router = express.Router();
router.use(express.json() as any);

const MAX_BATCH_RETRY = 50;

type AlreadyEpidResponseMode = '400' | '200skipped';

async function assignIdsHandler(
  req: Request,
  res: Response,
  options?: { alreadyEpidResponse?: AlreadyEpidResponseMode }
): Promise<void | Response> {
  try {
    const data = req.body;
    const result = await assignEpidForEncounter(data);

    if (result.kind === 'already_official_epid') {
      if (options?.alreadyEpidResponse === '200skipped') {
        res.locals.subscriptionOutcome = 'skipped';
        return res.status(200).json(
          OperationOutcome('Patient already has an official id with the system http://hie.org/identifiers/EPID', 'information')
        );
      }
      res.locals.subscriptionOutcome = 'error';
      return res.status(400).json(
        OperationOutcome('Patient already has an official id with the system http://hie.org/identifiers/EPID')
      );
    }

    if (result.kind === 'error') {
      console.error(result.error);
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = String(result.error);
      return res.status(400).json(OperationOutcome(result.error));
    }

    res.locals.subscriptionOutcome = 'success';
    return res.status(200).json(result.encounter);
  } catch (error) {
    console.error(error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(400).json(OperationOutcome(error));
  }
}

router.put('/encounters/notifications/Encounter/:id', async (req: Request, res: Response) => {
  console.log('Encounter subscription triggered for ID:', req.params.id);
  const start = Date.now();
  attachSubscriptionAuditLog(
    res,
    { route: 'encounter-notification', resourceType: 'Encounter', resourceId: req.params.id },
    start
  );

  try {
    const { id } = req.params;
    const data = (await FhirApi({ url: `/Encounter/${id}` })).data;

    const patient = (await FhirApi({ url: `/Patient/${data?.subject?.reference?.split('/')[1]}` })).data;

    if (patient?.identifier?.some((idEnt: any) => idEnt.system === 'http://hie.org/identifiers/EPID' && idEnt.use === 'official')) {
      res.locals.subscriptionOutcome = 'skipped';
      return res.status(200).json(
        OperationOutcome('Patient already has an official id with the system http://hie.org/identifiers/EPID', 'information')
      );
    }

    (req as any).body = data;
    return assignIdsHandler(req, res, { alreadyEpidResponse: '200skipped' });
  } catch (error) {
    console.error('Error in Encounter subscription:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    res.statusCode = 400;
    res.json(OperationOutcome(error));
    return;
  }
});

/**
 * Manual trigger for full Encounter backfill (EPID + AFP follow-up), same logic as the optional cron.
 * Requires X-Internal-Api-Key. Returns 409 if a run is already in progress.
 */
router.post('/encounters/backfill-run', requireInternalApiKey, async (req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(
    res,
    { route: 'backfill-run', resourceType: 'Encounter', resourceId: 'all' },
    start
  );
  try {
    const stats = await runEncounterBackfillJob();
    if (stats.skippedBecauseAlreadyRunning) {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = 'Encounter backfill already running';
      return res.status(409).json(OperationOutcome('Encounter backfill is already running', 'error'));
    }
    res.locals.subscriptionOutcome = 'success';
    return res.status(200).json({ status: 'completed', stats });
  } catch (error) {
    console.error('backfill-run:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(500).json(OperationOutcome(error));
  }
});

router.post('/encounters/assign-ids', async (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  attachSubscriptionAuditLog(res, { route: 'assign-ids', resourceType: 'Encounter', resourceId: req.body?.id }, start);
  try {
    await assignIdsHandler(req, res, { alreadyEpidResponse: '400' });
  } catch (e) {
    next(e);
  }
});

router.post('/encounters/retry-epid', requireInternalApiKey, async (req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(res, { route: 'retry-epid', resourceType: 'Encounter', resourceId: req.body?.encounterId }, start);

  try {
    const encounterId = req.body?.encounterId as string | undefined;
    const encounterIds = req.body?.encounterIds as string[] | undefined;

    if (encounterIds !== undefined && Array.isArray(encounterIds)) {
      if (encounterIds.length === 0) {
        res.locals.subscriptionOutcome = 'error';
        res.locals.subscriptionErrorMessage = 'encounterIds must be non-empty';
        return res.status(400).json(OperationOutcome('encounterIds must be a non-empty array'));
      }
      if (encounterIds.length > MAX_BATCH_RETRY) {
        res.locals.subscriptionOutcome = 'error';
        res.locals.subscriptionErrorMessage = `At most ${MAX_BATCH_RETRY} encounters per request`;
        return res.status(400).json(OperationOutcome(`At most ${MAX_BATCH_RETRY} encounters per request`));
      }

      const normalizedIds = [...new Set(encounterIds.map((x) => String(x).trim()).filter(Boolean))];
      const orderedEncounterIds = await orderEncounterIdsByV1(normalizedIds);

      const results: { encounterId: string; ok: boolean; error?: string }[] = [];
      for (const eid of orderedEncounterIds) {
        const enc = (await FhirApi({ url: `/Encounter/${eid}` })).data;
        if (!enc?.id || enc.resourceType !== 'Encounter') {
          results.push({ encounterId: eid, ok: false, error: 'Encounter not found' });
          continue;
        }
        const patient = (await FhirApi({ url: `/Patient/${enc?.subject?.reference?.split('/')[1]}` })).data;
        if (patient?.identifier?.some((x: any) => x.system === 'http://hie.org/identifiers/EPID' && x.use === 'official')) {
          results.push({ encounterId: eid, ok: true });
          continue;
        }
        const r = await assignEpidForEncounter(enc);
        if (r.kind === 'success') {
          results.push({ encounterId: eid, ok: true });
        } else if (r.kind === 'already_official_epid') {
          results.push({ encounterId: eid, ok: true });
        } else {
          results.push({ encounterId: eid, ok: false, error: String(r.error) });
        }
      }

      const anyFailed = results.some((r) => !r.ok);
      res.locals.subscriptionOutcome = anyFailed ? 'error' : 'success';
      if (anyFailed) {
        res.locals.subscriptionDetail = { results, orderedEncounterIds };
        res.locals.subscriptionErrorMessage = 'One or more encounters failed';
      }
      return res.status(200).json({ results, orderedEncounterIds });
    }

    if (!encounterId || typeof encounterId !== 'string') {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = 'encounterId or encounterIds required';
      return res.status(400).json(OperationOutcome('Provide encounterId (string) or encounterIds (string array)'));
    }

    const data = (await FhirApi({ url: `/Encounter/${encounterId}` })).data;
    if (!data?.id || data.resourceType !== 'Encounter') {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = 'Encounter not found';
      return res.status(404).json(OperationOutcome('Encounter not found'));
    }

    const patient = (await FhirApi({ url: `/Patient/${data?.subject?.reference?.split('/')[1]}` })).data;
    if (patient?.identifier?.some((x: any) => x.system === 'http://hie.org/identifiers/EPID' && x.use === 'official')) {
      res.locals.subscriptionOutcome = 'skipped';
      return res.status(200).json(
        OperationOutcome('Patient already has an official id with the system http://hie.org/identifiers/EPID', 'information')
      );
    }

    const result = await assignEpidForEncounter(data);
    if (result.kind === 'already_official_epid') {
      res.locals.subscriptionOutcome = 'skipped';
      return res.status(200).json(
        OperationOutcome('Patient already has an official id with the system http://hie.org/identifiers/EPID', 'information')
      );
    }
    if (result.kind === 'error') {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = String(result.error);
      return res.status(400).json(OperationOutcome(result.error));
    }

    res.locals.subscriptionOutcome = 'success';
    return res.status(200).json(result.encounter);
  } catch (error) {
    console.error(error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(400).json(OperationOutcome(error));
  }
});

router.put('/observations/notifications/Observation/:id', async (req: Request, res: Response) => {
  console.log('Observation subscription triggered for ID:', req.params.id);
  const start = Date.now();
  attachSubscriptionAuditLog(
    res,
    { route: 'observation-notification', resourceType: 'Observation', resourceId: req.params.id },
    start
  );

  try {
    const { id } = req.params;
    const data = (await FhirApi({ url: `/Observation/${id}` })).data;
    const response = await processAfpObservation(data);
    if (response?.status === 'success') {
      res.locals.subscriptionOutcome = 'success';
      return res.status(200).json(OperationOutcome('AFP Follow Up processed successfully', 'information'));
    }
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = response?.error ?? 'Failed to process AFP Follow Up';
    return res.status(400).json(OperationOutcome(response?.error ?? 'Failed to process AFP Follow Up', 'error'));
  } catch (error) {
    console.error('Error in Observation subscription:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(400).json(OperationOutcome('Failed to process AFP Follow Up', 'error'));
  }
});

router.post('/observations/afp-follow-up', async (req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(res, { route: 'afp-follow-up', resourceType: 'Observation', resourceId: req.body?.id }, start);

  try {
    const data = req.body;
    const response = await processAfpObservation(data);
    if (response?.status === 'success') {
      res.locals.subscriptionOutcome = 'success';
      return res.status(200).json(OperationOutcome('Notification created successfully', 'information'));
    }
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = response?.error ?? 'Failed to create notification';
    return res.status(400).json(OperationOutcome(response?.error ?? 'Failed to create notification', 'error'));
  } catch (error) {
    console.error(error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(400).json(OperationOutcome('Failed to create notification', 'error'));
  }
});

export default router;

import express, { Request, Response, NextFunction } from 'express';
import { FhirApi, OperationOutcome } from '../lib/utils';
import { processAfpObservation } from '../lib/notification';
import { assignEpidForEncounter, promoteConvertedVhfContact } from '../lib/epid-assignment';
import { attachSubscriptionAuditLog } from '../lib/subscription-audit';
import { VHF_CONTACT_LINK_IDS } from '../lib/vhf-link-ids';
import { requireInternalApiKey } from '../middleware/internal-api-key';
import { requireInternalApiKeyOrAdminBearer } from '../middleware/internal-api-key-or-admin';
import { authenticateUser } from '../lib/middleware';
import { findKeycloakUser } from '../lib/keycloak';
import { isAdminPractitioner } from '../lib/practitioner-role';
import { prisma } from '../lib/prisma';
import { orderEncounterIdsByV1 } from '../lib/fhir-resource-history';
import { runEncounterBackfillJob } from '../lib/encounter-backfill-job';
import { runEpidCorrectionBackfillJob } from '../lib/epid-correction-backfill';
import { getEpidValueFromEncounter, patientHasOfficialEpid } from '../lib/epid-utils';
import { isLabResultEncounter, notifyLabResultToCaseSubmitter } from '../lib/lab-result-notification';
import { scanEncountersMissingEpid } from '../lib/missing-epid-encounters';
import { backfillScreeningResponses } from '../lib/screening-backfill';
import { CaseSyncResult, pollLabStagingResults, queueSpecimenSync, syncCaseNow, syncSpecimenToNphl } from '../lib/nphl-lab-sync';

const router = express.Router();
router.use(express.json() as any);

const MAX_BATCH_RETRY = 50;

type AlreadyEpidResponseMode = '400' | '200skipped';

async function assignIdsHandler(
  req: Request,
  res: Response,
  options?: { alreadyEpidResponse?: AlreadyEpidResponseMode; notify?: boolean },
): Promise<void | Response> {
  try {
    const data = req.body;
    const result = await assignEpidForEncounter(data, {
      notify: options?.notify === true,
    });

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
      res.locals.subscriptionErrorMessage = String(result.error);
      /** A 4xx makes HAPI redeliver ~21 times; only invite that when a retry could succeed. */
      if (result.retryable === false && options?.alreadyEpidResponse === '200skipped') {
        res.locals.subscriptionOutcome = 'skipped';
        res.locals.subscriptionDetail = { kind: 'not_retryable', reason: String(result.error) };
        return res.status(200).json(OperationOutcome(result.error, 'information'));
      }
      res.locals.subscriptionOutcome = 'error';
      return res.status(400).json(OperationOutcome(result.error));
    }

    res.locals.subscriptionOutcome = 'success';
    const epid = getEpidValueFromEncounter(result.encounter);
    if (epid) {
      res.locals.subscriptionDetail = { epid };
    }
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

    /** Official EPIDs may be typed-only (Identifier.type.coding) — do not rely on Identifier.system alone. */
    if (patientHasOfficialEpid(patient)) {
      if (isLabResultEncounter(data)) {
        void notifyLabResultToCaseSubmitter(data, patient).catch((e) =>
          console.error('[LabResultNotify] Background notification failed:', e),
        );
        res.locals.subscriptionOutcome = 'success';
        res.locals.subscriptionDetail = { kind: 'lab_result_notification' };
        return res.status(200).json(
          OperationOutcome('Lab result notification queued for case submitter', 'information')
        );
      }
      res.locals.subscriptionOutcome = 'skipped';
      return res.status(200).json(
        OperationOutcome('Patient already has an official id with the system http://hie.org/identifiers/EPID', 'information')
      );
    }

    /** Lab results and contact follow-ups hang off a case Encounter; the EPID belongs to that case. */
    if (data?.partOf?.reference) {
      res.locals.subscriptionOutcome = 'skipped';
      res.locals.subscriptionDetail = { kind: 'child_encounter', partOf: data.partOf.reference };
      return res.status(200).json(
        OperationOutcome(`Child of ${data.partOf.reference}; EPIDs are assigned on the case Encounter`, 'information')
      );
    }

    (req as any).body = data;
    return assignIdsHandler(req, res, { alreadyEpidResponse: '200skipped', notify: true });
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

/**
 * Recompute EPID location prefixes for already-assigned EPIDs (multi-word sub-county fix).
 * Default dry-run. Set `dryRun: false` in body to apply corrections.
 * Requires X-Internal-Api-Key.
 */
router.post('/encounters/epid-correction-backfill', requireInternalApiKey, async (req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(
    res,
    { route: 'epid-correction-backfill', resourceType: 'Encounter', resourceId: 'all' },
    start,
  );
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const dryRun = body.dryRun !== false;
    const limit =
      body.limit != null ? Math.max(0, parseInt(String(body.limit), 10) || 0) : undefined;
    const fromDate = typeof body.fromDate === 'string' ? body.fromDate : undefined;
    const toDate = typeof body.toDate === 'string' ? body.toDate : undefined;

    const stats = await runEpidCorrectionBackfillJob({
      dryRun,
      limit: limit && limit > 0 ? limit : undefined,
      fromDate,
      toDate,
    });

    if (stats.skippedBecauseAlreadyRunning) {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = 'EPID correction backfill already running';
      return res.status(409).json(
        OperationOutcome('EPID correction backfill is already running', 'error'),
      );
    }

    res.locals.subscriptionOutcome = 'success';
    return res.status(200).json({ status: dryRun ? 'dry-run' : 'completed', stats });
  } catch (error) {
    console.error('epid-correction-backfill:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(500).json(OperationOutcome(error));
  }
});

/**
 * Rewrite screening QuestionnaireResponses stored before they used the vhf-case.json linkIds.
 * Default dry-run (counts what would change). Set `dryRun: false` in body to apply.
 * Requires X-Internal-Api-Key.
 */
router.post('/screenings/vhf-case-backfill', requireInternalApiKey, async (req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(
    res,
    { route: 'screening-vhf-case-backfill', resourceType: 'QuestionnaireResponse', resourceId: 'all' },
    start,
  );
  try {
    const dryRun = req.body?.dryRun !== false;
    const stats = await backfillScreeningResponses({ dryRun });
    if (stats.skippedBecauseAlreadyRunning) {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = 'Screening backfill already running';
      return res.status(409).json(OperationOutcome('Screening backfill is already running', 'error'));
    }
    res.locals.subscriptionOutcome = 'success';
    return res.status(200).json({ status: dryRun ? 'dry-run' : 'completed', stats });
  } catch (error) {
    console.error('screening-vhf-case-backfill:', error);
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

router.get('/encounters/missing-epid', authenticateUser, async (req: Request, res: Response) => {
  try {
    const ok = await requireAdminFromRequest(req, res);
    if (!ok) return;

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const cursor =
      typeof req.query.cursor === 'string' && req.query.cursor.trim()
        ? req.query.cursor.trim()
        : null;

    const { encounters, nextCursor, hasMore } = await scanEncountersMissingEpid({
      limit,
      cursor,
    });

    return res.status(200).json({
      status: 'success',
      encounters,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('Error fetching encounters missing EPID:', error);
    return res.status(500).json(OperationOutcome('Failed to fetch encounters missing EPID'));
  }
});

router.post('/encounters/retry-epid', requireInternalApiKeyOrAdminBearer, async (req: Request, res: Response) => {
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
        if (patientHasOfficialEpid(patient)) {
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
    if (patientHasOfficialEpid(patient)) {
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
    const epid = getEpidValueFromEncounter(result.encounter);
    if (epid) {
      res.locals.subscriptionDetail = { epid };
    }
    return res.status(200).json(result.encounter);
  } catch (error) {
    console.error(error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(400).json(OperationOutcome(error));
  }
});

router.put('/observations/vhf-case-type/notifications/Observation/:id', async (req: Request, res: Response) => {
  console.log('VHF case type Observation subscription triggered for ID:', req.params.id);
  const start = Date.now();
  attachSubscriptionAuditLog(
    res,
    { route: 'vhf-case-type-notification', resourceType: 'Observation', resourceId: req.params.id },
    start
  );

  try {
    const { id } = req.params;
    const data = (await FhirApi({ url: `/Observation/${id}` })).data;

    const code = data?.code?.coding?.[0]?.code;
    if (code !== VHF_CONTACT_LINK_IDS.caseType) {
      res.locals.subscriptionOutcome = 'skipped';
      return res.status(200).json(OperationOutcome('Not a VHF case type observation', 'information'));
    }

    const encounterId = data?.encounter?.reference?.split('/')[1];
    if (!encounterId) {
      res.locals.subscriptionOutcome = 'skipped';
      return res.status(200).json(OperationOutcome('Observation has no encounter reference', 'information'));
    }

    const result = await promoteConvertedVhfContact(encounterId);

    if (result.kind === 'skipped') {
      res.locals.subscriptionOutcome = 'skipped';
      res.locals.subscriptionDetail = { reason: result.reason };
      return res.status(200).json(OperationOutcome(result.reason, 'information'));
    }
    if (result.kind === 'error') {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = String(result.error);
      return res.status(400).json(OperationOutcome(result.error));
    }
    res.locals.subscriptionOutcome = 'success';
    res.locals.subscriptionDetail = { caseId: result.caseId };
    return res.status(200).json(OperationOutcome(`Contact promoted to case (${result.caseId})`, 'information'));
  } catch (error) {
    console.error('Error in VHF case type subscription:', error);
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

function sendCaseSyncResult(res: Response, result: CaseSyncResult) {
  if (result.kind === 'skipped') {
    res.locals.subscriptionOutcome = 'skipped';
    return res.status(200).json(OperationOutcome(result.reason, 'information'));
  }
  if (result.kind === 'error') {
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = result.error;
    return res.status(400).json(OperationOutcome(result.error));
  }
  res.locals.subscriptionOutcome = result.submitted ? 'success' : 'error';
  res.locals.subscriptionDetail = { caseEncounterId: result.caseEncounterId, specimens: result.specimens };
  if (!result.submitted) {
    res.locals.subscriptionErrorMessage = 'Specimens not submitted to NPHL; see Task statusReason';
  }
  return res.status(200).json(result);
}

/**
 * Queues the specimen's case for NPHL and answers HAPI at once, so a slow NPHL never holds
 * delivery threads or triggers HAPI retries. The sync itself is logged as route nphl-case-sync.
 */
router.put('/specimens/notifications/Specimen/:id', async (req: Request, res: Response) => {
  console.log('Specimen subscription triggered for ID:', req.params.id);
  const start = Date.now();
  attachSubscriptionAuditLog(
    res,
    { route: 'specimen-notification', resourceType: 'Specimen', resourceId: req.params.id },
    start
  );
  try {
    const result = await queueSpecimenSync(req.params.id);
    if (result.kind === 'queued') {
      res.locals.subscriptionOutcome = 'success';
      res.locals.subscriptionDetail = { caseEncounterId: result.caseEncounterId, queue: result.status };
      return res.status(200).json(OperationOutcome(`Case ${result.caseEncounterId} ${result.status} for NPHL`, 'information'));
    }
    return sendCaseSyncResult(res, result);
  } catch (error) {
    console.error('Error in Specimen subscription:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(400).json(OperationOutcome(error));
  }
});

/** Manual re-submission of one case to NPHL: body { specimenId } or { encounterId }. */
router.post('/specimens/nphl-sync', requireInternalApiKeyOrAdminBearer, async (req: Request, res: Response) => {
  const start = Date.now();
  const specimenId = typeof req.body?.specimenId === 'string' ? req.body.specimenId.trim() : '';
  const encounterId = typeof req.body?.encounterId === 'string' ? req.body.encounterId.trim() : '';
  attachSubscriptionAuditLog(
    res,
    { route: 'nphl-sync', resourceType: specimenId ? 'Specimen' : 'Encounter', resourceId: specimenId || encounterId },
    start
  );
  if (!specimenId && !encounterId) {
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = 'specimenId or encounterId required';
    return res.status(400).json(OperationOutcome('Provide specimenId or encounterId'));
  }
  try {
    const result = specimenId ? await syncSpecimenToNphl(specimenId) : await syncCaseNow(encounterId);
    return sendCaseSyncResult(res, result);
  } catch (error) {
    console.error('nphl-sync:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(500).json(OperationOutcome(error));
  }
});

/** Pulls ready results from the NPHL lab staging API now, instead of waiting for the cron. */
router.post('/specimens/lab-staging-pull', requireInternalApiKeyOrAdminBearer, async (_req: Request, res: Response) => {
  const start = Date.now();
  attachSubscriptionAuditLog(res, { route: 'lab-staging-pull', resourceType: 'Task', resourceId: 'batch' }, start);
  try {
    const result = await pollLabStagingResults();
    if (!result) {
      res.locals.subscriptionOutcome = 'skipped';
      return res.status(409).json(OperationOutcome('A lab staging pull is already running'));
    }
    if ('error' in result) {
      res.locals.subscriptionOutcome = 'error';
      res.locals.subscriptionErrorMessage = result.error;
      return res.status(502).json(OperationOutcome(result.error));
    }
    res.locals.subscriptionOutcome = 'success';
    res.locals.subscriptionDetail = result;
    return res.status(200).json(result);
  } catch (error) {
    console.error('lab-staging-pull:', error);
    res.locals.subscriptionOutcome = 'error';
    res.locals.subscriptionErrorMessage = String(error);
    return res.status(500).json(OperationOutcome(error));
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

const VALID_OUTCOMES = ['success', 'error', 'skipped'] as const;
const VALID_NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
const VALID_NOTIFICATION_TYPES = [
  'AFP_FOLLOW_UP',
  'CASE_SUBMISSION',
  'LAB_RESULT',
  'VHF_CONTACT_FOLLOW_UP',
  'VHF_CONTACT_MISSED',
] as const;

async function requireAdminFromRequest(req: Request, res: Response): Promise<boolean> {
  const currentUser = (req as any).user;
  const kcUser = await findKeycloakUser(currentUser.preferred_username);
  if (!kcUser?.id) {
    res.status(403).json({ status: 'error', error: 'User not found' });
    return false;
  }
  const practitioner = (await FhirApi({ url: `/Practitioner/${kcUser.id}` })).data;
  if (!practitioner) {
    res.status(404).json({ status: 'error', error: 'Practitioner not found' });
    return false;
  }
  if (!(await isAdminPractitioner(kcUser.id, practitioner))) {
    res.status(403).json({ status: 'error', error: 'Administrator access required' });
    return false;
  }
  return true;
}

router.get('/callback-logs', authenticateUser, async (req: Request, res: Response) => {
  try {
    const ok = await requireAdminFromRequest(req, res);
    if (!ok) return;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};

    const outcome = req.query.outcome as string | undefined;
    if (outcome && VALID_OUTCOMES.includes(outcome as (typeof VALID_OUTCOMES)[number])) {
      where.outcome = outcome;
    }

    const routeFilter = req.query.route as string | undefined;
    if (routeFilter && routeFilter.trim()) {
      where.route = routeFilter.trim();
    }

    const resourceType = req.query.resourceType as string | undefined;
    if (resourceType && resourceType.trim()) {
      where.resourceType = resourceType.trim();
    }

    const search = req.query.search as string | undefined;
    if (search && search.trim()) {
      where.resourceId = { contains: search.trim(), mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      prisma.fhirSubscriptionCallbackLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.fhirSubscriptionCallbackLog.count({ where }),
    ]);

    return res.status(200).json({
      status: 'success',
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    });
  } catch (error) {
    console.error('Error fetching callback logs:', error);
    return res.status(500).json(OperationOutcome('Failed to fetch callback logs'));
  }
});

router.get('/notification-logs', authenticateUser, async (req: Request, res: Response) => {
  try {
    const ok = await requireAdminFromRequest(req, res);
    if (!ok) return;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};

    const status = req.query.status as string | undefined;
    if (status && VALID_NOTIFICATION_STATUSES.includes(status as (typeof VALID_NOTIFICATION_STATUSES)[number])) {
      where.status = status;
    }

    const type = req.query.type as string | undefined;
    if (type && VALID_NOTIFICATION_TYPES.includes(type as (typeof VALID_NOTIFICATION_TYPES)[number])) {
      where.type = type;
    }

    const search = req.query.search as string | undefined;
    if (search && search.trim()) {
      where.encounterId = { contains: search.trim(), mode: 'insensitive' };
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return res.status(200).json({
      status: 'success',
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    });
  } catch (error) {
    console.error('Error fetching notification logs:', error);
    return res.status(500).json(OperationOutcome('Failed to fetch notification logs'));
  }
});

export default router;

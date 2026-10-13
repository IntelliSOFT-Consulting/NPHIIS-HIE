import { NextRequest, NextResponse } from 'next/server';
import {
  forbidden,
  resolveUserProfile,
  unauthorized,
  verifyToken,
  type UserProfile,
  type VerifiedToken,
} from '@/lib/server-auth';
import { canAccess, hasAnyRole } from '@/lib/roles';
import { getLabForm, labResultReasons } from '@/lib/questionnaires';
import {
  RowMappingError,
  buildLabSubmissionBundle,
  hasFormValues,
} from '@/lib/lab-submission';
import {
  fetchFullPatient,
  findExistingLabResult,
  getPatientRecordType,
  lookupPatientByEpid,
} from '@/lib/fhir-patient';
import { applyPatientUpdates } from '@/lib/patient-update';

const FHIR_BASE_URL = process.env.FHIR_BASE_URL || process.env.NEXT_PUBLIC_FHIR_BASE_URL;
if (!FHIR_BASE_URL) {
  throw new Error('FHIR_BASE_URL is not set');
}

interface RowResult {
  row: number;
  epid: string;
  status: 'accepted' | 'rejected' | 'flagged' | 'skipped';
  reason?: string;
  /** For flagged rows: how many lab results the case already has. */
  existingCount?: number;
  /** For flagged rows: ISO timestamp of the most recent existing result. */
  existingLatest?: string;
}

/**
 * Reads the most-recent answer to the case-investigation question
 * "MR Vaccination given in the last 30 days prior to the onset of illness?"
 * (linkId 308128177300, see reports/measles-cif-502.sql:188). Returns the
 * lower-cased valueString or undefined if no observation is present.
 */
async function fetchMrVaccinationLast30(
  patientId: string,
  token: string,
): Promise<string | undefined> {
  const url =
    `${FHIR_BASE_URL}/Observation` +
    `?subject=Patient/${encodeURIComponent(patientId)}` +
    `&code=308128177300&_sort=-_lastUpdated&_count=1`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/fhir+json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return undefined;
    const bundle = (await res.json()) as {
      entry?: Array<{ resource?: { valueString?: string } }>;
    };
    return bundle.entry?.[0]?.resource?.valueString?.trim().toLowerCase();
  } catch {
    return undefined;
  }
}

interface DerivedAnswer {
  code: string;
  display: string;
  force?: boolean;
}

/**
 * Final Classification rule for the Measles lab form (per the 2026-04-20
 * meeting notes — NPHIIS Reporting Review).
 *
 *   Positive measles-igm + MR Vaccination Yes        → Pending
 *   Positive measles-igm + MR Vaccination No/Unknown → Confirmed by lab
 *   Negative measles-igm                             → Discarded
 *   Indeterminate / Inconclusive                     → Compatible/Clinical/Probable
 *   Anything else (Pending / Not Done / blank)       → Pending
 *
 * The `final-classification` item is server-derived rather than user-typed
 * because the questionnaire's enableWhen would otherwise hide it on Positive
 * IgM, but the rule still needs to emit a value in that case.
 */
async function deriveMeaslesFinalClassification(
  igmAnswer: string | undefined,
  patientId: string,
  token: string,
): Promise<DerivedAnswer | null> {
  const igm = (igmAnswer ?? '').trim().toLowerCase();
  if (!igm) return null;

  if (igm === 'negative') {
    return { code: 'discarded', display: 'Discarded', force: true };
  }
  if (igm === 'indeterminate' || igm === 'inconclusive') {
    return {
      code: 'compatible',
      display: 'Compatible/Clinical/Probable',
      force: true,
    };
  }
  if (igm === 'positive') {
    const mr = await fetchMrVaccinationLast30(patientId, token);
    if (mr === 'yes') {
      return { code: 'pending', display: 'Pending', force: true };
    }
    // No / Unknown / missing → Confirmed by lab.
    return {
      code: 'lab-confirmed',
      display: 'Confirmed by lab',
      force: true,
    };
  }
  // Pending, Not Done, Unknown, anything else → Pending.
  return { code: 'pending', display: 'Pending', force: true };
}

async function postBundle(bundle: unknown, token: string): Promise<void> {
  const res = await fetch(`${FHIR_BASE_URL}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/fhir+json',
      Accept: 'application/fhir+json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bundle),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `HAPI rejected transaction bundle (${res.status}): ${text.slice(0, 300)}`,
    );
  }
}

interface RequestBody {
  formId: string;
  rows: Array<Record<string, string>>;
  /**
   * When false/absent, rows whose case already has a result for this form are
   * flagged and skipped (not imported); the new ones still import. Re-submit
   * the flagged rows with `force: true` to import them anyway.
   */
  force?: boolean;
}

export async function POST(req: NextRequest) {
  const session: VerifiedToken | null = await verifyToken(req);
  if (!session) return unauthorized();
  const profile: UserProfile = await resolveUserProfile(session);
  if (!canAccess(profile.roles, 'LAB_ACCESS')) {
    console.warn(
      '[lab/bulk-upload] LAB_ACCESS denied; resolved roles =',
      profile.roles,
    );
    return forbidden('Lab access required');
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const form = getLabForm(body.formId);
  if (!form) return NextResponse.json({ error: 'Unknown form' }, { status: 404 });
  if (!hasAnyRole(profile.roles, form.allowedRoles)) {
    console.warn(
      '[lab/bulk-upload] form role denied; form =',
      form.id,
      'allowed =',
      form.allowedRoles,
      'user =',
      profile.roles,
    );
    return forbidden('Role not permitted for this form');
  }

  const facilityId = profile.locationInfo?.facility;
  const facilityName = profile.locationInfo?.facilityName;

  const results: RowResult[] = [];
  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i];
    const epid = (row.EPID ?? row.epid ?? '').trim();
    const rowNumber = i + 2; // account for header row
    // Pre-filled template rows the lab has not filled in yet.
    if (!hasFormValues(form, row)) {
      results.push({ row: rowNumber, epid, status: 'skipped' });
      continue;
    }
    if (!epid) {
      results.push({
        row: rowNumber,
        epid: '',
        status: 'rejected',
        reason: 'Missing EPID',
      });
      continue;
    }
    try {
      const lookup = await lookupPatientByEpid(epid, session.raw);
      if (lookup.kind === 'not-found') {
        results.push({
          row: rowNumber,
          epid,
          status: 'rejected',
          reason: 'EPID not found',
        });
        continue;
      }
      const recordType = await getPatientRecordType(
        lookup.patient.id,
        session.raw,
      );
      if (recordType === 'line-list') {
        results.push({
          row: rowNumber,
          epid,
          status: 'rejected',
          reason:
            'EPID belongs to a line-list entry, not a case. Lab results can only be attached to cases.',
        });
        continue;
      }

      // Flag (and skip) cases that already have a result for this form unless
      // the caller explicitly opted to import duplicates. The new rows in the
      // same batch still import — only the existing ones are held back.
      if (!body.force) {
        const existing = await findExistingLabResult(
          lookup.patient.id,
          labResultReasons(form),
          session.raw,
        );
        if (existing.exists) {
          results.push({
            row: rowNumber,
            epid,
            status: 'flagged',
            reason: `Case already has a ${form.title} result on file`,
            existingCount: existing.count,
            existingLatest: existing.latest,
          });
          continue;
        }
      }

      const derivedAnswers: Record<string, DerivedAnswer> = {};
      if (form.id === 'measles-lab-results') {
        const igmAnswer = row['measles-igm'] ?? row['measles_igm'];
        const fc = await deriveMeaslesFinalClassification(
          igmAnswer,
          lookup.patient.id,
          session.raw,
        );
        if (fc) derivedAnswers['final-classification'] = fc;
      }

      // Touch the Patient alongside the lab data so downstream reports
      // see this patient as recently active. Best-effort — if the GET
      // fails we still post the lab Bundle.
      let patientUpdate: Record<string, unknown> | undefined;
      try {
        const fullPatient = await fetchFullPatient(
          lookup.patient.id,
          session.raw,
        );
        if (fullPatient) {
          const { resource, changed } = applyPatientUpdates(
            fullPatient,
            new Date().toISOString(),
          );
          if (changed) patientUpdate = resource;
        }
      } catch (err) {
        console.warn(
          '[lab/bulk-upload] patient touch skipped:',
          (err as Error).message,
        );
      }

      const bundle = buildLabSubmissionBundle({
        form,
        row,
        patientId: lookup.patient.id,
        practitionerId: profile.practitionerId,
        facilityId,
        facilityName,
        originalEncounterId: lookup.patient.caseEncounterId,
        derivedAnswers: Object.keys(derivedAnswers).length
          ? derivedAnswers
          : undefined,
        patientUpdate,
      });
      await postBundle(bundle, session.raw);
      results.push({ row: rowNumber, epid, status: 'accepted' });
    } catch (err) {
      const reason =
        err instanceof RowMappingError
          ? `${err.message}${err.column ? ` (${err.column})` : ''}`
          : (err as Error).message;
      results.push({ row: rowNumber, epid, status: 'rejected', reason });
    }
  }

  const accepted = results.filter((r) => r.status === 'accepted').length;
  const rejected = results.filter((r) => r.status === 'rejected');
  const flagged = results.filter((r) => r.status === 'flagged');
  const skipped = results.filter((r) => r.status === 'skipped').length;
  return NextResponse.json({ accepted, rejected, flagged, skipped, results });
}

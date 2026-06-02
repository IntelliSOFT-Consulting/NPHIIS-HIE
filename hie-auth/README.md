### EPID assignment

See [docs/EPID.md](docs/EPID.md) for when epidemiological IDs are generated (subscriptions, cron, manual endpoints) and when they are skipped.

#### Development Mode

`yarn dev`


#### Production

First ensure you build the project with tsc.

`yarn build`


Run the production build.

`yarn start`

### Case submission notifications

After a successful **new EPID generation** from the HAPI Encounter subscription, national / lab cohorts configured in Keycloak are notified via **FCM** (for users who registered `/notifications/config`) and **SMTP**.

| Variable | Purpose |
|----------|---------|
| `CASE_SUBMISSION_NOTIFY_ROLES` | Comma-separated `practitionerRole` codes. Default: `ADMINISTRATOR,SUPERUSER,LAB_TECHNICIAN`. |
| `ADMIN_PORTAL_URL` | Optional HTTPS URL for an “Open NPHIIS admin portal” button in emails. |
| `PRACTITIONER_ROLE_BACKFILL_DELAY_MS` | Optional throttle (ms) between users when running practitioner-role backfill. |

Recipient lookup uses Keycloak `practitionerRole` (not FHIR alone). After upgrading, run a one-time sync from FHIR Practitioner `role-group` extensions:

`POST /provider/users/backfill-practitioner-roles` — requires **ADMINISTRATOR** or **SUPERUSER** Bearer token, or `X-Internal-Api-Key` matching `INTERNAL_SUBSCRIPTION_API_KEY`.

New provider registrations set `practitionerRole`, `nphiis_role`, and `fhirPractitionerId` on Keycloak automatically.

### EPID location-prefix correction backfill

When sub-counties (or counties) have multi-word names (e.g. `KISUMU CENTRAL` → `KIC` not `KIS`), older EPIDs may have been assigned with the legacy `substring(0, 3)` rule. Use the correction backfill to find and fix them.

| Variable | Purpose |
|----------|---------|
| `EPID_CORRECTION_BACKFILL_DELAY_MS` | Optional throttle (ms) between encounters during correction scan/apply |

**Endpoint:** `POST /subscriptions/encounters/epid-correction-backfill`  
**Auth:** `X-Internal-Api-Key` header (`INTERNAL_SUBSCRIPTION_API_KEY`)

**1. Dry-run (default — no FHIR writes)**

```bash
curl -X POST "http://localhost:8443/subscriptions/encounters/epid-correction-backfill" \
  -H "X-Internal-Api-Key: $INTERNAL_SUBSCRIPTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "limit": 100}'
```

Review `stats.examples` for `oldEpid` → `newEpid` pairs.

**2. Apply corrections**

```bash
curl -X POST "http://localhost:8443/subscriptions/encounters/epid-correction-backfill" \
  -H "X-Internal-Api-Key: $INTERNAL_SUBSCRIPTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "limit": 50}'
```

Optional body fields: `fromDate`, `toDate` (ISO instants) to filter by Encounter `meta.lastUpdated`.

**Rollback:** Export the dry-run `examples` report before apply; re-apply manually only if a correction was wrong (no automatic rollback).

Case-submission retries distinguish **FCM** (`status`) from **email**: when SMTP succeeds, `caseSubmissionEmailSentAt` is set so a later retry (e.g. FCM still failing) does not send duplicate mail.

Apply DB migrations (`prisma migrate deploy`) before deploying — the `Notification` table gains `type`, composite uniqueness, optional `investigationDate` for AFP vs case-submission rows, and optional `caseSubmissionEmailSentAt` for email idempotency.

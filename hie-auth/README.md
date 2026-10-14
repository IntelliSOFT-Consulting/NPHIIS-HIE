### Patient identity validation (CR + IPRS)

Authenticated providers can validate a patient by identification document:

`GET /provider/patients/validate?identification_number=…&identification_type=…`

Lookup order: **Client Registry** first; on not-found, **IPRS**. `CR_BASE_URL` is the middleware root (e.g. `https://ilm-dev.dha.go.ke/uat-middleware`); the service appends `/api/v1/patients`. The DHA middleware's `400 … zero results found` is treated as not-found. Upstream errors on CR do not fall through to IPRS (returns `502`). Success responses include a FHIR R4 `Patient` conforming to `ClientRegistryPatient` or `IprsPatient` (see `packages/fhir-ig`).

| Variable | Purpose |
|----------|---------|
| `CR_BASE_URL` | Base URL for Client Registry (required for CR step) |
| `CR_API_TOKEN` | Optional Bearer token for CR |
| `CR_CLIENT_ID` / `CR_CLIENT_SECRET` | OAuth2 client credentials (DHA middleware). When set, a token is fetched, cached until shortly before expiry, and refreshed once on `401`; takes precedence over `CR_API_TOKEN` |
| `CR_TOKEN_URL` | Optional token endpoint (default `${CR_BASE_URL}/api/v1/tenants/token`) |
| `CR_TIMEOUT_MS` | Optional CR timeout (default `10000`) |
| `IPRS_BASE_URL` | Base URL for IPRS (required for IPRS fallback) |
| `IPRS_USERNAME` / `IPRS_PASSWORD` | Basic auth credentials for IPRS (SHA Health ID) |
| `IPRS_BASIC_AUTH` | Optional pre-built Basic auth value, sent as-is instead of username/password |
| `IPRS_API_TOKEN` | Optional Bearer token for IPRS, used only when no Basic auth is configured |
| `IPRS_TIMEOUT_MS` | Optional IPRS timeout (default `10000`) |

Allowed `identification_type` values: Temporary ID, Alien ID, Refugee ID, Mandate Number, Birth Certificate, National ID, Birth Notification, ClientRegistry ID.

### Screening intake

`POST /provider/screenings` receives a screened person as plain JSON (no FHIR needed by the caller). The service matches an existing `Patient` by identifier type + number (or creates one), then stores point of entry, travel history and signs/symptoms as a `QuestionnaireResponse` linked to that patient. Idempotent on `screeningId`: a retry returns `duplicate: true` and creates nothing.

**Auth:** Bearer JWT, like every other provider endpoint. The screening service has its own user account and obtains a token from `POST /provider/login` (`{ idNumber, password }`), refreshing it via `POST /provider/refresh_token`.

| Status | Meaning |
|--------|---------|
| `201` / `200` | Created / matched an existing patient |
| `400` | Invalid payload (`errors[]` lists every problem) |
| `409` | Identifiers match more than one patient (`patientIds[]`) |
| `502` | FHIR server failure; if a `patientId` is returned, retry with the same `screeningId` |

Minimal body: `{ "screeningId": "<uuid>", "patient": { "identifiers": [{ "type": "National ID", "value": "12345678" }] } }`. Optional: `screenedAt`, `outcome` (`cleared|referred|suspected`), `pointOfEntry`, `patient` demographics, `travelHistory { hasTravelled, trips[] }`, `signsAndSymptoms { temperatureCelsius, symptoms[{ code, present, onsetDate, note }] }`. Symptom codes: see `screening-symptom` CodeSystem in `packages/fhir-ig`.

**Finding screenings** (all via `/fhir/...` or `GET /provider/screenings/patients`):

- Screened patients: `Patient?_tag=http://nphiis.health.go.ke/fhir/CodeSystem/record-origin|screened` or `Patient?_profile=…/screened-patient`
- Screenings: `QuestionnaireResponse?_profile=…/traveller-screening-response`
- By outcome: `QuestionnaireResponse?_tag=…/CodeSystem/screening-outcome|referred`

Profiles `ScreenedPatient` and `TravellerScreeningResponse`, plus the `traveller-screening` Questionnaire, are defined in `packages/fhir-ig/input/fsh/screening.fsh`. An existing patient who is screened later also gets the tag and profile, so the filter means "has been screened".

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

### Application roles (source of truth)

Roles are configured in `hie-auth/.env` as a comma-separated `USER_ROLES` list. `src/lib/roles.ts` loads that value, `checkUserRoles()` ensures each role exists in Keycloak on startup, and clients fetch the live list from:

`GET /provider/roles` → `{ "roles": ["ADMINISTRATOR", ...], "status": "success" }`

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

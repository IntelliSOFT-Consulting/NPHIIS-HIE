# NPHIIS HIE — Deployment Protocol

This document covers the end-to-end procedure for deploying or redeploying the NPHIIS HIE platform in a production or staging environment. It assumes a single Linux host running Docker Engine with Docker Compose v2.

---

## Hostname and Certificate Placeholders

Throughout this document the following placeholders are used. Replace every occurrence with the actual hostnames and certificate filenames for your environment before executing any commands.

| Placeholder | Description | Example |
| --- | --- | --- |
| `<FHIR_HOST>` | Public hostname for HAPI FHIR and hie-auth API | `fhir.nphiis.health.go.ke` |
| `<DATA_HOST>` | Public hostname for the FHIR Data Pipes pipeline controller | `data.nphiis.health.go.ke` |
| `<SUPERSET_HOST>` | Public hostname for Apache Superset | `superset.nphiis.health.go.ke` |
| `<KEYCLOAK_HOST>` | Public hostname for Keycloak, auth routes, and the Web App | `iam.nphiis.health.go.ke` |
| `<WILDCARD_CERT>` | Filename stem of your TLS wildcard certificate (without extension) | `star.nphiis.health.go.ke` |

Update `proxy/nginx.conf` `server_name` directives to match the four hostnames above before deploying Nginx.

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Pre-Deployment Checklist](#2-pre-deployment-checklist)
3. [Environment Configuration](#3-environment-configuration)
4. [TLS Certificates](#4-tls-certificates)
5. [Deployment Sequence](#5-deployment-sequence)
6. [Health Verification](#6-health-verification)
7. [Post-Deployment Tasks](#7-post-deployment-tasks)
8. [Updating a Running Deployment](#8-updating-a-running-deployment)
9. [Rollback Procedure](#9-rollback-procedure)
10. [Backup and Restore](#10-backup-and-restore)
11. [Operational Reference](#11-operational-reference)

---

## 1. Prerequisites

### Host Requirements

| Resource | Minimum | Recommended |
| --- | --- | --- |
| CPU | 8 vCPU | 16 vCPU |
| RAM | 16 GB | 32 GB |
| Disk | 100 GB SSD | 250 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Software

| Tool | Version |
| --- | --- |
| Docker Engine | 24.x or later |
| Docker Compose (plugin) | v2.20 or later |
| Git | any recent version |
| Python 3 | 3.9+ (for `scripts/bulk_register.py`) |
| jq | any recent version (used in verification commands below) |
| dnsutils (`dig`) | any recent version |

Install Docker on a fresh Ubuntu host:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### DNS

All four public hostnames must resolve to the host's public IP before deployment. The Nginx container will fail health checks if DNS is unresolvable at runtime.

| Hostname | Destination |
| --- | --- |
| `<FHIR_HOST>` | Nginx → HAPI FHIR (`/hapi/`) and hie-auth (`/api/`) |
| `<DATA_HOST>` | Nginx → pipeline-controller |
| `<SUPERSET_HOST>` | Nginx → Apache Superset |
| `<KEYCLOAK_HOST>` | Nginx → Keycloak, hie-auth auth routes, nphiis-admin |

---

## 2. Pre-Deployment Checklist

Complete every item before starting the deployment sequence.

- [ ] Repository cloned or updated to the target commit/tag
- [ ] All `.env` files populated (see [Section 3](#3-environment-configuration))
- [ ] TLS certificate and key placed in `proxy/certs/` (see [Section 4](#4-tls-certificates))
- [ ] `proxy/nginx.conf` `server_name` directives updated to the four actual hostnames
- [ ] DNS records verified with `dig <FHIR_HOST>` (and the other three hostnames)
- [ ] `cloudbuild` Docker network created
- [ ] Firebase service-account JSON available for FCM notifications
- [ ] SMTP credentials confirmed with a test send
- [ ] Keycloak realm export available for import (first deployment) or existing data backed up (re-deployment)
- [ ] Sufficient disk space (`df -h /var/lib/docker`)
- [ ] Any running conflicting containers stopped

---

## 3. Environment Configuration

Each service loads configuration from an `.env` file. Do not commit environment-specific `.env` files containing real secrets.

### 3.1 `nphiis-admin/.env`

Copy the template and fill in every value:

```bash
cp nphiis-admin/env.example nphiis-admin/.env
```

| Variable | Value |
| --- | --- |
| `KEYCLOAK_URL` | Internal Keycloak base URL, e.g. `http://keycloak:8080` |
| `NEXT_PUBLIC_KEYCLOAK_URL` | `https://<KEYCLOAK_HOST>` |
| `KEYCLOAK_REALM` | `nphiis` |
| `KEYCLOAK_CLIENT_ID` | `nphiis-admin` |
| `FHIR_BASE_URL` | `http://hapi-fhir-jpa:8080/fhir` (Docker network) |
| `SUPERSET_URL` | `http://superset_app:8088` (Docker network) |
| `SUPERSET_GUEST_USER` | Superset embed service-account username |
| `SUPERSET_GUEST_PASSWORD` | Superset embed service-account password |
| `NEXT_PUBLIC_SUPERSET_URL` | `https://<SUPERSET_HOST>` |
| `NEXT_PUBLIC_SUPERSET_DASHBOARD_IDSR_CBS` | Embed UUID from Superset (default: `363e13a5-bfd4-4ca9-b76e-ba284d5b6404`) |

### 3.2 `hie-auth/.env`

Create this file from scratch. Required variables:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres:***REMOVED***@nphiis-postgres:5432/nphiis-mediators` |
| `KEYCLOAK_BASE_URL` | Internal Keycloak URL, e.g. `http://keycloak:8080` |
| `KEYCLOAK_REALM` | `nphiis` |
| `KEYCLOAK_CLIENT_ID` | `nphiis-admin` |
| `KEYCLOAK_CLIENT_SECRET` | Client secret from Keycloak admin console |
| `HAPI_FHIR_BASE_URL` | `http://hapi-fhir-jpa:8080/fhir` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Path or inline JSON for FCM push notifications |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender address for notification emails |
| `ENCOUNTER_BACKFILL_CRON_SCHEDULE` | Optional; defaults to `0 2 * * 0` (weekly Sun 02:00 UTC) |
| `FHIR_SPECIMEN_SUBSCRIPTION_ID` | e.g. `nphl-specimen-subscription` |
| `FHIR_SPECIMENS_SUBSCRIPTION_CALLBACK_URL` | `http://hie-auth:3000/subscriptions/specimens/notifications` |
| `NPHL_SURVEILLANCE_API_URL` | Optional; defaults to `https://data-apis.nphl.go.ke` |
| `NPHL_SURVEILLANCE_API_KEY` | NPHL Surveillance Data API key (from helpdesk@nphl.go.ke). Also enables the result poll |
| `NPHL_VHF_LAB_TESTS` | Optional; tests requested per specimen, comma-separated. Defaults to `RT-PCR`. Keep stable: NPHL de-duplicates on the test set |
| `NPHL_POLL_CRON_SCHEDULE` | Optional; defaults to `*/30 * * * *`. Set `NPHL_POLL_CRON_ENABLED=false` to stop polling |
| `LAB_RESULTS_API_KEY` | Key the lab system sends to `POST /lab/results` (`x-api-key` or `Bearer`). Comma-separate two keys to rotate |
| `LAB_RESULTS_HMAC_SECRET` | Optional; when set, every lab push must be signed (see §7.2 *Securing lab pushes*) |
| `LAB_RESULTS_SIGNATURE_TOLERANCE_SECONDS` | Optional; how far `x-lab-timestamp` may be from now. Defaults to `300` |
| `NPHL_SYNC_DEBOUNCE_MS` | Optional; quiet window before a case is posted after a Specimen callback. Defaults to `15000` |
| `NPHL_MAX_CONCURRENT` | Optional; most NPHL calls in flight at once, across subscription, poll and manual. Defaults to `2` |
| `NPHL_POLL_MAX_CASES` / `NPHL_POLL_MAX_AGE_DAYS` | Optional; poll at most this many cases per run, only Tasks authored in the last N days. Default `200` / `60` |
| `LAB_STAGING_API_KEY` | NPHL lab staging API key. Enables the pull of ready results from `GET /list` |
| `LAB_STAGING_API_URL` | Optional; defaults to `https://lab-staging-api.nphl.go.ke` |
| `LAB_STAGING_LOOKBACK_DAYS` | Optional; pull rows with a test date in the last N days. Defaults to `14` |
| `LAB_STAGING_POLL_CRON_SCHEDULE` | Optional; defaults to `15,45 * * * *`. Set `LAB_STAGING_POLL_CRON_ENABLED=false` to stop it |

### 3.3 `keycloak/.env`

| Variable | Description |
| --- | --- |
| `KC_DB` | `postgres` |
| `KC_DB_URL` | `jdbc:postgresql://keycloak-postgres:5432/keycloak` |
| `KC_DB_USERNAME` | `postgres` |
| `KC_DB_PASSWORD` | `***REMOVED***` |
| `KEYCLOAK_ADMIN` | Initial admin username |
| `KEYCLOAK_ADMIN_PASSWORD` | Initial admin password — use a strong random value |
| `KC_HOSTNAME` | `<KEYCLOAK_HOST>` |

### 3.4 `fhir-gateway/.env`

| Variable | Description |
| --- | --- |
| `TOKEN_ISSUER` | `https://<KEYCLOAK_HOST>/realms/nphiis` |
| `PROXY_TO` | `http://hapi-fhir-jpa:8080/fhir` |
| `ALLOWED_QUERIES_FILE` | Path to allowed-queries JSON inside the container |
| `ACCESS_CHECKER` | `list` (or the configured access checker class) |
| `RUN_MODE` | `PROD` |

---

## 4. TLS Certificates

Nginx expects the wildcard certificate and key at:

```
proxy/certs/<WILDCARD_CERT>.crt
proxy/certs/<WILDCARD_CERT>.key
```

Create the directory and place the files:

```bash
mkdir -p proxy/certs
cp /path/to/your/<WILDCARD_CERT>.crt proxy/certs/
cp /path/to/your/<WILDCARD_CERT>.key proxy/certs/
chmod 600 proxy/certs/*.key
```

Update `proxy/nginx.conf` to reference the correct filenames:

```nginx
ssl_certificate     /opt/<WILDCARD_CERT>.crt;
ssl_certificate_key /opt/<WILDCARD_CERT>.key;
```

Verify the certificate covers all four hostnames:

```bash
openssl x509 -in proxy/certs/<WILDCARD_CERT>.crt -noout -text | grep -A1 "Subject Alternative Name"
```

---

## 5. Deployment Sequence

Services have hard boot-order dependencies. Follow the sequence below exactly. Each group must be healthy before proceeding to the next.

### Step 1 — Create the Docker network

```bash
docker network inspect cloudbuild >/dev/null 2>&1 || docker network create cloudbuild
```

This is idempotent; re-running on an existing network is safe.

### Step 2 — Start the core HIE stack

This single command brings up HAPI FHIR, hie-auth, fhir-gateway, Keycloak, Nginx, `nphiis-admin`, and the location seeder (`hapi-fhir-config`):

```bash
./start-hie.sh
```

What it launches (in dependency order as resolved by Compose):

| Container | Image / Build |
| --- | --- |
| `hapi-fhir-postgres` | `postgres:14-alpine` |
| `nphiis-postgres` | `postgres:14-alpine` |
| `keycloak-postgres` | `postgres:14-alpine` |
| `keycloak` | `quay.io/keycloak/keycloak:26.0.1` |
| `hapi-fhir-jpa` | `hapiproject/hapi:v6.8.0` |
| `hapi-fhir-config` | Built from `hapi-fhir-config/` |
| `hie-auth` | Built from `hie-auth/` |
| `fhir-gateway` | Built from `fhir-gateway/` |
| `nphiis-admin` | Built from `nphiis-admin/` |
| `nginx` | `nginx:alpine` |
> **Note:** `hapi-fhir-config` is a one-shot init container. It seeds Kenya administrative boundaries (47 counties → sub-counties → wards → facilities → community units) on first start and exits. It will re-run on every `./start-hie.sh` call but is idempotent.

Wait for HAPI FHIR to be ready before proceeding:

```bash
./start-hie.sh logs -f hapi-fhir-jpa
# Look for: "HAPI FHIR JPA Server - 6.8.0 is now running"
# Ctrl+C when you see the ready message
```

HAPI FHIR typically takes 60–120 seconds on first start as it initializes the schema.

### Step 3 — (Optional) Start the Web App

`./start-hie.sh` already starts `nphiis-admin` (via `hie/docker-compose.yml`). Only run the command below if you have intentionally excluded `nphiis-admin` from Step 2 to avoid a host port 8080 conflict.

    ./start-admin.sh

Starts `nphiis-admin` (Next.js, port 8080).

### Step 4 — Start the FHIR Analytics Engine

```bash
./start-data-pipes.sh
```

Starts `pipeline-controller` (port 8090), `spark-thriftserver` (port 10001) and `analytics-postgres` (the dashboards' Postgres sink; see [Analytics Postgres](#analytics-postgres-vhf-pilot)). Before the first start, create its credentials:

```bash
cd fhir-data-pipes/docker
cp analytics-postgres.env.example analytics-postgres.env                     # set both passwords
cp config/analytics-postgres-config.json.example config/analytics-postgres-config.json  # same POSTGRES_PASSWORD
```

> `./start-data-pipes.sh` without arguments passes `--remove-orphans`. The compose project is named `docker`, which other stacks on dsrfhir also use (`app`, `icl-careers-db`), so it removes their containers. Start single services instead, e.g. `./start-data-pipes.sh up -d --no-deps analytics-postgres`.

### Step 5 — Start Apache Superset

```bash
./start-superset.sh
```

> Superset's startup script uses `sudo`. Ensure the deploying user has sudo access.

Superset initialization (database migrations, admin account setup) runs on first start. Monitor progress:

```bash
sudo docker compose -f NPHIIS-superset/docker-compose-non-dev.yml logs -f superset_init
# Wait for the init container to exit cleanly
```

### Step 6 — Verify full stack

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

All containers should show `Up` (not `Restarting` or `Exited`).

---

## 6. Health Verification

Run each check in order. A failure at any step should be resolved before proceeding.

### 6.1 Keycloak

```bash
curl -sf https://<KEYCLOAK_HOST>/health/ready && echo "OK"
# Or check the admin console at https://<KEYCLOAK_HOST>/admin
```

Expected: HTTP 200.

### 6.2 HAPI FHIR

```bash
curl -sf https://<FHIR_HOST>/hapi/fhir/metadata | jq '.fhirVersion'
```

Expected: `"4.0.1"`.

### 6.3 hie-auth

```bash
curl -sf https://<FHIR_HOST>/api/health
```

Expected: HTTP 200 with a `{"status":"ok"}` or similar response.

### 6.4 FHIR Gateway

```bash
curl -I http://localhost:8099/fhir/metadata
```

Expected: HTTP 200 or 401 (proxy is live; 401 confirms token validation is active).

### 6.5 nphiis-admin Web App

Open `https://<KEYCLOAK_HOST>/hie-admin` in a browser. The Keycloak login screen should appear.

### 6.6 FHIR Data Pipes

```bash
curl -sf http://localhost:8090/
```

Expected: pipeline-controller UI HTML.

### 6.7 Apache Superset

```bash
curl -sf https://<SUPERSET_HOST>/health
```

Expected: `"OK"`.

### 6.8 Nginx TLS

```bash
curl -vI https://<FHIR_HOST>/hapi/fhir/metadata 2>&1 | grep -E "SSL|subject|issuer|expire"
```

Verify the wildcard cert is presented and is not expired.

---

## 7. Post-Deployment Tasks

### 7.1 Keycloak Realm Configuration (first deployment only)

1. Log in to the Keycloak admin console at `https://<KEYCLOAK_HOST>/admin`.
2. Create or import the `nphiis` realm (use the realm export file if available).
3. Create the `nphiis-admin` client. Copy the **client secret** into `hie-auth/.env` (`KEYCLOAK_CLIENT_SECRET`).
4. Add the custom attributes: ensure `fhirPractitionerId` is defined as a user attribute on the `nphiis` realm.
5. Assign the application roles to the client. The full list of roles is defined by the `USER_ROLES` variable in `hie-auth/.env`.
6. Import or configure the custom Keycloak themes from `keycloak/themes/`.

After updating the client secret, restart hie-auth:

```bash
./start-hie.sh restart hie-auth
```

### 7.2 FHIR Subscriptions

`hie-auth` relies on these active FHIR subscriptions being present in HAPI FHIR:

| Subscription | Criteria | Endpoint |
| --- | --- | --- |
| EPID auto-assignment | `Encounter?` | `http://hie-auth:3000/subscriptions/encounter` |
| AFP follow-up | `Observation?code=502488184403` | `http://hie-auth:3000/subscriptions/observation` |
| NPHL specimen submission | `Specimen?` | `http://hie-auth:3000/subscriptions/specimens/notifications` |

#### NPHL specimen submission (VHF)

When a Specimen syncs in, hie-auth posts its VHF case, with every specimen on that case, to the NPHL
Surveillance Data API (`POST /v1/surveillance`). Each specimen gets a Task (`Task/nphl-<specimen id>`,
code `nphl-specimen-submission`) that tracks it:

| Task status | businessStatus | Meaning |
| --- | --- | --- |
| `on-hold` | `awaiting-epid` | Case has no EPID yet; retried by the poll |
| `requested` | `submission-failed` | NPHL call failed (`statusReason` has the error); retried by the poll |
| `in-progress` | `awaiting-result` | Accepted by NPHL; no result yet |
| `in-progress` | `preliminary-result` | Preliminary result written to `Observation/nphl-result-<specimen id>` |
| `completed` | `final-result` | Final result received |
| `rejected` | `specimen-rejected` | Lab rejected the specimen; reason in `statusReason` and `output` |

Results arrive three ways: the poll re-posts open cases (NPHL returns current results in the POST response),
the lab staging pull reads `GET https://lab-staging-api.nphl.go.ke/list` (below), and the lab system pushes results and rejections to `POST /lab/results` (behind `/api/` or `/auth/` on the
proxy) with `LAB_RESULTS_API_KEY` in `x-api-key`. Updates are matched on the specimen tube label
(`Task.identifier` `http://nphiis.health.go.ke/fhir/identifiers/specimen-id`). The body is an array or
`{ "data": [...] }`:

```json
{
  "data": [
    {
      "specimen_id": "KEN-KER-KIE-2026-VHF-001-S1",
      "status": "final",
      "laboratory_result": "Negative",
      "laboratory_result_narration": [
        { "test_name": "EVD", "test_method": "RT-PCR", "result": "Negative", "result_type": "Final" }
      ],
      "date_of_laboratory_result": "2026-10-15T09:30:00+03:00",
      "other_laboratory_facility": "National Virology Reference Laboratory (NVRL)"
    },
    {
      "specimen_id": "KEN-KER-KIE-2026-VHF-001-S2",
      "status": "rejected",
      "rejection_reason": "Sample haemolysed",
      "date_rejected": "2026-10-15",
      "other_laboratory_facility": "National Virology Reference Laboratory (NVRL)"
    }
  ]
}
```

`status` is `preliminary`, `final` or `rejected`. Lab line-list rows (as lab-staging-api `/list` returns them,
keyed by `specimenIdentifier`) are also accepted; a row whose `status` or `conclusion` says rejected rejects
the specimen. The response lists each update with `matched` and the Task status it produced. A later
re-post to NPHL without a result never overwrites a recorded result or rejection.

**Lab results endpoint.** `POST /lab/results` takes everything the lab system (LIMS) sends about a submitted specimen,
as an array or `{ "data": [...] }`. Each message has `messageType` and the specimen's `specimenIdentifier`
(`message_type` / `specimen_id` also work):

| `messageType` | Effect on the specimen's Task | Other fields |
| --- | --- | --- |
| `received` | `in-progress` / `received-at-lab` | `date`, `laboratory`, `caseIdentifier` (lab number) |
| `in-testing` | `in-progress` / `in-testing` | `date`, `laboratory` |
| `result` (or none) | `preliminary-result` / `final-result` | a line-list row or a `specimen_id` result entry (above) |
| `rejected` | `rejected` / `specimen-rejected` | `rejection_reason`, `date_rejected`, `laboratory` |
| `note` | adds a note to the Task (once per text) | `text`, `laboratory`, `date` |

```json
{
  "data": [
    { "messageType": "received", "specimenIdentifier": "2261733", "caseIdentifier": "NVRL/1051/26",
      "date": "2026-10-15T08:10:00+03:00", "laboratory": "National Virology Reference Laboratory (NVRL)" },
    { "messageType": "note", "specimenIdentifier": "2261733", "text": "Volume low; please send a repeat sample" },
    { "messageType": "result", "specimenIdentifier": "2261733", "caseIdentifier": "NVRL/1051/26", "testName": "EVD",
      "codeText": "Ebola Virus", "componentCode": "86518-8", "conclusion": "Absent", "valueCode": "LA9634-2",
      "effectiveDateTime": "2026-10-15", "testingLabName": "National Virology Reference Laboratory (NVRL)" }
  ]
}
```

A specimen is matched on its tube label, then on `orderIdentifier` if the lab sends one (ask the lab to put the ID we
submitted there when the tube barcode differs). `caseIdentifier` is kept on the Task as the lab number
(`http://nphiis.health.go.ke/fhir/identifiers/nphl-lab-number`), and LOINC `componentCode`s are added to the test
Observations. Progress never steps a specimen back: `received` after `in-testing`, or either after a result or
rejection, is ignored. The response lists each update with `matched` (and `matchedOn` when it matched on the order
identifier) and the Task status it produced, plus `invalid`: messages that could not be used, by their index in the
batch. Only a batch with no usable message gets `400`. Each call is logged as route `lab-results-push`.

**Securing lab pushes.** The API key is checked before the body is read. When `LAB_RESULTS_HMAC_SECRET` is set,
each request must also carry `x-lab-timestamp` (Unix seconds or ISO 8601, within
`LAB_RESULTS_SIGNATURE_TOLERANCE_SECONDS` of now) and `x-lab-signature: sha256=<hex>`, the HMAC-SHA256 of
`<timestamp>.<raw request body>` with the secret. An altered body or an old captured request is refused with `401`.
Applying the same message twice changes nothing. Share the key and secret with the lab out of band, and only over HTTPS.

```bash
TS=$(date +%s); BODY='{"data":[{"messageType":"in-testing","specimenIdentifier":"2261733"}]}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$LAB_RESULTS_HMAC_SECRET" -hex | sed 's/^.* //')
curl -X POST https://<API_HOST>/api/lab/results -H 'Content-Type: application/json' \
  -H "x-api-key: $LAB_RESULTS_API_KEY" -H "x-lab-timestamp: $TS" -H "x-lab-signature: sha256=$SIG" -d "$BODY"
```

**Load limits.** A Specimen callback only queues the case and returns at once, so HAPI never waits on NPHL
or retries because of it. Callbacks for one case within `NPHL_SYNC_DEBOUNCE_MS` become one post, a case
never syncs twice in parallel, and a case is not re-posted on a callback when nothing NPHL would see has
changed (the hash of the last accepted payload is on the Task). The queued run is logged as route
`nphl-case-sync`. hie-auth writes only Tasks and Observations coded `nphl-lab-result`, which match no
subscription, so it cannot trigger itself.

**Lab staging pull.** With `LAB_STAGING_API_KEY` set, hie-auth reads `GET /list?dateFrom=<today − LAB_STAGING_LOOKBACK_DAYS>`
every 30 minutes and applies the rows whose `specimenIdentifier` equals the tube label of a specimen that is still open
(`requested`, `in-progress` or `on-hold`, authored in the last `NPHL_POLL_MAX_AGE_DAYS`). Rows for other specimens are
ignored. Line-list rows carry no preliminary flag, so a matched result is recorded as final. Run it by hand with
`POST /subscriptions/specimens/lab-staging-pull` (internal API key or admin bearer); the response gives rows read,
open specimens, updates found and specimens updated.

**Emails.** When a specimen's Task first reaches `preliminary-result`, `final-result` or `specimen-rejected`, by any of the
three routes, the practitioner who submitted the case is emailed (if they have notifications enabled and an email in
Keycloak). Each outcome is sent once per specimen, tracked as a `LAB_RESULT` notification keyed
`nphl-<specimen id>:<outcome>`. Needs the SMTP settings; a failed email is recorded on the notification and does not
block the result being written.

Re-submit one case by hand: `POST /subscriptions/specimens/nphl-sync` with `{ "specimenId": "…" }` or
`{ "encounterId": "…" }` (internal API key or admin bearer).

Verify they exist:

```bash
curl -sf https://<FHIR_HOST>/hapi/fhir/Subscription | jq '.total'
```

If missing, POST the subscription resources via the FHIR API or re-trigger the hie-auth startup routine that seeds them.

#### VHF contact tracing

There is no HAPI subscription for contact tracing; hie-auth runs a daily job instead (`VHF_CONTACT_CRON_SCHEDULE`, default `45 2 * * *` = 5:45 EAT; `VHF_CONTACT_CRON_ENABLED=false` turns it off). The job rebuilds each case's contact `List`, promotes contacts converted to cases (Case ID, NPHL sync, case alert), and sends follow-up reminders to the sub-county disease surveillance officer of each contact's residence, escalating missed days to the county officer. Model: https://<FHIR_HOST>/ig/contact-tracing.html.

- **Database migration.** `20261017120000_vhf_contact_follow_up_notifications` adds `Notification.followUpDay` and widens its unique key. The hie-auth image does not run migrations; apply them before starting a new image:

  ```bash
  sudo docker compose -f hie/docker-compose.yml build hie-auth
  sudo docker compose -f hie/docker-compose.yml run --rm --no-deps hie-auth npx prisma migrate status
  sudo docker compose -f hie/docker-compose.yml run --rm --no-deps hie-auth npx prisma migrate deploy
  sudo docker compose -f hie/docker-compose.yml up -d --no-deps hie-auth
  ```

  On dsrfhir the four migrations from 2026-02-25 to 2026-06-19 had been applied without being recorded (the schema had them). They were marked applied with `prisma migrate resolve --applied <name>` on 2026-10-17; check `migrate status` before deploying elsewhere.
- **Run the job now:** `curl -X POST -H 'X-Internal-Api-Key: …' https://<FHIR_HOST>/api/provider/contacts/run-daily?send=true`.
- **Contacts and case alerts.** A VHF record whose latest `vhf-case-type` is Contact gets its EPID but no Case ID, NPHL submission or case-submission alert until it is converted.

### 7.3 Superset Datasource and Dashboard Setup (first deployment only)

1. Log in to Superset at `https://<SUPERSET_HOST>`.
2. Add a database connection pointing to `spark-thriftserver` via JDBC (`hive+hiveserver2://spark-thriftserver:10000`).
3. Import the IDSR Case-Based Surveillance dashboard.
4. Copy the embed UUID into `nphiis-admin/.env` as `NEXT_PUBLIC_SUPERSET_DASHBOARD_IDSR_CBS`.
5. Restart the admin app: `./start-admin.sh restart nphiis-admin`.

### 7.4 Initial FHIR Data Pipeline Run

Trigger an incremental run from the pipeline-controller UI at `https://<DATA_HOST>` to populate the Parquet data warehouse before Superset queries are executed.

### 7.5 Create the First Admin User

Use the Web App at `https://<KEYCLOAK_HOST>/hie-admin/users` to provision the first `ADMINISTRATOR` account.

---

## 8. Updating a Running Deployment

### Single service update (e.g. hie-auth)

```bash
# Pull latest code
git pull

# Rebuild and restart the target container only
./start-hie.sh up -d --build --force-recreate hie-auth
```

### Full stack update

```bash
git pull

# Rebuild all images and recreate containers
./start-hie.sh up -d --build --force-recreate
./start-admin.sh up -d --build --force-recreate
```

> **Database migrations**: `hie-auth` runs `prisma migrate deploy` on startup. Check logs after restart:
> ```bash
> ./start-hie.sh logs -f hie-auth
> ```

### nphiis-admin only

```bash
git pull
./start-admin.sh up -d --build --force-recreate
```

### Superset configuration only

`NPHIIS-superset/docker/pythonpath_dev/superset_config.py` and `NPHIIS-superset/docker/.env` are read at startup. After changing either, restart the web app and the worker:

```bash
git pull
sudo docker compose -f NPHIIS-superset/docker-compose-non-dev.yml up -d --force-recreate superset superset-worker
```

`--force-recreate` also picks up `.env` changes; use `restart superset superset-worker` instead when only `superset_config.py` changed. Superset is unavailable for about 30 seconds. Restart `superset-worker-beat` too when the Celery schedule (`beat_schedule`) changed.

---

## 9. Rollback Procedure

### Rolling back a single service

```bash
# Check out the previous commit on the relevant subdirectory
git log --oneline -10

# Roll back to a specific commit
git checkout <previous-commit> -- hie-auth/
./start-hie.sh up -d --build --force-recreate hie-auth
```

### Rolling back the full stack

```bash
# Check out the previous stable tag or commit
git checkout <stable-tag>

# Recreate all images from the checked-out code
./start-hie.sh up -d --build --force-recreate
./start-admin.sh up -d --build --force-recreate
```

> **Database rollback**: Prisma migrations are forward-only. If a migration must be reversed, restore from a pre-deployment backup (see [Section 10](#10-backup-and-restore)) and redeploy the previous image.

---

## 10. Backup and Restore

### 10.1 Backing Up PostgreSQL Volumes

All persistent state lives in three named Docker volumes:

| Volume | Database | Service |
| --- | --- | --- |
| `hie_hapi-fhir-postgres` | `hapi` | HAPI FHIR |
| `hie_nphiis-postgres` | `nphiis-mediators` | hie-auth |
| `keycloak_keycloak-postgres` | `keycloak` | Keycloak |

Dump each database (containers must be running):

```bash
# HAPI FHIR
docker exec hapi-fhir-postgres pg_dump -U postgres hapi | gzip > backups/hapi-$(date +%Y%m%d).sql.gz

# hie-auth / nphiis-mediators
docker exec nphiis-postgres pg_dump -U postgres nphiis-mediators | gzip > backups/nphiis-mediators-$(date +%Y%m%d).sql.gz

# Keycloak
docker exec keycloak-postgres pg_dump -U postgres keycloak | gzip > backups/keycloak-$(date +%Y%m%d).sql.gz
```

### 10.2 Restoring from Backup

```bash
# Stop the target service
./start-hie.sh stop hapi-fhir-jpa

# Restore
gunzip < backups/hapi-YYYYMMDD.sql.gz | docker exec -i hapi-fhir-postgres psql -U postgres hapi

# Restart
./start-hie.sh up -d --force-recreate hapi-fhir-jpa
```

### 10.3 Keycloak Realm Export

Export the `nphiis` realm (preserving users) for safe off-host storage:

```bash
docker exec keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/realm-export \
  --realm nphiis \
  --users realm_file

docker cp keycloak:/tmp/realm-export ./backups/keycloak-realm-$(date +%Y%m%d)/
```

---

## 11. Operational Reference

### Viewing Logs

```bash
# All HIE-stack logs (follow)
./start-hie.sh logs -f

# Single service
./start-hie.sh logs -f hie-auth

# Data pipes
./start-data-pipes.sh logs -f

# Superset
sudo docker compose -f NPHIIS-superset/docker-compose-non-dev.yml logs -f
```

### Stopping the Stack

```bash
# HIE core (HAPI, hie-auth, fhir-gateway, Keycloak, Nginx)
./start-hie.sh down

# Admin app
./start-admin.sh down

# Data pipes
./start-data-pipes.sh down

# Superset
sudo docker compose -f NPHIIS-superset/docker-compose-non-dev.yml down
```

### Restarting a Single Container

```bash
docker restart <container-name>
# e.g. docker restart hie-auth
```

### Cron Jobs (hie-auth)

| Schedule (UTC) | Job |
| --- | --- |
| `30 3 * * *` (06:30 EAT) | Send pending AFP 60-day follow-up FCM notifications (2-day retry window) |
| `0 2 * * 0` (configurable) | Backfill EPID assignment for encounters missing EPID identifiers |

Monitor cron job execution in hie-auth logs:

```bash
./start-hie.sh logs hie-auth | grep -i "cron\|backfill\|afp"
```

### Port Reference

| Service | Host port | Internal address |
| --- | --- | --- |
| Nginx (HTTP redirect) | 80 | — |
| Nginx (HTTPS) | 443 | — |
| nphiis-admin | 8080 | `nphiis-admin:3000` |
| hie-auth | 8443 | `hie-auth:3000` |
| hapi-fhir-jpa | 8787 | `hapi-fhir-jpa:8080` |
| fhir-gateway | 8099 | `fhir-gateway:8080` |
| keycloak | 8888 | `keycloak:8080` |
| pipeline-controller | 8090 | `pipeline-controller:8080` |
| spark-thriftserver | 10001 | `spark-thriftserver:10000` |

### Superset Dashboard Performance

Every chart, and every dashboard filter dropdown, runs its dataset's SQL on `spark-thriftserver`. Opening a dashboard sends about a dozen queries at once. Spark runs them in turn, so a query that takes 2–5 s alone takes 15–30 s during an uncached dashboard load.

**Chart cache.** Superset keeps chart results in Redis (`superset_cache`, DB 1) for `SUPERSET_DATA_CACHE_TIMEOUT` seconds (default `3600`; set in `NPHIIS-superset/docker/.env`). The warehouse only changes on the pipeline's 2-hourly incremental run (`incrementalSchedule` in `fhir-data-pipes/docker/config/application.yaml`), so charts lag the warehouse by at most this long. Cache entries are per row-level-security clause, so each county, sub-county and facility has its own and the first load for each area after expiry is still slow. Other Superset caches stay at 300 s. To apply a change, see [Superset configuration only](#superset-configuration-only).

**Show new data immediately** (e.g. after a manual pipeline run) by clearing the cache:

```bash
sudo docker exec superset_cache sh -c "redis-cli -n 1 --scan --pattern 'superset_*' | xargs -r redis-cli -n 1 DEL"
```

**Find slow queries.** The Spark UI is on host port `4041` (SQL / JDBC tabs). To list the slowest recent queries:

```bash
sudo docker exec spark-thriftserver python3 -c '
import json, urllib.request as u
a = json.load(u.urlopen("http://localhost:4040/api/v1/applications"))[0]["id"]
q = json.load(u.urlopen(f"http://localhost:4040/api/v1/applications/{a}/sql?details=false&length=1000"))
for x in sorted(q, key=lambda x: -x["duration"])[:15]:
    print(x["submissionTime"][:19], round(x["duration"] / 1000, 1), "s", x["description"][:100].replace("\n", " "))'
```

A query that is slow alone points to its dataset SQL. One that is only slow inside a burst of other queries means Spark is overloaded: check its memory (`sudo docker stats spark-thriftserver`; `--driver-memory` and `mem_limit` are in `fhir-data-pipes/docker/compose-controller-spark-sql-released.yaml`).

**Precomputed VHF tables.** The VHF line list, transmission tree and contact datasets pivot every Observation. Rather than doing that for every chart, `NPHIIS-superset/docker/nphiis-analytics/refresh_tables.py` builds them into Spark tables (`nphiis_vhf_line_list`, `nphiis_vhf_transmission_tree`, `nphiis_vhf_contacts`), and the Superset datasets read those tables. "VHF County Map" joins the line-list table to the county boundaries. The SQL is versioned in `nphiis-analytics/datasets/`; edit it there, not in Superset.

- **When:** hourly at :10 by the Superset Celery beat (task `nphiis.refresh_analytics_tables`), shortly after the pipeline's 2-hourly run; also at every deployment (Superset init step 4, `vhf_contacts_setup.py`, which also points the datasets at the tables).
- **Freshness:** new pipeline data reaches the VHF dashboards within about 10 minutes, plus the chart cache. Columns based on today's date (contact status, "Seen Recently") are fixed at build time, so they lag by up to 10 minutes after midnight.
- **Rebuild now:** `sudo docker exec superset_app python /app/docker/nphiis-analytics/refresh_tables.py`, then clear the chart cache (above).
- **Check the hourly job:** `sudo docker logs superset_worker 2>&1 | grep refresh_analytics_tables`.
- **How a rebuild works:** each run writes new `<name>__<UTC timestamp>` tables, points the `<name>` view at them and keeps the previous build; older builds are dropped. A failed build leaves the view on the last good one.
- If the tables are missing (e.g. the Spark volume `docker_spark_vol_single` was deleted), the VHF dashboards fail until a rebuild runs.

**Spark "Cannot call methods on a stopped SparkContext".** Every query fails with this after the thrift server's driver runs out of memory (`OutOfMemoryError` in `sudo docker logs spark-thriftserver`). The container keeps running and its health check stays green, so it does not restart itself. Recreate it:

```bash
sudo docker compose -f fhir-data-pipes/docker/compose-controller-spark-sql-released.yaml up -d --no-deps --force-recreate spark
```

The `spark.ui.retained*` and `spark.sql.ui.retainedExecutions` settings in that compose file limit how much query history the driver keeps; the defaults filled the 2 GB heap on 2026-10-18.

### Analytics Postgres (VHF pilot)

The VHF dashboards are being moved from Spark to Postgres: Spark's thrift server answers a dashboard's dozen parallel queries one after another (15–30 s), Postgres in parallel (well under a second). Spark stays for the other dashboards until they move too; the pipeline writes Parquet itself and does not need Spark.

**Data flow.** Every pipeline run (full and incremental) also upserts flattened views into the `fhir_analytics` database on `analytics-postgres`: `fhir-data-pipes/docker/config/application.yaml` sets `sinkDbConfigPath` and `viewDefinitionsDir`, and `config/view-definitions/*.json` (SQL-on-FHIR ViewDefinitions) define the tables, one per view, named after it:

| Table | One row per |
| --- | --- |
| `patient_flat_pg`, `patient_identifier_pg` | Patient; Patient identifier |
| `encounter_flat_pg`, `observation_flat_pg` | Encounter; Observation (form answers, coded by linkId) |
| `questionnaire_response_flat_pg`, `questionnaire_response_answer_pg` | QuestionnaireResponse; answer at any depth |
| `location_flat_pg`, `location_type_pg` | Location; Location type |
| `list_flat_pg`, `list_entry_pg` | VHF contact list (one per case); contact on it, with its status flag |
| `specimen_flat_pg`, `task_flat_pg`, `diagnostic_report_flat_pg`, `diagnostic_report_result_pg` | NPHL specimen; submission task; result report; result Observation |
| `practitioner_role_pg` | User role (nphiis-roles) and its location |
| `group_flat_pg`, `group_member_pg` | Contact group (earlier model); member |

`List`, `Task`, `DiagnosticReport`, `PractitionerRole` and `Group` were added to `resourceList` on 2026-10-18. A type added there is only complete after a **full run** (incremental runs fetch changes only): `curl -X POST 'http://localhost:8090/run?runMode=FULL'` on the host, then check `curl http://localhost:8090/status`. Rows are replaced by resource id, so incremental runs only rewrite what changed. Missing values arrive as `''`; timestamps are ISO text (the SQL casts them).

**`meta.lastUpdated` is East Africa Time labelled UTC** in Parquet, Spark and Postgres alike: HAPI stores EAT without a zone and the pipeline's HAPI_JDBC fetch reads it as UTC (e.g. HAPI's `14:29:43+03:00` arrives as `14:29:43+00:00`). Dates taken from it ("Date Reported") are therefore Kenyan dates; compare HAPI's `hfj_resource.res_updated` with EAT times. The controller's **Recreate views** action drops and rebuilds these tables.

**Changing the pipeline config** (`resourceList`, the sink, view definitions): the controller reads `application.yaml` and the view definitions only at start-up. Recreate it while it is idle (`curl http://localhost:8090/status` shows `"IDLE"`), outside the 2-hourly runs (:00 UTC, even hours):

```bash
sudo docker compose -f fhir-data-pipes/docker/compose-controller-spark-sql-released.yaml up -d --no-deps --force-recreate pipeline-controller
curl -X POST 'http://localhost:8090/run?runMode=FULL'   # only when resourceList gained a type
```

**Spark view warning after adding PractitionerRole.** The first full run logged `Error while executing SQL in config/views/PractitionerRole_flat.sql: Table or view not found: PractitionerRole`. The controller runs every `config/views` file whose name starts with a resource type, so this one also ran for `Practitioner`, before the PractitionerRole table existed; it succeeded on the PractitionerRole pass and later runs find the table. Harmless.

**Checking that incremental runs reach Postgres.** Compare what HAPI changed since a run's start with the sink. HAPI's `res_updated` is East Africa Time (see above), so give the cutoff in EAT:

```bash
# Resources HAPI changed since 14:51 EAT (11:51 UTC)
sudo docker exec hapi-fhir-postgres psql -U postgres -d hapi -c "
  SELECT r.res_type, COALESCE(f.forced_id, r.res_id::text) AS id, r.res_updated
  FROM hfj_resource r LEFT JOIN hfj_forced_id f ON f.resource_pid = r.res_id
  WHERE r.res_updated > '2026-10-18 14:51:27' AND r.res_deleted_at IS NULL ORDER BY r.res_updated"
# After the next run: each should be in its table with that lastUpdated (same wall time, labelled +00:00)
sudo docker exec analytics-postgres psql -U analytics -d fhir_analytics -c "
  SELECT id, last_updated FROM observation_flat_pg ORDER BY NULLIF(last_updated, '')::timestamptz DESC LIMIT 10"
```

**Rollout record**

| When (2026-10-18, UTC) | Step | Result |
| --- | --- | --- |
| 11:01 | `analytics-postgres` started; sink loaded from the 10:00 snapshot | Row counts equal the warehouse (134,013 Observations, 4,849 Patients, 4,856 Encounters, 27,978 Locations) |
| 11:30–11:40 | VHF datasets ported, Superset datasets "… (Postgres)" created (ids 138–141), `--check`, `--compare` | All 29 VHF charts run on Postgres; 14 identical, 15 differ by the one Busia record (see Known differences) |
| 11:50 | Controller recreated with the sink and the added resource types | Started cleanly |
| 11:51–11:55 | Full run | New snapshot with List, Task, DiagnosticReport, PractitionerRole, Group; sink upserted, no duplicates |
| 12:00 | Scheduled incremental run | Clean, but HAPI had no changes since the full run, so nothing was written: **incremental updates of the sink are not yet confirmed by live data** |
| 12:02–12:05 | Sink tables rebuilt from HAPI with timestamps as text (`--recreateSinkTables`, then `00_setup.sql`) | Same rows; comparison unchanged; dataset queries 0.3–0.6 s |

**Still to do**

1. Confirm an incremental run with live changes (the check above) after the next edit in HAPI.
2. `vhf_postgres_setup.py --switch`, then `NPHIIS_VHF_SOURCE=postgres` in `NPHIIS-superset/docker/.env`; reload both VHF dashboards and check the area-scoped views (county, sub-county, facility users and the admin portal embeds).
3. Measles, AFP and mpox datasets, in that order; then decide whether Spark can be retired.

**Datasets.** `NPHIIS-superset/docker/nphiis-analytics/postgres/*.sql` are the VHF datasets in Postgres SQL (`-- @include` embeds one in another); `00_setup.sql` holds the helper functions (schema `nphiis`), indexes, the read-only login's grants and database settings (`jit = off`: JIT compilation cost seconds per query). Superset reads them as plain queries, so the dashboards follow each pipeline run with nothing to refresh. `vhf_postgres_setup.py` (Superset init step 5) creates the database connection "NPHIIS Analytics (Postgres)" (`ANALYTICS_DB_URI` in `NPHIIS-superset/docker/.env`, login `superset_ro`) and a "<name> (Postgres)" twin of each Spark VHF dataset, with the same column settings, metrics and row-level security rules.

```bash
# Apply 00_setup.sql (after a new database, or after editing it)
sudo docker exec -i analytics-postgres psql -U analytics -d fhir_analytics < NPHIIS-superset/docker/nphiis-analytics/postgres/00_setup.sql
# First time: the read-only login (password = ANALYTICS_RO_PASSWORD), then 00_setup.sql again for its grants
sudo docker exec -it analytics-postgres psql -U analytics -d fhir_analytics -c "CREATE ROLE superset_ro LOGIN PASSWORD '<password>'"

S="sudo docker exec superset_app python /app/docker/nphiis-analytics/vhf_postgres_setup.py"
$S --check     # every VHF chart's metrics and filters run on Postgres
$S --compare   # each chart's numbers on Spark and on Postgres
$S --switch    # charts + dashboard filters to Postgres (Spark settings saved in superset_home)
$S --revert    # back to Spark
```

After `--switch`, set `NPHIIS_VHF_SOURCE=postgres` in `NPHIIS-superset/docker/.env` so deployments keep the charts on Postgres.

**Known differences from Spark** (2026-10-18 comparison: line list 862 rows × 61 columns, tree 800 nodes, contacts 788 rows): where several answers share one `lastUpdated` (a record re-saved at once), Postgres takes the answer with the latest `issued` time; Spark picked one arbitrarily. One Busia record differs for this reason (Spark: contact; Postgres: confirmed case), which moves several VHF counts by one.

**Line lists over the API.** hie-auth serves the same rows as the "VHF Line List" and "vhf_contacts" datasets: `GET /reports/vhf/line-list` (cases and contacts; `recordType=Case|Contact`) and `GET /reports/vhf/contacts` (21-day follow-up; `status=active|flagged|lost|completed|converted`), through nginx at `/api/reports/vhf/...`. Both take `period` (`today`, `this_week`, `last_week`, `this_month`, `last_month`, `last_30_days`, `2026-10`, `2026-W43`, …) or `from`/`to` (yyyy-mm-dd, inclusive) on the date reported / date of contact, `format=json|csv`, `limit` (default 5000, max 50000) and `offset`. A Keycloak bearer token sees the user's area, as in Superset; `X-Api-Key: $REPORTS_API_KEY` sees all areas. They need `ANALYTICS_DB_URL` in `hie-auth/.env` (the `superset_ro` login). The SQL is a copy in `hie-auth/sql/vhf/`; after editing a dataset here, copy it there too (`vhf-line-lists.test.ts` fails until you do).

```bash
curl -H "Authorization: Bearer $TOKEN" "https://<host>/api/reports/vhf/line-list?recordType=Case&period=this_month"
curl -H "X-Api-Key: $REPORTS_API_KEY" -o contacts.csv "https://<host>/api/reports/vhf/contacts?period=last_21_days&format=csv"
```

**Load the sink without waiting for a run** (a new database, or after changing a view definition). From HAPI directly, for every resource type that has a view (the same read-only queries the controller runs):

```bash
cd fhir-data-pipes/docker
sudo docker run --rm --network cloudbuild --memory 3g -v "$PWD/config:/app/config:ro" \
  -e FLINK_CONF_DIR=/app/config --entrypoint java us-docker.pkg.dev/cloud-build-fhir/fhir-analytics/main:latest \
  -Xmx2g -Dloader.main=com.google.fhir.analytics.FhirEtl -cp /app/controller-bundled.jar \
  org.springframework.boot.loader.launch.PropertiesLauncher --runner=FlinkRunner \
  --fhirFetchMode=HAPI_JDBC --fhirDatabaseConfigPath=/app/config/hapi-postgres-config_local.json \
  --fhirServerUrl=http://hapi-fhir-jpa:8080/fhir \
  --resourceList=Patient,Encounter,Observation,Location,QuestionnaireResponse,List,Task,DiagnosticReport,Specimen,PractitionerRole,Group \
  --sinkDbConfigPath=/app/config/analytics-postgres-config.json --viewDefinitionsDir=/app/config/view-definitions \
  --outputParquetPath=
sudo docker exec analytics-postgres psql -U analytics -d fhir_analytics -c ANALYZE
```

It takes about 2.5 minutes. Run it between the controller's runs. Or from a Parquet snapshot (only the types that snapshot holds):

```bash
cd fhir-data-pipes/docker
SNAP=$(ls -d dwh/controller_DWH_TIMESTAMP_* | sort | tail -1 | xargs basename)
sudo docker run --rm --network cloudbuild --memory 3g -v "$PWD/dwh:/dwh:ro" -v "$PWD/config:/app/config:ro" \
  -e FLINK_CONF_DIR=/app/config --entrypoint java us-docker.pkg.dev/cloud-build-fhir/fhir-analytics/main:latest \
  -Xmx2g -Dloader.main=com.google.fhir.analytics.FhirEtl -cp /app/controller-bundled.jar \
  org.springframework.boot.loader.launch.PropertiesLauncher --runner=FlinkRunner \
  --fhirFetchMode=PARQUET --parquetInputDwhRoot=/dwh/$SNAP \
  --resourceList=Patient,Encounter,Observation,Location,QuestionnaireResponse,List,Task,DiagnosticReport,Specimen,PractitionerRole,Group \
  --sinkDbConfigPath=/app/config/analytics-postgres-config.json --viewDefinitionsDir=/app/config/view-definitions \
  --outputParquetPath=
sudo docker exec analytics-postgres psql -U analytics -d fhir_analytics -c ANALYZE
```

Use `--runner=FlinkRunner`: Beam's default runner keeps everything in memory and ran out at 1.5 GB. Add `--recreateSinkTables=true` after changing a view definition's columns (then re-apply `00_setup.sql` for the indexes and grants).

### Environment File Summary

| File | Template |
| --- | --- |
| `nphiis-admin/.env` | `nphiis-admin/env.example` |
| `hie-auth/.env` | No template — see [Section 3.2](#32-hie-authenv) |
| `keycloak/.env` | No template — see [Section 3.3](#33-keycloakenv) |
| `fhir-gateway/.env` | No template — see [Section 3.4](#34-fhir-gatewayenv) |
| `NPHIIS-superset/docker/.env` | `NPHIIS-superset/docker/.env.example` (chart cache: [Superset Dashboard Performance](#superset-dashboard-performance); `ANALYTICS_DB_URI`, `NPHIIS_VHF_SOURCE`: [Analytics Postgres](#analytics-postgres-vhf-pilot)) |
| `fhir-data-pipes/docker/analytics-postgres.env` | `fhir-data-pipes/docker/analytics-postgres.env.example` |
| `fhir-data-pipes/docker/config/analytics-postgres-config.json` | `….json.example` (same password as `POSTGRES_PASSWORD` above) |

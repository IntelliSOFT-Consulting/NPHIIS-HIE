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

Starts `pipeline-controller` (port 8090) and `spark-thriftserver` (port 10001).

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

`hie-auth` relies on two active FHIR subscriptions being present in HAPI FHIR:

| Subscription | Criteria | Endpoint |
| --- | --- | --- |
| EPID auto-assignment | `Encounter?` | `http://hie-auth:3000/subscriptions/encounter` |
| AFP follow-up | `Observation?code=502488184403` | `http://hie-auth:3000/subscriptions/observation` |

Verify they exist:

```bash
curl -sf https://<FHIR_HOST>/hapi/fhir/Subscription | jq '.total'
```

If missing, POST the subscription resources via the FHIR API or re-trigger the hie-auth startup routine that seeds them.

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

### Environment File Summary

| File | Template |
| --- | --- |
| `nphiis-admin/.env` | `nphiis-admin/env.example` |
| `hie-auth/.env` | No template — see [Section 3.2](#32-hie-authenv) |
| `keycloak/.env` | No template — see [Section 3.3](#33-keycloakenv) |
| `fhir-gateway/.env` | No template — see [Section 3.4](#34-fhir-gatewayenv) |

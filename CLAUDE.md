# NPHIIS HIE — Claude Code Context

## Project Overview

NPHIIS HIE is the backend infrastructure for Kenya's **National Public Health Intelligence Information System** — a disease surveillance platform operated by the Ministry of Health. It provides FHIR-native data exchange, case management automation, identity management, and analytics across 47 counties.

See [`docs/architecture.md`](docs/architecture.md) for the full architecture reference.

---

## Repository Structure

| Directory | Service | Tech stack |
| --- | --- | --- |
| `nphiis-admin/` | Web App | Next.js 15.5.7, TypeScript, Tailwind CSS |
| `hie-auth/` | Application Engine | Node.js, TypeScript, Express, Prisma, PostgreSQL 14 |
| `hie/` | HAPI FHIR + init config | Docker Compose — HAPI FHIR v6.8.0 (R4), PostgreSQL 14 |
| `hapi-fhir-config/` | Location seeder | One-shot Alpine container; seeds Kenya admin boundaries |
| `fhir-gateway/` | FHIR access-control proxy | Google fhir-gateway (Java) |
| `keycloak/` | Identity & Access Manager | Keycloak v26.0.1, PostgreSQL 14 |
| `fhir-data-pipes/` | FHIR Analytics Engine | pipeline-controller (Java) + Bitnami Spark 3.3 |
| `NPHIIS-superset/` | Advanced Reporting | Apache Superset |
| `proxy/` | Edge proxy | Nginx Alpine, TLS termination |
| `docs/` | Documentation | Markdown |
| `scripts/` | Utilities | Python (bulk_register.py) |

> `reports/` is carried over from an older project and is **not in use**.

---

## Starting Services

Each component has a dedicated start script. All require the `cloudbuild` Docker network:

```bash
docker network create cloudbuild   # one-time setup
```

| Script | Starts |
| --- | --- |
| `./start-hie.sh` | HAPI FHIR, hie-auth, fhir-gateway, Nginx, Keycloak |
| `./start-admin.sh` | nphiis-admin Web App |
| `./start-gateway.sh` | fhir-gateway only |
| `./start-data-pipes.sh` | FHIR Data Pipes + Spark |
| `./start-superset.sh` | Apache Superset |

All scripts accept docker compose sub-commands as arguments (e.g. `./start-hie.sh logs -f`).

---

## Public Hostnames (Production)

Nginx routes traffic based on `server_name`. All domains share the `*.intellisoftkenya.com` TLS cert.

| Hostname | Routes to |
| --- | --- |
| `dsrfhir.intellisoftkenya.com/hapi/` | HAPI FHIR Server |
| `dsrfhir.intellisoftkenya.com/api/` | hie-auth API |
| `dsrdata.intellisoftkenya.com` | FHIR Data Pipes pipeline controller |
| `dsrsuperset.intellisoftkenya.com` | Apache Superset |
| `dsrkeycloak.intellisoftkenya.com` | Keycloak |
| `dsrkeycloak.intellisoftkenya.com/auth/` | hie-auth auth routes |
| `dsrkeycloak.intellisoftkenya.com/hie-admin` | nphiis-admin Web App |

---

## Key Architecture Facts

### HAPI FHIR Server
- Version `hapiproject/hapi:v6.8.0`, **FHIR R4**
- Production address: `https://auth.nphiis.health.go.ke/fhir`
- CQL enabled, bulk export enabled, REST-hook subscriptions enabled
- `hapi-fhir-config` seeds Location resources on first start (counties → sub-counties → wards → facilities → community units)

### hie-auth (Application Engine)
The core business logic service. Key responsibilities:
- **EPID auto-assignment** — triggered by FHIR `Encounter` subscription REST-hook; format: `{COUNTRY_3}-{COUNTY_3}-{SUBCOUNTY_3}-{YEAR}-{CONDITION}-{SEQ_3}` (e.g. `KEN-NAI-WES-2024-AFP-001`)
- **AFP 60-day follow-up notifications** — cron daily at 06:30 EAT (`30 3 * * *` UTC), driven by `Observation` subscription on code `502488184403`
- **Case submission notifications** — FCM push + SMTP email on new EPID assignment
- **Superset guest tokens** — issued on demand for dashboard embedding in the Web App
- **FHIR reverse proxy** — `/fhir/*` route authenticates bearer tokens via Keycloak before forwarding to HAPI

Database (Prisma ORM, PostgreSQL 14, db: `nphiis-mediators`):
- `CaseIdTracker` — sequential case counter per `[country, county, sub-county, condition]`
- `Notification` — AFP follow-up and case submission notification records
- `NotificationRecipient` — FCM device tokens per practitioner
- `FhirSubscriptionCallbackLog` — audit log of inbound REST-hook callbacks

### Keycloak
- Version 26.0.1, realm `nphiis`, client `nphiis-admin`
- Stores `fhirPractitionerId` as a user attribute linking Keycloak users to HAPI `Practitioner` resources

### FHIR Implementation Guide
- Repository: https://github.com/IntelliSOFT-Consulting/Surveillance-FHIR-IG
- Defines all FHIR profiles, questionnaires, and terminology the platform conforms to
- 9 profiles (Patient, Condition, Encounter, Location, Organization, Practitioner, PractitionerRole, RelatedPerson, ServiceRequest)
- 13 SDC questionnaires covering Measles, AFP, VL/HIV, Mpox, Rumor Tracking, MOH-505
- Toolchain: FSH / SUSHI / HL7 IG Publisher, FHIR R4 (4.0.1)

---

## RBAC Roles

Defined in `nphiis-admin/src/lib/roles.ts` and enforced in both the Web App and hie-auth:

```
ADMINISTRATOR, SUPERUSER,
NATIONAL_FOCAL_PERSON, NATIONAL_VIEWER,
COUNTY_DISEASE_SURVEILLANCE_OFFICER,
SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER,
FACILITY_SURVEILLANCE_FOCAL_PERSON,
LAB_TECHNICIAN, NATIONAL_LAB,
VACCINATOR, NURSE, SUPERVISORS
```

---

## Environment Files

Copy and populate before running any service:

| File | Template |
| --- | --- |
| `nphiis-admin/.env` | `nphiis-admin/env.example` |
| `hie-auth/.env` | — |
| `keycloak/.env` | — |
| `fhir-gateway/.env` | — |

Key variables in `nphiis-admin/env.example`:
- `FHIR_BASE_URL` — HAPI FHIR endpoint (docker: `http://hapi-fhir-jpa:8080/fhir`, local dev: `http://localhost:8787/fhir`)
- `KEYCLOAK_URL` / `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID`
- `SUPERSET_URL` / `SUPERSET_GUEST_USER` / `SUPERSET_GUEST_PASSWORD`
- `NEXT_PUBLIC_SUPERSET_DASHBOARD_IDSR_CBS` — embed UUID for the IDSR CBS dashboard

---

## Web App Routes (`nphiis-admin`)

| Route | Purpose |
| --- | --- |
| `/dashboard` | Embeds Superset IDSR CBS dashboard via `@superset-ui/embedded-sdk` |
| `/lab` | Laboratory result management |
| `/locations` | Kenya admin hierarchy browser |
| `/users` | User provisioning (Keycloak + FHIR Practitioner) |
| `/settings` | System configuration |
| `/subscription-logs` | FHIR subscription callback audit log (admin only) |

---

## Service Port Reference

| Service | Host port | Notes |
| --- | --- | --- |
| Nginx | 80, 443 | TLS termination |
| nphiis-admin | 8080 | Next.js |
| hie-auth | 8443 | Express / Node.js |
| hapi-fhir-jpa | 8787 | HAPI FHIR R4 |
| fhir-gateway | 8099 | FHIR access-control proxy |
| keycloak | 8888 | Keycloak IAM |
| pipeline-controller | 8090 | FHIR Data Pipes |
| spark-thriftserver | 10001 | JDBC/SQL endpoint |

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — Full architecture reference (client layer, gateway layer, backend layer, FHIR IG, Kenya Digital Health Superhighway, capabilities, port reference)
- [`docs/README.md`](docs/README.md) — Docs index

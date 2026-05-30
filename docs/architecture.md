# NPHIIS Architecture
## Introduction
This document provides an overview of the architecture of the National Public Health Intelligence Information System (NPHIIS). It describes the overall structure of the platform, its core components, and how these components interact to support public health surveillance and outbreak response.

NPHIIS is designed as a modular and scalable platform that supports end-to-end routine surveillance functions, including case reporting, case management, laboratory data capture, and event tracking. The architecture enables these functions to work together in a coordinated manner, ensuring that data collected through the platform can be effectively managed and used to support public health decision-making.

This document is intended for developers, system architects, and other stakeholders involved in the design, implementation, integration, and maintenance of the platform.

The data structures and clinical forms used across all NPHIIS components are governed by the **Surveillance FHIR Implementation Guide (IG)**, which defines the FHIR R4 profiles, questionnaires, and terminology that the entire platform conforms to.

---

## Component Architecture
NPHIIS is built as a FHIR-native application organized into three principal layers — **client**, **gateway**, and **backend**. All services communicate over a shared Docker network (`cloudbuild`) and are exposed through an Nginx reverse proxy that handles TLS termination.



```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            NPHIIS HIGH-LEVEL ARCHITECTURE                               │
├──────────────────────────────────────────────┬──────────────────────────────────────────┤
│     Client Layer (Web & Mobile Front-end).   │       External Integrations              │
│                                              │                                          │
│  Mobile App (Android)   Web Admin App        │  ┌──────────────┐  ┌──────────────┐      │
│  • Android FHIR SDK     (Next.js)            │  │  KEMRI LAB   │  │     KHIS     │      │
│  • Offline data capture • Dashboard &        │  └──────────────┘  └──────────────┘      │
│  • Background sync        Reports            │                                          │
│                         • User/Location Mgmt │                                          │
│                         • Lab Results Mgmt   │                                          │
│                         • Settings           │                                          │
│                         • Subscription Logs  │                                          │
├──────────────────────────────────────────────┴──────────────────────────────────────────┤
│                                  Gateway Layer                                          │
│                                                                                         │
│              Nginx (TLS/443)  →  fhir-gateway (FHIR access control)                     │
├──────────────────┬──────────────────┬──────────────┬──────────────┬─────────────────────┤
│  Integration     │  HAPI FHIR       │  hie-auth    │  FHIR Data   │  Keycloak           │
│  Service         │  Server v6.8.0   │  (Application│  Pipes       │  v26.0.1            │
│                  │  (FHIR R4)       │   Engine)    │  (Spark 3.3) │  (IAM)              │
│  Integration     │                  │              │              │                     │
│  API             │  hapi-fhir-      │  nphiis-     │  pipeline-   │  keycloak-          │
│                  │  postgres (PG14) │  postgres    │  controller  │  postgres (PG14)    │
│                  │                  │  (PG14)      │              │                     │
├──────────────────┴──────────────────┴──────────────┴──────────────┴─────────────────────┤
│                                    Backend Layer                                        │
│                       hapi-fhir-config (one-shot location seeder)                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```
---

---

## 1. Client Layer
### a. Mobile App
The mobile app targets field surveillance officers operating in areas with limited or intermittent connectivity. It is built on the **Android FHIR SDK** and provides:

- Local FHIR resource management with on-device storage
- Offline case data capture with background synchronization
- OAuth 2.0 / OpenID Connect authentication against Keycloak
Synchronization with the FHIR server is **bidirectional**:

- **Pull**: Active case investigations, alert notifications, and workflow tasks
- **Push**: Case reports, specimen collection records, and field observations captured on-device
### b. Web App (`nphiis-admin`)
The Web App is a **Next.js 15.5.7** / TypeScript application styled with Tailwind CSS. It serves surveillance officers and national program administrators. Its actual application routes are:

| Route | Purpose |
| ----- | ----- |
| `/dashboard`  | Operational overview; embeds Apache Superset dashboards via `@superset-ui/embedded-sdk`  |
| `/lab`  | Laboratory result management (submission and review) |
| `/locations`  | Geographic hierarchy browsing (country → county → sub-county → ward → facility → community unit) |
| `/users`  | User provisioning — creates Keycloak accounts and corresponding FHIR Practitioner resources |
| `/settings`  | System-level configuration |
| `/subscription-logs`  | Audit view of FHIR subscription callback logs (admin/superuser only) |
Authentication uses **Keycloak OIDC** client (`nphiis-admin` client in the `nphiis` realm). The web app calls the FHIR server directly through `hie-auth`'s authenticated `/fhir` proxy rather than the raw HAPI endpoint.

Advanced analytics (Apache Superset) are embedded inside the dashboard route using guest tokens issued by `hie-auth`, not as a separate application the user navigates to.

**Access control** is enforced by the following 12 roles:

| Role | Scope |
| ----- | ----- |
| `ADMINISTRATOR`  | Full system access |
| `SUPERUSER`  | Full system access |
| `NATIONAL_FOCAL_PERSON`  | National-level surveillance, reports |
| `NATIONAL_VIEWER`  | Read-only national view |
| `COUNTY_DISEASE_SURVEILLANCE_OFFICER`  | County-scoped surveillance |
| `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER`  | Sub-county-scoped surveillance |
| `FACILITY_SURVEILLANCE_FOCAL_PERSON`  | Facility-level reporting |
| `LAB_TECHNICIAN`  | Lab data entry and review |
| `NATIONAL_LAB`  | National-scope lab access |
| `VACCINATOR`  | Vaccination data entry |
| `NURSE`  | Clinical data entry |
| `SUPERVISORS`  | Supervisory access |
---

## 2. Gateway Layer
The gateway layer sits between all client applications and the backend services. There is no OpenHIM instance in the current deployment.

### Nginx (Edge Proxy)
An **Nginx Alpine** container terminates TLS using the `*.intellisoftkenya.com` wildcard certificate and routes HTTPS traffic on ports 80/443 to internal services over the `cloudbuild` Docker network.

### FHIR Info Gateway (`fhir-gateway`)
Google's open-source **FHIR Gateway** (image: `us-docker.pkg.dev/fhir-proxy-build/stable/fhir-gateway`) provides access-controlled proxying of FHIR API requests. It enforces:

- Token validation against Keycloak (`TOKEN_ISSUER` )
- Allowed-query filtering (`ALLOWED_QUERIES_FILE` )
- Configurable access checker (`ACCESS_CHECKER` )
- Pass-through to HAPI FHIR (`PROXY_TO` )
The gateway runs in `PROD` mode by default, enforcing the token issuer check on every inbound request.

---

## 3. Backend Layer
### HAPI FHIR Server
**Version**: `hapiproject/hapi:v6.8.0` — **FHIR R4**

The HAPI FHIR Server is the national central repository for all surveillance data, backed by a dedicated **PostgreSQL 14** instance (`hapi-fhir-postgres`). Resources stored on this server conform to the profiles defined in the [Surveillance FHIR IG](#4-fhir-implementation-guide). Key configuration:

- FHIR R4 compliance with OpenAPI (`/fhir/swagger-ui/index.html` ) enabled
- CQL execution enabled (`cql_enabled: true` )
- Bulk export enabled
- Advanced Lucene indexing enabled
- REST-hook subscriptions enabled (websocket disabled)
- CORS open (`*` ) — access control is enforced at the gateway
- Production server address: `https://auth.nphiis.health.go.ke/fhir` 
- Local base URL alias: `http://dsrfhir.intellisoftkenya.com/hapi/fhir` 
On first start, a one-shot init container (`hapi-fhir-config`) seeds the Kenya administrative boundary hierarchy as FHIR Location bundles:

| Bundle | Description |
| ----- | ----- |
| `fhir-bundle-counties-kenya.json`  | All 47 counties |
| `fhir-bundle-sub-counties-kenya.json`  | Sub-county Level |
| `fhir-bundle-wards-kenya.json`  | Ward level |
| `fhir-bundle-facilities-kenya.json`  | Health facilities (chunked upload, 500/batch) |
| `fhir-bundle-community-units-kenya.json`  | Community units (chunked upload, 500/batch) |
### `hie-auth` — Application Engine
`hie-auth` is a **Node.js / TypeScript / Express** service that serves as the core business logic layer for NPHIIS. It is backed by its own **PostgreSQL 14** instance (`nphiis-postgres`, database: `nphiis-mediators`) managed via **Prisma ORM**. It exposes the following API surface:

| Route prefix | Responsibility |
| ----- | ----- |
| `POST /client/*`  | Client-side authentication flows (token exchange, refresh) |
| `POST /provider/*`  | User registration, profile update, role management via Keycloak |
| `GET /reports/*`  | User and role listing (aggregates Keycloak + FHIR Practitioner data) |
| `POST /notifications/*`  | FCM device token registration; notification retrieval |
| `GET /subscriptions/*`  | FHIR subscription callback log access |
| `ALL /fhir/*`  | Authenticated FHIR reverse proxy — validates the bearer token via Keycloak middleware before forwarding to HAPI; used by the Web App for all FHIR interactions |
#### EPID Auto-Assignment
When a new `Encounter` resource is created on HAPI FHIR, a FHIR subscription REST-hook fires to `hie-auth`. The service resolves the patient's sub-county, county, and country from FHIR Location resources and generates an epidemiological ID in the format:

```text
{COUNTRY_3}-{COUNTY_3}-{SUBCOUNTY_3}-{YEAR}-{CONDITION}-{SEQ_3}
```
For example: `KEN-NAI-WES-2024-AFP-001` 

Supported disease conditions: `AFP` (acute flaccid paralysis), `MEA` (measles), `MOH505`. A sequential case counter per `[country, county, sub-county, condition]` tuple is tracked in the `CaseIdTracker` table to prevent duplicate IDs under concurrent writes.

A second subscription on `Observation` resources (code `502488184403`) triggers AFP 60-day follow-up scheduling.

#### Notifications
`hie-auth` manages two notification channels:

- **FCM push** (via Firebase Admin SDK) — device tokens registered per practitioner
- **SMTP email** (via Nodemailer) — case submission alerts to configured roles
Two notification types are tracked in the `Notification` table:

| Type | Trigger | Delivery |
| ----- | ----- | ----- |
| `AFP_FOLLOW_UP`  | 60 days after AFP investigation date | Daily cron at 06:30 EAT |
| `CASE_SUBMISSION`  | On new EPID assignment (Encounter subscription) | Immediate FCM + email |
#### Cron Jobs
| Schedule | Job |
| ----- | ----- |
| Daily 06:30 EAT (`30 3 * * *` UTC) | Send pending AFP follow-up FCM notifications with 2-day retry window |
| Configurable via `ENCOUNTER_BACKFILL_CRON_SCHEDULE` (default: `0 2 * * 0`) | Backfill EPID assignment for encounters missing EPID identifiers |
#### Superset Integration
`hie-auth` issues Superset **guest tokens** on demand, used by the Web App to embed dashboards. The primary embedded dashboard is the IDSR Case-Based Surveillance dashboard (covers MOH 503 and MOH 502 — AFP, Measles — tabs internally).

### FHIR Analytics Engine (`fhir-data-pipes`)
The analytics pipeline uses:

- `**pipeline-controller**`  (image: `us-docker.pkg.dev/cloud-build-fhir/fhir-analytics/main:latest` ) — reads FHIR resources from HAPI and writes Parquet files to a shared `DWH_ROOT`  volume
- **Bitnami Spark 3.3** (`spark-thriftserver` ) — serves a **JDBC Thrift endpoint on port 10001** for SQL queries against the Parquet files
- Pipeline controller management UI: port **8090**
This layer is completely decoupled from transactional HAPI FHIR operations and feeds Apache Superset with aggregated indicator, outbreak signal, and trend datasets.

### Identity & Access Manager — Keycloak
**Version**: `quay.io/keycloak/keycloak:26.0.1` 

Keycloak runs in the `nphiis` realm and provides:

- OAuth 2.0 / OIDC token issuance for all client applications
- User registration and attribute storage (including `fhirPractitionerId`  linking to HAPI `Practitioner`  resources)
- Custom UI themes (mounted from `keycloak/themes` )
- Role-based access evaluated by `hie-auth`  and the Web App on every request
Keycloak is backed by a dedicated **PostgreSQL 14** instance (`keycloak-postgres`).

---

## 4. FHIR Implementation Guide

The **Surveillance FHIR Implementation Guide** is the canonical standards artifact that governs all FHIR data structures used across NPHIIS. It is maintained separately from the runtime stack and defines the profiles, questionnaires, and terminology that client applications, the HAPI FHIR server, and integration layer must conform to.

- **Repository**: [IntelliSOFT-Consulting/Surveillance-FHIR-IG](https://github.com/IntelliSOFT-Consulting/Surveillance-FHIR-IG)
- **FHIR version**: R4 (4.0.1)
- **Status**: Draft v0.1.0
- **Publisher**: Kenya National Public Health Institute
- **Toolchain**: FHIR Shorthand (FSH) compiled with SUSHI, published via the HL7 FHIR IG Publisher

### Profiles

The IG defines 9 FHIR R4 profiles that standardize the resources stored in HAPI FHIR:

| Profile | Base resource | Purpose |
| --- | --- | --- |
| `SurveillancePatient` | Patient | Case subject demographics |
| `ConditionProfile` | Condition | Diagnosed notifiable condition, with `CausativeAgent` extension |
| `EncounterProfile` | Encounter | Case investigation encounter (EPID assigned here) |
| `LocationProfile` | Location | Administrative boundary nodes (country → county → sub-county → ward → facility → community unit) |
| `OrganizationProfile` | Organization | Reporting health facility or program unit |
| `PractitionerProfile` | Practitioner | Surveillance officer or clinician |
| `PractitionerRoleProfile` | PractitionerRole | Role-scoped practitioner assignment |
| `RelatedPersonProfile` | RelatedPerson | Contact / next of kin for case tracing |
| `ServiceRequestProfile` | ServiceRequest | Laboratory specimen request |

### Terminology

| Artifact | Name | Content |
| --- | --- | --- |
| Extension | `CausativeAgent` | Codes describing the agent causing a notifiable condition |
| CodeSystem | `UNORDERED` | NPHIIS-specific causative agent codes |
| ValueSet | `CausativeAgentVS` | Bound to the `CausativeAgent` extension |

### Questionnaires

The IG defines 13 SDC-compliant FHIR Questionnaires that are the authoritative source for all data collection forms used in the mobile app and Web App. Each questionnaire uses FHIRPath expressions for dynamic field behaviour, launch contexts for patient pre-population, and calculated values for derived fields.

| Questionnaire | Use case |
| --- | --- |
| Measles Case Report | Measles case investigation form |
| Measles Lab Results | Laboratory confirmation for measles |
| AFP Case Report | Acute Flaccid Paralysis case investigation form |
| Viral Load — HIV Case | HIV/VL case report |
| Viral Load — Hospitalization | Hospitalization details for VL cases |
| Viral Load — Lab Information | Lab results for VL cases |
| Viral Load — 6-Month Follow-up | Follow-up assessment at 6 months |
| Mpox Vaccination Register | Mpox vaccination record |
| Mpox Supervisor Checklist | Supervisor verification form |
| Mpox Tally Sheet | Aggregate tally for Mpox events |
| Rumor Tracking | Outbreak rumor investigation |
| MOH-505 Section A | Health facility weekly report — Section A |
| MOH-505 Section B | Health facility weekly report — Section B |

### Role in the Architecture

The IG is a **design-time artifact**, not a running service. Its role across the stack:

- **HAPI FHIR Server** — Resources submitted to HAPI are expected to conform to the IG profiles. The server's CQL engine can evaluate IG-defined logic against stored resources.
- **Mobile App** — Questionnaire JSON compiled from the IG is loaded into the Android FHIR SDK to drive data capture forms.
- **Web App** — Questionnaire resources stored in HAPI (seeded from the IG) are rendered in the browser for web-based case reporting.
- **`hapi-fhir-config`** — The one-shot init container seeds Location resources that match the `LocationProfile` hierarchy defined in the IG.
- **hie-auth EPID engine** — EPID generation uses `EncounterProfile.reasonCode` codes (`AFP`, `MEA`, `MOH505`) that are defined in the IG.

---

## Kenya Digital Health Superhighway
NPHIIS is fully compliant with Kenya's digital health certification framework and participates in the **Kenya Digital Health Superhighway**. Within the superhighway, NPHIIS powers the **National Health Analytics and Intelligence** node and integrates with:

- **KHIS** (Kenya Health Information System) — aggregated and case-based surveillance data transmission and feedback
- **KEMRI Lab** — bi-directional laboratory result exchange for case confirmation and outbreak monitoring
- **Kenya Health Interoperability Services (KHISL)**
---

## Service Port Reference
| Service | Container port | Host port | Notes |
| ----- | ----- | ----- | ----- |
| Nginx | 80, 443 | 80, 443 | TLS termination |
| nphiis-admin (Web App) | 3000 | 8080 | Next.js |
| hie-auth (App Engine) | 3000 | 8443 | Express / Node.js |
| hapi-fhir-jpa | 8080 | 8787 | HAPI FHIR R4 |
| fhir-gateway | 8080 | 8099 | FHIR access-control proxy |
| keycloak | 8080 | 8888 | Keycloak IAM |
| pipeline-controller | 8080 | 8090 | FHIR Data Pipes |
| spark-thriftserver | 10000 | 10001 | JDBC/SQL endpoint |
---

## Current Capabilities
- **Real-time disease surveillance** with automated EPID assignment and outbreak alerting
- **Electronic case-based reporting** for:
    - Notifiable disease surveillance (MOH 502)
        - AFP Case Investigation Form
        - AFP Contact Tracing (60-day follow-up reminders via FCM + email)
        - Measles Case Investigation Form

    - Weekly Epidemic Monitoring Tool (MOH 505)
    - Line List (MOH 503)
    - Visceral Leishmaniasis Case Management Form
    - Rumor Tracking Tool & Social Investigation
    - Mpox Tools

- **Mobile data collection** app leveraging the Android FHIR SDK (offline-capable with sync)
- **FHIR-based interoperability** with KEMRI Lab and KHIS
- **Web-based administration** — user provisioning, location management, subscription audit logs
- **Embedded analytics dashboards** (Apache Superset) within the Web App
- **FHIR Analytics Engine** for trend detection and predictive modelling via Spark SQL
- **Secure identity and access management** via Keycloak 26.0.1
- **Audit logging** via FHIR subscription callback log table (`FhirSubscriptionCallbackLog` )
- **Push and email notifications** for AFP follow-ups and new case submissions



# NPHIIS HIE

Code and config for the NPHIIS Health Information Exchange. Everything runs in Docker.

## What's in here

| Folder | What it is |
| --- | --- |
| `hie/` | HAPI FHIR JPA server and its Postgres |
| `hapi-fhir-config/` | One-shot job that loads Kenya's counties, sub-counties, wards, facilities and community units |
| `hie-auth/` | Auth and mediator API (Node/TypeScript, Prisma) |
| `keycloak/` | Keycloak, realm themes and client sample |
| `fhir-gateway/` | Token-checking proxy in front of HAPI |
| `proxy/` | Nginx config for the public hostnames |
| `nphiis-admin/` | Admin web app (Next.js) |
| `fhir-data-pipes/` | Analytics pipeline (pipeline controller + Spark thrift server) |
| `NPHIIS-superset/` | Apache Superset dashboards |
| `reports/` | Reports service |
| `packages/fhir-ig/` | FHIR implementation guide (FSH / SUSHI) |
| `scripts/` | Helper scripts, e.g. `bulk_register.py` |
| `docs/` | Architecture and deployment docs |

## Before you start

- Docker Engine 24+ with the Compose v2 plugin
- Git
- About 16 GB RAM free (32 GB is more comfortable)
- Python 3.9+ only if you plan to use `scripts/bulk_register.py`

## Setup

### 1. Clone

```bash
git clone https://github.com/IntelliSOFT-Consulting/NPHIIS-HIE.git
cd NPHIIS-HIE
```

### 2. Create the shared Docker network

```bash
docker network inspect cloudbuild >/dev/null 2>&1 || docker network create cloudbuild
```

### 3. Fill in the env files

There's no root-level compose file, so `docker compose up -d` from the repo root won't do anything. Each service reads its own `.env`, and none of them are committed.

```bash
cp hie/.env.example hie/.env
cp hie-auth/.env.example hie-auth/.env
cp keycloak/.env.example keycloak/.env
cp nphiis-admin/env.example nphiis-admin/.env
```

Then fill them in:

- `hie/.env` sets the three Postgres passwords (`HAPI_DB_PASSWORD`, `NPHIIS_DB_PASSWORD`, `KC_DB_PASSWORD`). `KC_DB_PASSWORD` has to be the same here and in `keycloak/.env`.
- `keycloak/.env` sets the DB connection, the admin login and the hostname.
- `nphiis-admin/.env` sets the Keycloak, FHIR and Superset URLs.
- `hie-auth/.env` holds the Keycloak client secret, HAPI URL, SMTP, Firebase and the NPHL / lab keys. Every variable is described in [docs/deployment.md](docs/deployment.md#3-environment-configuration), along with `fhir-gateway/.env`.

### 4. TLS and hostnames (only if you're running Nginx)

Put your cert and key in `proxy/certs/`, and change the `server_name` entries in `proxy/nginx.conf` to your own hostnames. Details are in [docs/deployment.md](docs/deployment.md#4-tls-certificates).

### 5. Start things

The order matters. Each step should be up before you run the next.

```bash
./start-hie.sh          # HAPI, Postgres x3, Keycloak, hie-auth, gateway, admin, Nginx
./start-data-pipes.sh   # pipeline controller (8090) + Spark thrift server (10001)
./start-superset.sh     # Superset (uses sudo)
```

HAPI takes 1-2 minutes on a first run while it builds the schema. Watch it with:

```bash
./start-hie.sh logs -f hapi-fhir-jpa
```

Wait for "is now running" before moving on. `hapi-fhir-config` runs once, loads the location data and exits. That's expected.

The other scripts, `start-admin.sh`, `start-gateway.sh` and `start-reports.sh`, start a single service. You only need them if you left that service out of the main stack. For example, `start-admin.sh` is for when `nphiis-admin` was excluded to avoid a port 8080 clash.

Every script passes extra arguments straight to `docker compose`, so `./start-hie.sh ps`, `./start-hie.sh down` and `./start-hie.sh logs -f hie-auth` all work.

### 6. Check it's up

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -I http://localhost:8099/fhir/metadata   # gateway: 200 or 401 means it's alive
curl http://localhost:8090/                   # data pipes UI
```

Nothing should be stuck in `Restarting`. The full list of health checks is in [docs/deployment.md](docs/deployment.md#6-health-verification).

## Ports

| Port | Service |
| --- | --- |
| 8080 | nphiis-admin |
| 8099 | fhir-gateway |
| 8090 | pipeline controller |
| 10001 | Spark thrift server |
| 8443 | hie-auth |
| 8787 | HAPI FHIR |

## More docs

- [docs/architecture.md](docs/architecture.md): how the pieces fit together
- [docs/deployment.md](docs/deployment.md): production deploy, updates, rollback, backups
- [hie-auth/README.md](hie-auth/README.md): API details
- [nphiis-admin/README.md](nphiis-admin/README.md): admin app

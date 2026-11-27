#!/usr/bin/env bash
# Refresh NPHIIS analytics datasets inside a running Superset container and point
# charts at the Postgres twins (PII-masked SQL). Safe to re-run from deploy.
#
# Host usage (as a user that can talk to the Docker daemon):
#   ./refresh_deployed_datasets.sh
#   DOCKER="sudo -n docker" ./refresh_deployed_datasets.sh
set -euo pipefail

DOCKER="${DOCKER:-docker}"
CONTAINER="${SUPERSET_CONTAINER:-superset_app}"
WORKER="${SUPERSET_WORKER:-superset_worker}"
BEAT="${SUPERSET_BEAT:-superset_worker_beat}"
PY=($DOCKER exec "$CONTAINER" /app/.venv/bin/python)
DIR=/app/docker/nphiis-analytics

echo "==> reload config (can_view_pii / Jinja)"
$DOCKER restart "$CONTAINER" >/dev/null
$DOCKER restart "$WORKER" "$BEAT" >/dev/null 2>&1 || true

echo "==> wait for Superset health"
ok=0
for _ in $(seq 1 60); do
  if $DOCKER exec "$CONTAINER" curl -fsS -m 5 http://127.0.0.1:8088/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "ERROR: Superset did not become healthy" >&2
  exit 1
fi

echo "==> VHF Postgres datasets + switch charts off Spark"
"${PY[@]}" "$DIR/vhf_postgres_setup.py" --switch

echo "==> VHF contact-tracing charts (RLS / contacts)"
"${PY[@]}" "$DIR/vhf_contacts_setup.py" || true

echo "==> Alert Log + follow-up grid + EVD snapshot"
"${PY[@]}" "$DIR/alert_log_setup.py"
"${PY[@]}" "$DIR/alert_log_dashboard_setup.py"
"${PY[@]}" "$DIR/vhf_followup_grid_setup.py"
"${PY[@]}" "$DIR/evd_snapshot_setup.py" || true

echo "==> AFP / Measles Postgres datasets + switch charts"
"${PY[@]}" "$DIR/afp_measles_postgres_setup.py" --switch

echo "==> analytics datasets refreshed"

#!/usr/bin/env bash
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
set -e

# Superset CLI lives in the image venv; ensure it resolves even if PATH is minimal
# (e.g. after volume mounts or editable reinstalls in docker-bootstrap.sh).
export PATH="/app/.venv/bin:${PATH}"
SUPERSET_CLI="/app/.venv/bin/superset"

#
# Always install local overrides first
#
/app/docker/docker-bootstrap.sh

if [ ! -x "$SUPERSET_CLI" ]; then
  echo "ERROR: Superset CLI not found at $SUPERSET_CLI (check image build and venv)"
  exit 127
fi

STEP_CNT=5

echo_step() {
cat <<EOF
######################################################################
Init Step ${1}/${STEP_CNT} [${2}] -- ${3}
######################################################################
EOF
}
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"
# If Cypress run – overwrite the password for admin and export env variables
if [ "$CYPRESS_CONFIG" == "true" ]; then
    ADMIN_PASSWORD="general"
    export SUPERSET_TESTENV=true
    export POSTGRES_DB=superset_cypress
    export SUPERSET__SQLALCHEMY_DATABASE_URI=postgresql+psycopg2://superset:superset@db:5432/superset_cypress
fi
# Initialize the database
echo_step "1" "Starting" "Applying DB migrations"
"$SUPERSET_CLI" db upgrade
echo_step "1" "Complete" "Applying DB migrations"

# Create an admin user
echo_step "2" "Starting" "Setting up admin user ( admin / $ADMIN_PASSWORD )"
if [ "$CYPRESS_CONFIG" == "true" ]; then
    "$SUPERSET_CLI" load_test_users
else
    "$SUPERSET_CLI" fab create-admin \
        --username admin \
        --email admin@superset.com \
        --password "$ADMIN_PASSWORD" \
        --firstname Superset \
        --lastname Admin
fi
echo_step "2" "Complete" "Setting up admin user"
# Create default roles and permissions
echo_step "3" "Starting" "Setting up roles and perms"
"$SUPERSET_CLI" init
echo_step "3" "Complete" "Setting up roles and perms"

# NPHIIS analytics: datasets, area (RLS) rules, charts and dashboards versioned in
# docker/nphiis-analytics. Never fails the init, so Superset still starts if the
# warehouse is not reachable yet; NPHIIS_ANALYTICS_SETUP=no skips it.
if [ "${NPHIIS_ANALYTICS_SETUP:-yes}" = "yes" ]; then
    echo_step "4" "Starting" "NPHIIS analytics (VHF contact tracing)"
    if /app/.venv/bin/python /app/docker/nphiis-analytics/vhf_contacts_setup.py; then
        echo_step "4" "Complete" "NPHIIS analytics (VHF contact tracing)"
    else
        echo "WARNING: NPHIIS analytics setup failed; Superset starts without it. Re-run:"
        echo "  sudo docker exec superset_app python /app/docker/nphiis-analytics/vhf_contacts_setup.py"
    fi
fi

# The VHF datasets on the analytics Postgres (nphiis-analytics/vhf_postgres_setup.py): created
# alongside the Spark ones; the charts use them when NPHIIS_VHF_SOURCE=postgres (re-applied here
# because step 4 rewrites the contact-tracing charts for Spark). Never fails the init.
if [ "${NPHIIS_ANALYTICS_SETUP:-yes}" = "yes" ]; then
    echo_step "5" "Starting" "NPHIIS analytics on Postgres (VHF)"
    PG_MODE=""
    [ "${NPHIIS_VHF_SOURCE:-spark}" = "postgres" ] && PG_MODE="--switch"
    if /app/.venv/bin/python /app/docker/nphiis-analytics/vhf_postgres_setup.py $PG_MODE; then
        echo_step "5" "Complete" "NPHIIS analytics on Postgres (VHF)"
    else
        echo "WARNING: NPHIIS Postgres analytics setup failed; Superset starts without it. Re-run:"
        echo "  sudo docker exec superset_app python /app/docker/nphiis-analytics/vhf_postgres_setup.py $PG_MODE"
    fi
fi

# if [ "$SUPERSET_LOAD_EXAMPLES" = "yes" ]; then
#     # Load some data to play with
#     echo_step "4" "Starting" "Loading examples"
#     # If Cypress run which consumes superset_test_config – load required data for tests
#     if [ "$CYPRESS_CONFIG" == "true" ]; then
#         superset load_examples --load-test-data
#     else
#         superset load_examples
#     fi
#     echo_step "4" "Complete" "Loading examples"
# fi

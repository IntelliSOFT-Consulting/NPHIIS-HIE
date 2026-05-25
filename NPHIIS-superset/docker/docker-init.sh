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

if [ "$SUPERSET_LOAD_EXAMPLES" = "yes" ]; then
    STEP_CNT=4
else
    STEP_CNT=3
fi

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

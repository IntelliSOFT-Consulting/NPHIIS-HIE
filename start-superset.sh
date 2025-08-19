#!/bin/bash
if [ -n "$1" ]; then
    docker compose -f NPHIS-superset/docker-compose-non-dev.yml $@
else
    docker compose -f NPHIS-superset/docker-compose-non-dev.yml up -d --force-recreate
fi
#!/bin/bash
if [ -n "$1" ]; then
    sudo docker compose -f NPHIIS-superset/docker-compose-non-dev.yml $@
else
    sudo docker compose -f NPHIIS-superset/docker-compose-non-dev.yml up -d --force-recreate
fi
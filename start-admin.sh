#!/bin/bash

if [ -n "$1" ]; then
    docker compose -f nphiis-admin/docker-compose.yml $@
else
    docker compose -f nphiis-admin/docker-compose.yml up -d --force-recreate
fi
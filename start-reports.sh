#!/bin/bash

if [ -n "$1" ]; then
    docker compose -f reports/docker-compose.yml $@
else
    docker compose -f reports/docker-compose.yml up -d --force-recreate
fi
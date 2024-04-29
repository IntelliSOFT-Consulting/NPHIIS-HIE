#!/bin/bash

if [ -n "$1" ]; then
    docker compose -f hie/docker-compose.yml -f proxy/docker-compose.yml -f keycloak/docker-compose.yml $@
else
    docker compose -f hie/docker-compose.yml -f proxy/docker-compose.yml -f keycloak/docker-compose.yml up -d --force-recreate
fi
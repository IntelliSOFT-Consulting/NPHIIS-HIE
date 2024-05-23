#!/bin/bash

if [ -n "$1" ]; then
    # Gateway
    docker compose -f fhir-gateway/docker/hapi-proxy-compose.yaml $@
else
    # Start Gateway
    docker compose -f fhir-gateway/docker/hapi-proxy-compose.yaml up -d fhir-proxy --force-recreate
fi
# Start Keycloak
docker compose -f fhir-gateway/docker/keycloak/config-compose.yaml up -d


# build image

# cd fhir-gateway
# ./build.sh
# cd ..

# Start Gateway
docker compose -f fhir-gateway/docker/hapi-proxy-compose.yaml up -d fhir-proxy
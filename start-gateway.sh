cd fhir-gateway

# Start Keycloak
docker compose -f docker/keycloak/config-compose.yaml up -d 


# build image

./build.sh


# Start Gateway
docker run -e TOKEN_ISSUER=http://keycloak:8080/auth/realms/test -e PROXY_TO=http://hapi-fhir-jpa:8080/fhir -e BACKEND_TYPE=HAPI -e RUN_MODE=PROD -e ACCESS_CHECKER=list --network=host us-docker.pkg.dev/fhir-proxy-build/stable/keycloak-config
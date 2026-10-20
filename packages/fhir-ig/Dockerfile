# Builds the NPHIIS IG (SUSHI + HL7 IG Publisher) and serves the HTML at /ig/.
#   sudo docker compose -f packages/fhir-ig/docker-compose.yml up -d --build
# The proxy (proxy/nginx.conf) routes https://dsrfhir.intellisoftkenya.com/ig/ to it.

FROM hl7fhir/ig-publisher-base:latest AS build
ARG SUSHI_VERSION=3.16.0
ARG PUBLISHER_VERSION=2.3.4
RUN npm install -g fsh-sushi@${SUSHI_VERSION} \
 && curl -fsSL -o /opt/publisher.jar \
      https://github.com/HL7/fhir-ig-publisher/releases/download/${PUBLISHER_VERSION}/publisher.jar
WORKDIR /ig
COPY sushi-config.yaml ig.ini ./
COPY input ./input
# No terminology server (-tx n/a): the IG only uses its own and core code systems.
RUN sushi . \
 && java -Xmx2g -jar /opt/publisher.jar -ig ig.ini -tx n/a \
 && test -f output/index.html

FROM nginx:1.27-alpine
COPY nginx-site.conf /etc/nginx/conf.d/default.conf
COPY --from=build /ig/output /usr/share/nginx/html/ig

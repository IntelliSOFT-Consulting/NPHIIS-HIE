# Use Alpine Linux as base image
FROM alpine:latest

# Install Bash
RUN apk --no-cache add bash curl

COPY . .

ENV HAPI_FHIR_BASE=http://hapi-fhir-jpa:8080/fhir

# Set the script as the entry point
ENTRYPOINT ["/upload-locations.sh"]

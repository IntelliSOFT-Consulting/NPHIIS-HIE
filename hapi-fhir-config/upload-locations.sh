#!/bin/bash

# Function to check if FHIR base is online
check_fhir_base() {
    http_code=$(curl -X GET -s -o /dev/null -w "%{http_code}" "$HAPI_FHIR_BASE/Patient")
    echo "HTTP response code: $http_code"
    if [ "$http_code" -eq 200 ]; then
        return 0  # Success
    else
        return 1  # Failure
    fi
}


echo $HAPI_FHIR_BASE
# Loop until FHIR base is online
# until check_fhir_base; do
#     echo "HAPI FHIR Server is not online. Retrying in 5 seconds..."
#     sleep 5
# done

# FHIR base is online, proceed with upload
echo "FHIR base is online. Uploading files..."

HAPI_FHIR_BASE="https://immunization.health.go.ke/chanjo-hapi/fhir"

# Upload files using curl
echo "Beginning Upload"
curl -X POST -H "Content-Type: application/fhir+json" -o /dev/null -d ./fhir-bundle-counties-kenya.json $HAPI_FHIR_BASE && \
echo "Uploading counties complete." && \
curl -X POST -H "Content-Type: application/fhir+json" -o /dev/null -d ./fhir-bundle-sub-counties-kenya.json $HAPI_FHIR_BASE && \
echo "Uploading sub-counties complete." && \
curl -X POST -H "Content-Type: application/fhir+json" -o /dev/null -d ./fhir-bundle-wards-kenya.json $HAPI_FHIR_BASE && \
echo "Uploading wards complete." && \
curl -X POST -H "Content-Type: application/fhir+json" -o /dev/null -d ./fhir-bundle-facilities-kenya.json $HAPI_FHIR_BASE && \
echo "Uploading facilities complete." && \
curl -X POST -H "Content-Type: application/fhir+json" -o /dev/null -d ./fhir-bundle-community-units-kenya.json $HAPI_FHIR_BASE && \
echo "Uploading community units complete."

echo "Upload complete."

exit
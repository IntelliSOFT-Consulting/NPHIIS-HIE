#!/bin/bash

# Function to check if FHIR base is online
check_fhir_base() {
    http_code=$(curl -L -s -o /dev/null -w "%{http_code}" "$HAPI_FHIR_BASE/Patient")
    echo "HTTP response code: $http_code"
    if [ "$http_code" -eq 200 ]; then
        return 0  # Success
    else
        return 1  # Failure
    fi
}

# Require HAPI_FHIR_BASE from environment
if [ -z "$HAPI_FHIR_BASE" ]; then
    echo "HAPI_FHIR_BASE is not set"
    exit 1
fi
echo "HAPI_FHIR_BASE=$HAPI_FHIR_BASE"

# Loop until FHIR base is online
until check_fhir_base; do
    echo "HAPI FHIR Server is not online. Retrying in 5 seconds..."
    sleep 5
done

# FHIR base is online, proceed with upload
echo "FHIR base is online. Uploading files..."

# Check that all bundle files exist
BUNDLES=(
    fhir-bundle-counties-kenya.json
    fhir-bundle-sub-counties-kenya.json
    fhir-bundle-wards-kenya.json
    fhir-bundle-facilities-kenya.json
    fhir-bundle-community-units-kenya.json
)
for f in "${BUNDLES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "Missing bundle file: $f"
        exit 1
    fi
done

# Chunk size for large bundles (facilities, community units). Override with CHUNK_SIZE env.
CHUNK_SIZE="${CHUNK_SIZE:-500}"

# Upload one bundle; exit 1 if status is not 2xx
upload_bundle() {
    local file="$1"
    local label="$2"
    local out
    out=$(mktemp)
    http_code=$(curl -L -X POST -s -w "%{http_code}" -o "$out" \
        -H "Content-Type: application/fhir+json" \
        -d @"$file" \
        "$HAPI_FHIR_BASE")
    rm -f "$out"
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo "Uploading $label complete."
        return 0
    else
        echo "Upload failed for $file: HTTP $http_code"
        return 1
    fi
}

# Upload a large bundle in chunks (uses jq). For facilities and community units.
upload_bundle_chunked() {
    local file="$1"
    local label="$2"
    local total start=0 chunk_num=1
    total=$(jq '.entry | length' "$file") || { echo "Failed to read $file"; return 1; }
    [ "$total" -eq 0 ] && { echo "Uploading $label complete (0 entries)."; return 0; }
    while [ "$start" -lt "$total" ]; do
        local out bodyfile
        out=$(mktemp)
        bodyfile=$(mktemp)
        # Slice chunk and deduplicate by resource.id so HAPI does not reject duplicate IDs (HAPI-0535)
        jq -c --argjson start "$start" --argjson size "$CHUNK_SIZE" \
            '{resourceType: "Bundle", type: "transaction", entry: [.entry[$start:($start+$size)] | group_by(.resource.id)[] | .[0]]}' "$file" > "$bodyfile" || { rm -f "$out" "$bodyfile"; echo "jq failed for $file chunk $chunk_num"; return 1; }
        http_code=$(curl -L -X POST -s -w "%{http_code}" -o "$out" \
            -H "Content-Type: application/fhir+json" \
            -d @"$bodyfile" \
            "$HAPI_FHIR_BASE")
        if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
            end=$((start + CHUNK_SIZE)); [ "$end" -gt "$total" ] && end=$total
            echo "Uploading $label chunk $chunk_num (entries $start–$end/$total) complete."
        else
            echo "Upload failed for $file chunk $chunk_num: HTTP $http_code"
            [ -s "$out" ] && echo "Response body:" && head -100 "$out"
            rm -f "$out" "$bodyfile"
            return 1
        fi
        rm -f "$out" "$bodyfile"
        start=$((start + CHUNK_SIZE))
        chunk_num=$((chunk_num + 1))
    done
    echo "Uploading $label complete."
    return 0
}

echo "Beginning Upload"
upload_bundle fhir-bundle-counties-kenya.json "counties" || exit 1
upload_bundle fhir-bundle-sub-counties-kenya.json "sub-counties" || exit 1
upload_bundle fhir-bundle-wards-kenya.json "wards" || exit 1
upload_bundle_chunked fhir-bundle-facilities-kenya.json "facilities" || exit 1
upload_bundle_chunked fhir-bundle-community-units-kenya.json "community units" || exit 1

echo "Upload complete."
exit 0

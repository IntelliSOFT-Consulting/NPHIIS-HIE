if [ -n "$1" ]; then
    docker compose -f fhir-data-pipes/docker/compose-controller-spark-sql-released.yaml $@
else
    docker compose -f fhir-data-pipes/docker/compose-controller-spark-sql-released.yaml up -d --force-recreate --remove-orphans
fi
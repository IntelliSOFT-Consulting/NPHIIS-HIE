#!/bin/bash

if [ "$1" == "hie" ]; then
    ./start-hie.sh
elif [ "$1" == "proxy" ]; then
    ./start-proxy.sh
elif [ "$1" == "fhir-gateway" ]; then
    ./start-gateway.sh
elif [ "$1" == "fhir-data-pipes" ]; then
    ./start-data-pipes.sh
elif [ "$1" == "fhir-superset" ]; then
    ./start-superset.sh
else
    echo "Invalid option $1
  
#   Available Services:

1. HIE - OpenHIM, HAPI FHIR (SHR) and Mediators
2. Nginx Proxy
3. FHIR Gateway - Proxies to HAPI FHIR in (1)
4. FHIR Datapipes
5. Apache Superset

#   Help:

#   cr                  starts the docker containers in production mode
#   shr                 starts the docker containers in development mode
#   openhim             packages and publish the CHT app to CHT Instance.
#   logs                view server logs

"

fi
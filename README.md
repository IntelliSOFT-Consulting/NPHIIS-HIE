## ChanjoKE

This repository contains the code and artefacts for the ChanjoKE HIE



#### Components
1. OpenHIM
2. HAPI FHIR JPA Server



Pre-requisites

1. Docker - Instructions on how to install Docker can be found on the Docker website
            This repository relies heavily on Docker containers.

#### Setup Instructions


** Ensure you create the cloudbuild Docker network that links all components.

```docker network create cloudbuild```

1. Clone the repository

```git clone https://github.com/IntelliSOFT-Consulting/chanjoke-hie```

2. cd into the repository folder

```cd chanjoke-hie```

3. Use docker compose to start containers

```docker compose up -d```



#### FHIR Gateway Configuration

1. In the `fhir-gateway/docker/.env`
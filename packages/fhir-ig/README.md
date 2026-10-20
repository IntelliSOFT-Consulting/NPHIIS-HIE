# NPHIIS Implementation Guide

FHIR R4 profiles and terminology NPHIIS exchanges through its HIE. Published at
https://dsrfhir.intellisoftkenya.com/ig/.

| Area | Profiles / terminology |
| --- | --- |
| Patient identity | `ClientRegistryPatient`, `IprsPatient` |
| Screening | `ScreenedPatient`, `TravellerScreeningResponse`, `TravellerScreeningQuestionnaire` |
| Patient activity | `patient-data-last-updated` extension |
| VHF contact tracing | `VhfContactList` (List per case), CodeSystems `contact-list`, `contact-status` |

Pages are in `input/pagecontent/` (`index.md`, `contact-tracing.md`); FSH is in `input/fsh/`.

## Build

Check the FSH with [SUSHI](https://github.com/FHIR/sushi):

```bash
cd packages/fhir-ig
npx -p fsh-sushi@3.16.0 sushi .
```

Build and serve the HTML (SUSHI + HL7 IG Publisher in Docker; see `Dockerfile`):

```bash
sudo docker compose -f packages/fhir-ig/docker-compose.yml up -d --build
```

The `fhir-ig` container joins the `cloudbuild` network; `proxy/nginx.conf` routes `/ig/` on
dsrfhir.intellisoftkenya.com to it. The publisher's QA report is at `/ig/qa.html`.

This IG documents the design; the runtime logic lives in `hie-auth` (identity:
`GET /provider/patients/validate`; contact tracing: `/provider/contacts`).

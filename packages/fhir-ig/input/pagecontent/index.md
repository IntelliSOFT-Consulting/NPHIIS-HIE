This guide describes the FHIR R4 resources NPHIIS (the National Public Health Integrated Information System) exchanges through its Health Information Exchange (HIE).

### Contents

| Area | What it covers |
| --- | --- |
| [Patient identity](artifacts.html#structures-resource-profiles) | Patients resolved from the Client Registry (`ClientRegistryPatient`) and IPRS (`IprsPatient`) |
| Screening | Screened travellers (`ScreenedPatient`) and their screening responses (`TravellerScreeningResponse`) |
| Patient activity | The `patient-data-last-updated` extension hie-auth stamps on a Patient when its clinical data changes |
| [VHF contact tracing](contact-tracing.html) | Contacts of a VHF case, their 21-day follow-up, and the contact list that links them to the case (`VhfContactList`) |

### Conventions

- Canonical base: `http://nphiis.health.go.ke/fhir`.
- Form answers are stored as one `Observation` per answer, with `code.coding.code` set to the form question's `linkId`, alongside the `QuestionnaireResponse`.
- Case records are `Encounter`s whose first `reasonCode` names the form (for example `VHF Case Information`). Records that belong to a case, such as lab results and daily follow ups, are child `Encounter`s that point to it through `partOf`.
- hie-auth assigns each case an EPID (`http://hie.org/identifiers/EPID`) and, for VHF cases, a national Case ID (`http://hie.org/identifiers/CASE_ID`). Both are stored as identifiers on the case `Encounter` and its `Patient`.

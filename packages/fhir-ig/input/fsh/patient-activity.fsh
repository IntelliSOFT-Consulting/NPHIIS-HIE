Extension: PatientDataLastUpdated
Id: patient-data-last-updated
Title: "Patient Data Last Updated"
Description: "When a resource about this patient (Encounter, Observation, Condition, Immunization, Specimen, QuestionnaireResponse, DiagnosticReport, ServiceRequest, Procedure, MedicationAdministration) was last created, updated or deleted. Set by hie-auth from HAPI subscription notifications; only moves forward."
* ^url = "http://nphiis.health.go.ke/fhir/StructureDefinition/patient-data-last-updated"
* ^status = #active
* ^context[+].type = #element
* ^context[=].expression = "Patient"
* value[x] only dateTime
* value[x] 1..1

ValueSet: IdentificationTypeVS
Id: identification-type
Title: "Patient Identification Type"
Description: "Allowed identification document types for CR and IPRS patient lookup."
* ^url = "http://nphiis.health.go.ke/fhir/ValueSet/identification-type"
* ^status = #active
* include codes from system IdentificationTypeCS

ValueSet: ScreeningOutcomeVS
Id: screening-outcome
Title: "Screening Outcome"
Description: "Allowed screening outcomes."
* ^url = "http://nphiis.health.go.ke/fhir/ValueSet/screening-outcome"
* ^status = #active
* include codes from system ScreeningOutcomeCS

ValueSet: ScreeningSymptomVS
Id: screening-symptom
Title: "Screening Symptom"
Description: "Allowed screening signs and symptoms."
* ^url = "http://nphiis.health.go.ke/fhir/ValueSet/screening-symptom"
* ^status = #active
* include codes from system ScreeningSymptomCS

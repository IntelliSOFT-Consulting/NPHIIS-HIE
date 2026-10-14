Profile: IprsPatient
Parent: Patient
Id: iprs-patient
Title: "IPRS Patient"
Description: "Patient demographics resolved from an Integrated Population Registration System (IPRS) identity lookup."
* ^url = "http://nphiis.health.go.ke/fhir/StructureDefinition/iprs-patient"
* ^status = #active
* meta.profile 1..*
* identifier 1..*
* identifier.system 1..1
* identifier.value 1..1
* identifier.type 0..1
* identifier.type from IdentificationTypeVS (extensible)
* name 0..*
* gender 0..1
* birthDate 0..1
* telecom 0..*
* address 0..*

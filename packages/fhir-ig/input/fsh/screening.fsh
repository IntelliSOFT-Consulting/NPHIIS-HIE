Profile: ScreenedPatient
Parent: Patient
Id: screened-patient
Title: "Screened Patient"
Description: "A person who has been through screening. Matched to an existing Patient by identifier, or created by the screening service, and always tagged as screened."
* ^url = "http://nphiis.health.go.ke/fhir/StructureDefinition/screened-patient"
* ^status = #active
* meta.profile 1..*
* meta.tag ^slicing.discriminator.type = #pattern
* meta.tag ^slicing.discriminator.path = "$this"
* meta.tag ^slicing.rules = #open
* meta.tag contains screened 1..1
* meta.tag[screened] = RecordOriginCS#screened
* identifier 1..*
* identifier.value 1..1
* identifier.type 0..1
* identifier.type from IdentificationTypeVS (extensible)

Profile: TravellerScreeningResponse
Parent: QuestionnaireResponse
Id: traveller-screening-response
Title: "Traveller Screening Response"
Description: "A completed screening: point of entry, travel history and signs and symptoms for a Patient. The screening id is the business identifier used for idempotent submission."
* ^url = "http://nphiis.health.go.ke/fhir/StructureDefinition/traveller-screening-response"
* ^status = #active
* meta.profile 1..*
* meta.tag ^slicing.discriminator.type = #pattern
* meta.tag ^slicing.discriminator.path = "$this"
* meta.tag ^slicing.rules = #open
* meta.tag contains screened 1..1 and outcome 0..1
* meta.tag[screened] = RecordOriginCS#screened
* meta.tag[outcome] from ScreeningOutcomeVS (required)
* identifier 1..1
* identifier.system 1..1
* identifier.system = "http://nphiis.health.go.ke/fhir/identifier/screening-id"
* identifier.value 1..1
* questionnaire 1..1
* questionnaire = "http://nphiis.health.go.ke/fhir/Questionnaire/traveller-screening"
* status = #completed
* subject 1..1
* subject only Reference(ScreenedPatient)
* authored 1..1

Instance: TravellerScreeningQuestionnaire
InstanceOf: Questionnaire
Usage: #definition
Title: "Traveller Screening"
Description: "Item structure for screening responses (point of entry, travel history, signs and symptoms)."
* url = "http://nphiis.health.go.ke/fhir/Questionnaire/traveller-screening"
* name = "TravellerScreening"
* title = "Traveller Screening"
* status = #active
* subjectType = #Patient
* item[0].linkId = "point-of-entry"
* item[=].text = "Point of entry"
* item[=].type = #group
* item[=].item[0].linkId = "point-of-entry.name"
* item[=].item[=].text = "Name"
* item[=].item[=].type = #string
* item[=].item[+].linkId = "point-of-entry.type"
* item[=].item[=].text = "Type (airport, seaport, border, facility, community)"
* item[=].item[=].type = #string
* item[+].linkId = "travel-history"
* item[=].text = "Travel history"
* item[=].type = #group
* item[=].item[0].linkId = "travel-history.has-travelled"
* item[=].item[=].text = "Has travelled"
* item[=].item[=].type = #boolean
* item[=].item[+].linkId = "travel-history.trip"
* item[=].item[=].text = "Trip"
* item[=].item[=].type = #group
* item[=].item[=].repeats = true
* item[=].item[=].item[0].linkId = "travel-history.trip.country"
* item[=].item[=].item[=].text = "Country"
* item[=].item[=].item[=].type = #string
* item[=].item[=].item[+].linkId = "travel-history.trip.city"
* item[=].item[=].item[=].text = "City"
* item[=].item[=].item[=].type = #string
* item[=].item[=].item[+].linkId = "travel-history.trip.departure-date"
* item[=].item[=].item[=].text = "Departure date"
* item[=].item[=].item[=].type = #date
* item[=].item[=].item[+].linkId = "travel-history.trip.arrival-date"
* item[=].item[=].item[=].text = "Arrival date"
* item[=].item[=].item[=].type = #date
* item[=].item[=].item[+].linkId = "travel-history.trip.purpose"
* item[=].item[=].item[=].text = "Purpose"
* item[=].item[=].item[=].type = #string
* item[+].linkId = "signs-symptoms"
* item[=].text = "Signs and symptoms"
* item[=].type = #group
* item[=].item[0].linkId = "signs-symptoms.temperature"
* item[=].item[=].text = "Temperature (Celsius)"
* item[=].item[=].type = #decimal
* item[=].item[+].linkId = "signs-symptoms.symptom"
* item[=].item[=].text = "Symptom"
* item[=].item[=].type = #choice
* item[=].item[=].repeats = true
* item[=].item[=].answerValueSet = "http://nphiis.health.go.ke/fhir/ValueSet/screening-symptom"
* item[=].item[=].item[0].linkId = "signs-symptoms.symptom.present"
* item[=].item[=].item[=].text = "Present"
* item[=].item[=].item[=].type = #boolean
* item[=].item[=].item[+].linkId = "signs-symptoms.symptom.onset-date"
* item[=].item[=].item[=].text = "Onset date"
* item[=].item[=].item[=].type = #date
* item[=].item[=].item[+].linkId = "signs-symptoms.symptom.note"
* item[=].item[=].item[=].text = "Note"
* item[=].item[=].item[=].type = #string

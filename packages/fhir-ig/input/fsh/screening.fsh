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
Description: "A completed entry or exit screening (see the screening-type tag): point of entry, travel history and signs and symptoms for a Patient. The screening id is the business identifier used for idempotent submission."
* ^url = "http://nphiis.health.go.ke/fhir/StructureDefinition/traveller-screening-response"
* ^status = #active
* meta.profile 1..*
* meta.tag ^slicing.discriminator.type = #pattern
* meta.tag ^slicing.discriminator.path = "$this"
* meta.tag ^slicing.rules = #open
* meta.tag contains screened 1..1 and screeningType 1..1 and outcome 0..1
* meta.tag[screened] = RecordOriginCS#screened
* meta.tag[screeningType] from ScreeningTypeVS (required)
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
Description: "Item structure for screening responses (point of entry, travel history, signs and symptoms). The travel history follows the vhf-case form's vhf-travel section; questions after vhf-travelled apply only when it is Yes."
* id = "traveller-screening"
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
* item[+].linkId = "vhf-travel"
* item[=].text = "Travel History"
* item[=].type = #group
* item[=].item[0].linkId = "vhf-travelled"
* item[=].item[=].text = "Did the case travel before the onset of illness?"
* item[=].item[=].type = #choice
* item[=].item[=].required = true
* item[=].item[=].answerOption[0].valueCoding = #yes "Yes"
* item[=].item[=].answerOption[+].valueCoding = #no "No"
* item[=].item[=].answerOption[+].valueCoding = #unknown "Unknown"
* item[=].item[+].linkId = "vhf-travel-origin-country"
* item[=].item[=].text = "Travel origin country"
* item[=].item[=].type = #choice
* item[=].item[=].answerValueSet = Canonical(TravelCountryVS)
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
* item[=].item[+].linkId = "vhf-travel-origin-place"
* item[=].item[=].text = "Origin city / town / village"
* item[=].item[=].type = #string
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
* item[=].item[+].linkId = "vhf-travel-departure-date"
* item[=].item[=].text = "Date of departure"
* item[=].item[=].type = #date
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
* item[=].item[+].linkId = "vhf-travel-means"
* item[=].item[=].text = "Means of travel"
* item[=].item[=].type = #choice
* item[=].item[=].answerValueSet = Canonical(TravelMeansVS)
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
* item[=].item[+].linkId = "vhf-travel-stopovers"
* item[=].item[=].text = "Stopovers (specify locations)"
* item[=].item[=].type = #string
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
* item[=].item[+].linkId = "vhf-travel-destination-country"
* item[=].item[=].text = "Destination country"
* item[=].item[=].type = #choice
* item[=].item[=].answerValueSet = Canonical(TravelCountryVS)
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
* item[=].item[+].linkId = "vhf-travel-destination-place"
* item[=].item[=].text = "Destination city / town / village"
* item[=].item[=].type = #string
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
* item[=].item[+].linkId = "vhf-travel-arrival-date"
* item[=].item[=].text = "Date of arrival"
* item[=].item[=].type = #date
* item[=].item[=].required = true
* item[=].item[=].enableWhen[0].question = "vhf-travelled"
* item[=].item[=].enableWhen[=].operator = #=
* item[=].item[=].enableWhen[=].answerCoding = #yes "Yes"
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

CodeSystem: IdentificationTypeCS
Id: identification-type
Title: "Patient Identification Type"
Description: "Types of identification documents accepted for Client Registry and IPRS patient lookup."
* ^url = "http://nphiis.health.go.ke/fhir/CodeSystem/identification-type"
* ^status = #active
* ^content = #complete
* ^caseSensitive = true
* #TemporaryID "Temporary ID"
* #AlienID "Alien ID"
* #RefugeeID "Refugee ID"
* #MandateNumber "Mandate Number"
* #BirthCertificate "Birth Certificate"
* #NationalID "National ID"
* #BirthNotification "Birth Notification"
* #ClientRegistryID "ClientRegistry ID"

CodeSystem: RecordOriginCS
Id: record-origin
Title: "Record Origin"
Description: "How a record entered NPHIIS. Used as a meta.tag so records can be filtered by origin."
* ^url = "http://nphiis.health.go.ke/fhir/CodeSystem/record-origin"
* ^status = #active
* ^content = #complete
* ^caseSensitive = true
* #screened "Screened" "Record received through the traveller/community screening service."

CodeSystem: ScreeningOutcomeCS
Id: screening-outcome
Title: "Screening Outcome"
Description: "Result of a screening, recorded as a meta.tag on the screening QuestionnaireResponse."
* ^url = "http://nphiis.health.go.ke/fhir/CodeSystem/screening-outcome"
* ^status = #active
* ^content = #complete
* ^caseSensitive = true
* #cleared "Cleared"
* #referred "Referred"
* #suspected "Suspected case"

CodeSystem: ScreeningSymptomCS
Id: screening-symptom
Title: "Screening Symptom"
Description: "Signs and symptoms captured during screening."
* ^url = "http://nphiis.health.go.ke/fhir/CodeSystem/screening-symptom"
* ^status = #active
* ^content = #complete
* ^caseSensitive = true
* #fever "Fever"
* #cough "Cough"
* #sore-throat "Sore throat"
* #difficulty-breathing "Difficulty breathing"
* #headache "Headache"
* #fatigue "Fatigue"
* #muscle-pain "Muscle pain"
* #vomiting "Vomiting"
* #diarrhoea "Diarrhoea"
* #abdominal-pain "Abdominal pain"
* #rash "Rash"
* #bleeding "Bleeding"
* #jaundice "Jaundice"
* #confusion "Confusion"
* #other "Other"

CodeSystem: TravelMeansCS
Id: travel-means
Title: "Means of Travel"
Description: "Means of travel recorded in the vhf-case travel history."
* ^url = "http://nphiis.health.go.ke/fhir/CodeSystem/travel-means"
* ^status = #active
* ^caseSensitive = true
* ^content = #complete
* #land "Land"
* #air "Air"
* #water "Water"

CodeSystem: ContactListCS
Id: contact-list
Title: "Contact List Type"
Description: "Kinds of contact-tracing List."
* ^url = "http://nphiis.health.go.ke/fhir/CodeSystem/contact-list"
* ^status = #active
* ^content = #complete
* ^caseSensitive = true
* #vhf-contact-list "VHF contact list" "The contacts of one VHF case, followed up for 21 days from their date of contact."

CodeSystem: ContactStatusCS
Id: contact-status
Title: "Contact Follow-up Status"
Description: "Where a contact is in its follow-up, worked out by hie-auth from the follow-up and monitoring records."
* ^url = "http://nphiis.health.go.ke/fhir/CodeSystem/contact-status"
* ^status = #active
* ^content = #complete
* ^caseSensitive = true
* #active "Under follow up" "Within the follow-up window and not yet closed."
* #flagged "Symptomatic: convert to case" "A follow up recorded symptoms; the contact should be converted to a suspected case."
* #completed "Completed follow up" "The window ended (or the monitoring record released the contact) without symptoms."
* #converted "Became a case" "The record's latest Type of case is no longer Contact."
* #lost "Lost to follow up" "Three or more days missed in a row, or recorded as lost on the monitoring record."
* #died "Died" "Recorded as died on the monitoring record."
* #removed "Taken off the list" "Taken off the list by a user (duplicate, not a contact), or no longer linked to the case. The entry is kept for history."

ValueSet: ContactStatusVS
Id: contact-status
Title: "Contact Follow-up Status"
Description: "Statuses of a contact on a contact list."
* ^url = "http://nphiis.health.go.ke/fhir/ValueSet/contact-status"
* ^status = #active
* include codes from system ContactStatusCS

Profile: VhfContactList
Parent: List
Id: vhf-contact-list
Title: "VHF Contact List"
Description: "The contacts of one VHF case. It is the link between a contact and the case it was exposed to, found by the case's EPID or Case ID. hie-auth rebuilds it from each contact's Contact Link to Case answer (vhf-source-case-epid); it holds no contact details, which stay in the contact's own Observations."
* ^url = "http://nphiis.health.go.ke/fhir/StructureDefinition/vhf-contact-list"
* ^status = #active
* identifier 1..*
* identifier.system 1..1
* identifier.value 1..1
* identifier ^short = "The case's EPID (http://hie.org/identifiers/EPID) and, once assigned, its Case ID (http://hie.org/identifiers/CASE_ID)"
* mode = #working
* code 1..1
* code = ContactListCS#vhf-contact-list
* subject 1..1
* subject only Reference(Patient)
* subject ^short = "The case's Patient"
* encounter 1..1
* encounter ^short = "The case's VHF Case Information Encounter"
* date 1..1
* entry.item only Reference(Encounter)
* entry.item ^short = "The contact's VHF Case Information Encounter"
* entry.flag 1..1
* entry.flag from ContactStatusVS (required)
* entry.date 1..1
* entry.date ^short = "When the contact was added to the list"
* entry.deleted 0..0
* entry.deleted ^comment = "Not used: the list is mode = working (invariant lst-2). A contact taken off the list keeps its entry with flag = removed."

Instance: VhfContactListExample
InstanceOf: VhfContactList
Usage: #example
Title: "Contacts of a VHF case"
Description: "The contact list of case KEN-NAI-KIB-2026-VHF-001: one contact under follow up, one symptomatic, and a duplicate taken off the list."
* meta.profile = "http://nphiis.health.go.ke/fhir/StructureDefinition/vhf-contact-list"
* identifier[0].use = #official
* identifier[0].system = "http://hie.org/identifiers/EPID"
* identifier[0].value = "KEN-NAI-KIB-2026-VHF-001"
* identifier[1].use = #official
* identifier[1].system = "http://hie.org/identifiers/CASE_ID"
* identifier[1].value = "KEN-2026-001"
* status = #current
* mode = #working
* title = "Contacts of KEN-NAI-KIB-2026-VHF-001"
* code = ContactListCS#vhf-contact-list "VHF contact list"
* subject = Reference(VhfIndexCasePatientExample)
* encounter = Reference(VhfIndexCaseEncounterExample)
* date = "2026-10-17T05:45:00+03:00"
* entry[0].item = Reference(VhfContactEncounterExample1)
* entry[0].flag = ContactStatusCS#active "Under follow up"
* entry[0].date = "2026-10-12"
* entry[1].item = Reference(VhfContactEncounterExample2)
* entry[1].flag = ContactStatusCS#flagged "Symptomatic: convert to case"
* entry[1].date = "2026-10-12"
* entry[2].item = Reference(VhfContactEncounterExample3)
* entry[2].flag = ContactStatusCS#removed "Taken off the list"
* entry[2].date = "2026-10-13"

Instance: VhfIndexCasePatientExample
InstanceOf: Patient
Usage: #example
Title: "VHF case (example)"
* identifier[0].use = #official
* identifier[0].system = "http://hie.org/identifiers/EPID"
* identifier[0].value = "KEN-NAI-KIB-2026-VHF-001"
* name.family = "Example"
* name.given = "Index"

Instance: VhfIndexCaseEncounterExample
InstanceOf: Encounter
Usage: #example
Title: "VHF case record (example)"
* status = #finished
* class = http://terminology.hl7.org/CodeSystem/v3-ActCode#FLD "field"
* subject = Reference(VhfIndexCasePatientExample)
* reasonCode.coding.code = #"VHF Case Information"
* identifier[0].use = #official
* identifier[0].system = "http://hie.org/identifiers/EPID"
* identifier[0].value = "KEN-NAI-KIB-2026-VHF-001"
* identifier[1].use = #official
* identifier[1].system = "http://hie.org/identifiers/CASE_ID"
* identifier[1].value = "KEN-2026-001"

RuleSet: ContactEncounter(n)
* status = #finished
* class = http://terminology.hl7.org/CodeSystem/v3-ActCode#FLD "field"
* reasonCode.coding.code = #"VHF Case Information"
* identifier.use = #official
* identifier.system = "http://hie.org/identifiers/CONTACT_ID"
* identifier.value = "KEN-NAI-KIB-2026-VHF-001-C00{n}"

Instance: VhfContactEncounterExample1
InstanceOf: Encounter
Usage: #example
Title: "VHF contact record 1 (example)"
* insert ContactEncounter(1)

Instance: VhfContactEncounterExample2
InstanceOf: Encounter
Usage: #example
Title: "VHF contact record 2 (example)"
* insert ContactEncounter(2)

Instance: VhfContactEncounterExample3
InstanceOf: Encounter
Usage: #example
Title: "VHF contact record 3 (example)"
* insert ContactEncounter(3)

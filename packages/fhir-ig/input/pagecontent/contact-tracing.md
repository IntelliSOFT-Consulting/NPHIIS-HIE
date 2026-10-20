A VHF contact is someone exposed to a VHF case. They are followed up daily for 21 days from their date of contact. If they develop symptoms, they become a suspected case and their own contacts are traced in turn.

### Records

A contact is recorded with the same VHF case form as any other VHF case. Mobile and the admin portal write the same resources:

| Resource | Content |
| --- | --- |
| `Patient` | Names, sex, date of birth, phone and residence address. Identifiers: `system-creation`, `vhf-case-information` (the id of the case `Encounter`) and, once assigned, the Contact ID. |
| `Encounter` | `reasonCode` = `VHF Case Information`. It is the contact's case record. Identifier: the Contact ID, once assigned. |
| `QuestionnaireResponse` | The answered form, nested as in `vhf-case.json`. |
| `Observation` (one per answer) | `vhf-case-type` = Contact; `vhf-source-case-epid` = the EPID of the case the contact was exposed to; `vhf-contact-date` (day 0); `vhf-relationship`; and the other answers. |
| Child `Encounter` per follow up | `reasonCode` = `VHF Contact Follow Up`, `partOf` the contact's case `Encounter`. Its answers are `vhf-follow-up-day`, `vhf-follow-up-date` and `vhf-follow-up-symptomatic`. |
| Child `Encounter`, monitoring | `reasonCode` = `VHF Contact Monitoring`, with answer `vhf-monitoring-status`. Any status other than "Under follow up" closes the follow up. |

The linkIds are those of the mobile forms (`vhf-case.json`, `vhf-contact-follow-up.json` and `vhf-contact-monitoring.json` in android-fhir, branch `jk-surveillance`).

### Linking a contact to its case: the contact list

Each case with contacts has one [`VhfContactList`](StructureDefinition-vhf-contact-list.html), a `List`:

- `identifier`: the case's EPID and Case ID, so either one finds the list.
- `subject` / `encounter`: the case's `Patient` and case `Encounter`.
- `entry.item`: each contact's case `Encounter`.
- `entry.flag`: the contact's [follow-up status](CodeSystem-contact-status.html).
- A contact taken off the list (a duplicate, or not a contact after all), or no longer linked to the case, keeps its entry with flag `removed`. The list is `mode = working`, so FHIR does not allow `entry.deleted` (invariant lst-2).

The list is the only link between a contact and the case. `Patient.link` is not used: it means "the same person in another record", and one person can be a contact of several cases. Such a person keeps a single `Patient` and appears on each case's list.

hie-auth rebuilds the list every day, and after each change made in the admin portal. It reads every contact's `vhf-source-case-epid` answer, so contacts registered on mobile are included. It also sets `focus` on that `Observation` to the case `Encounter`, giving a FHIR reference alongside the EPID text. The list holds no contact details; those stay in the contact's own `Observation`s.

To get a case's contacts and their `Patient`s in one request:

```
GET [base]/List?identifier=http://hie.org/identifiers/EPID|KEN-NAI-KIB-2026-VHF-001
    &_include=List:item&_include:iterate=Encounter:subject
```

### Follow-up status

The status is worked out from the records each time it is needed. The rules are the same as the mobile app's:

- Day *N* of a follow up is its follow-up date minus the date of contact (day 0). Days 1 to 21 are followed up.
- **flagged**: a follow up recorded symptoms. The contact should be converted to a suspected case.
- **completed**: day 21 has passed, or has been recorded, with no symptoms.
- **lost**: three or more days missed in a row, or recorded as lost on the monitoring form.
- **converted**: the latest `vhf-case-type` answer is no longer Contact. Answers are added, never edited, so the latest one counts.
- **died**: recorded on the monitoring form.

### Contact IDs, Case IDs and alerts

A contact gets a **Contact ID**, not an EPID: the EPID of the case it was exposed to, `-C`, and a number counted per case, zero-padded to three digits (`KEN-NAI-KIB-2026-VHF-001-C001`, `-C002`, ...). hie-auth assigns it on the contact's case `Encounter` and `Patient` (system `http://hie.org/identifiers/CONTACT_ID`) as soon as that case has its EPID: when the contact syncs, or at the next list rebuild. It never changes. A contact of several cases takes its prefix from the first case it was linked to.

A contact does not get an EPID, a national Case ID, an NPHL submission or a case-submission alert while its `vhf-case-type` is Contact. Once it is converted it gets its own EPID and Case ID, is submitted to NPHL and raises the alert. It keeps its Contact ID as history. Only a case with an EPID can have contacts, so a contact's own contacts are traced once it has been converted.

### Reminders

hie-auth sends a push reminder each morning for every contact due that day to the sub-county disease surveillance officer of the contact's residence. A missed day is escalated to the county officer.

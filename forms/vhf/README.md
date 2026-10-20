# VHF (Ebola) form specification

This folder holds the merged specification that the VHF Questionnaires are generated from. It is the single place to edit form content. Do not hand-edit the generated JSON.

| File | Contents |
| --- | --- |
| `fields.csv` | One row per question: the form it belongs to, its group, linkId, text, type, whether it is required or repeats, its option list, its enableWhen rule, constraints, calculation, which source it came from, the original dictionary field, and notes |
| `options.csv` | Answer options, grouped by `value_set`. The `source` column says where each option came from. |
| `platform/afp-case.json` | A pinned copy of the mobile asset from `android-fhir` @ `jk-surveillance` (`112e8c1`). The reporting-site block and the location pickers are copied from it. |
| `platform/vhf-case.json`, `platform/vhf-contact-follow-up.json`, `platform/vhf-contact-monitoring.json` | Pinned copies of the mobile VHF forms from `android-fhir` @ `jk-surveillance` (`79b3282`, 2026-10-17). **These are the linkIds stored data uses** (`vhf-case-type`, `vhf-source-case-epid`, `vhf-contact-date`, `vhf-follow-up-day`, ...); the generated `out/` forms have drifted from them. hie-auth and nphiis-admin contact tracing read and write these linkIds. |
| `out/*.json` | **Generated** Questionnaires. Do not edit them by hand. |

Regenerate and test:

```bash
python3 forms/tools/build_questionnaires.py forms/vhf
python3 -m unittest discover forms/tools
```

The tests fail if `out/` is stale. After regenerating, copy `out/vhf-lab-results.json` byte-for-byte into `nphiis-admin/src/questionnaires/` and into the mobile assets; the other forms go to the mobile assets only.

## Sources and merge rule (agreed 2026-10-06)

1. **CIF_Final** is KNPHI's *VHF Case Investigation Tool*, a paper form. It governs **which fields exist, how they are structured, and which are required.**
2. **VHF Options.xlsx** is used where its lists are richer than CIF_Final's: occupation, type of residence, sample type, animal species. Animal contact type and lab tests take the *union* of both sources.
3. **The VHF data dictionary** (the source tool) supplies **field names**, which become linkIds. It also supplies validation rules that CIF_Final does not contradict.
4. **Platform linkIds** replace dictionary names wherever NPHIIS code reads the field:
   - names, sex, date of birth and age;
   - county, sub-county and ward;
   - landmark, town, nearest facility, guardian, and date of onset;
   - the reporting-site block.

   **Never reuse `502488184403`** (AFP "Date of Investigation"). A HAPI subscription on that code triggers the AFP 60-day follow-up.

Values in the `source` column: `CIF`, `OPTIONS`, `DD`, `CIF+OPTIONS`, `PLATFORM`, and `PROPOSED`. `PROPOSED` marks content that no source supplied.

## Syntax used in `fields.csv`

- `enable_when`: `linkId=code`, where `|` means "any of". A choice question is compared on its option code. Each group lists its conditions on every member item.
- `constraint`: entries separated by `;`.
  - `not_future` becomes `maxValue today()`.
  - `max_age_150`.
  - `range:min:max`, where either bound may be left empty.
  - `phone` means `+2547…` or `07…`.
  - `after:<linkId>` means the date must be on or after another date in the same form. It passes when either date is empty, because the other date may be hidden.
- `enable_when` targets must be choice questions; the generator rejects any other type.
- `initial`: the default option code for a choice question, e.g. `KE` for country.
- `calculated`: reserved and currently unused. Age follows the platform pattern instead: `442636360588` "Date of birth known?" shows date of birth when it is known, and the age fields when it is not. FHIRPath has no reliable date-difference function, so age is not auto-calculated.
- `type: platform_block` and `type: reference`: the item is copied from `platform/afp-case.json`. A `reference` item takes its text and required flag from the CSV.
- Date limits are written as `valueDate: {extension: [cqf-calculatedValue today()]}`. This matches the existing mobile forms and what admin's `dateMaxIsToday()` reads, but strict FHIR JSON would use `_valueDate`. A strict validator flags it; that is expected.
- `type: hidden`: adds the `questionnaire-hidden` extension.

## Needs KNPHI sign-off before release

**Deviations from CIF_Final:**

1. `travel_exposure_exists` is kept from the dictionary. CIF_Final marks every travel field as required but has no "did they travel?" question, so a patient who did not travel could not submit the form.
2. Country lists are **proposed**: East African Community countries, neighbouring countries, and "Other (specify)". No source supplies a country list.
3. `pregnant` is shown only when sex is Female.
4. Date of birth uses the platform's "known / unknown" switch. Date of birth is required when known; age (years, months and days) is required when it is not. CIF_Final marks date of birth optional and age always required.
5. `date_of_contact` is shown and required for human-contact exposure **or** when Type of case = Contact. hie-auth anchors the 21-day follow-up on it, so every contact needs one.
6. Several enableWhen rules are inferred: the PPE details, a preliminary result date only when the result is not pending, the admission fields only for inpatients, and the discharge date only when the case has recovered. Each one is marked "inferred" in the notes.

**Decided 2026-10-07 (programme owner):**

- **Contact to source case.** Added `source_case_epid`, shown and required when `type_of_case = contact`.
- **Symptoms for contacts.** `symptoms` and onset date (`728034137219`) are hidden when `type_of_case = contact`, together with their dependent fields. A contact reclassified as a case should have them captured at conversion (mobile, #71).
- **Final result.** `final_laboratory_result` is optional, so a lab can submit a preliminary result on its own. The final result's date, narration, facility and `final_classification` appear only once a final result is entered; the date and the classification are then required.
- **Disease list.** CIF_Final's list stands: Ebola, Marburg, Other VHF.
- **Age.** When date of birth is unknown, at least one age value is required. This is implemented as **years required** (0 for infants, 99 if unknown) with months and days optional. A strict "any one of years / months / days" rule would need a cross-field constraint, and it is unclear whether the Android SDK evaluates those on empty fields. Verify on a device before switching (#71).

**Still open:**

7. **Stopovers.** CIF_Final makes this field required, but many travellers have no stopover.
8. **Outcome versus status.** `outcome_of_case` (Alive/Dead) and `status_of_case` (Active/Recovered/Dead) overlap. Are both needed?
9. **Case definition (to confirm).** The rules that derive `final_classification` from lab results (Confirmed / Probable / Not a case). The admin lab form does not auto-derive the classification until this arrives.

**Dictionary fields dropped** because CIF_Final omits them:
- `principal_field`, `country_of_nationality`.
- The head-of-household fields.
- The respondent's address, phone and relationship.
- `date_first_seen`, `referred_from_another_facility`, `name_of_referring_facility`.
- `preliminary_tests_done`.
- Contact follow-up: `contact_tracer_email_address`, `follow_up_approach`, `follow_up_challenges`.
- The whole **Contact monitoring** section (`exposure_risk`, `current_monitoring_status`, `missed_follow_up_days`, `date_of_final_outcome`, `remarks`).
- The whole **Official** sign-off section.

The navigation and action items in the dictionary ("Collect samples", "Convert to case", "Approve record") are not form fields. They are implemented as app actions.

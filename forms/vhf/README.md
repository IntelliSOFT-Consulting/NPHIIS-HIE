# VHF (Ebola) form specification

This folder holds the merged specification that the VHF Questionnaires are generated from. It is the single place to edit form content. Do not hand-edit the generated JSON.

| File | Contents |
| --- | --- |
| `fields.csv` | One row per question: the form it belongs to, its group, linkId, text, type, whether it is required or repeats, its option list, its enableWhen rule, constraints, calculation, which source it came from, the original dictionary field, and notes |
| `options.csv` | Answer options, grouped by `value_set`. The `source` column says where each option came from. |
| `platform/afp-case.json` | A pinned copy of the mobile asset from `android-fhir` @ `jk-surveillance` (`112e8c1`). The reporting-site block and the location pickers are copied from it. |
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
  - `after:<linkId>` means the date must be on or after another date in the same form.
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
5. Several enableWhen rules are inferred: the PPE details, a preliminary result date only when the result is not pending, the admission fields only for inpatients, and the discharge date only when the case has recovered. Each one is marked "inferred" in the notes.

**Questions:**

6. **Contact to source case.** No source has a field linking a contact to the case they were exposed to. Should we add `source_case_epid`? 21-day follow-up and transmission chains depend on it.
7. **Symptoms for contacts.** Symptoms and onset date are required for every record, including asymptomatic contacts. Should they be hidden when `type_of_case = contact`?
8. **Final result.** CIF_Final makes it required, which blocks a lab from submitting a preliminary result on its own. Should it be optional?
9. **Stopovers.** CIF_Final makes this field required, but many travellers have no stopover.
10. **Outcome versus status.** `outcome_of_case` (Alive/Dead) and `status_of_case` (Active/Recovered/Dead) overlap. Are both needed?
11. **Disease list.** Options.xlsx lists Chikungunya, Dengue, Yellow Fever and Rift Valley Fever. CIF_Final lists Ebola, Marburg and "Other VHF". The CIF list is used here.
12. **Case definition.** The rules that derive `final_classification` from lab results (Confirmed / Probable / Not a case).

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

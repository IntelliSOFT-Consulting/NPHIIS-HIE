# Ebola / VHF Surveillance in NPHIIS: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Viral Haemorrhagic Fever (VHF) case-based surveillance to NPHIIS, covering cases, contacts with 21-day follow-up, lab confirmation and reporting. Ebola is the first disease. Data capture is configured first.

**Architecture:** Build it the same way NPHIIS already handles Measles and AFP. Each form is an R4 SDC Questionnaire bundled into the Android app (lab forms are also bundled into nphiis-admin). A submission is stored as a Patient, an Encounter whose `reasonCode` is the form title (this is the disease discriminator), a QuestionnaireResponse, and one Observation per answer, where `Observation.code` is the linkId. hie-auth assigns EPIDs and sends notifications from HAPI subscriptions. fhir-data-pipes copies the data into Parquet and Spark every 2 hours, and Superset datasets pivot Observations by linkId. No new infrastructure is needed.

**Tech stack:** Android FHIR SDK (Kotlin, `android-fhir` fork, branch `jk-surveillance`, module `nphiis/`); Next.js 15 (nphiis-admin); Express, Prisma and vitest (hie-auth); HAPI FHIR 6.8.0 on R4; fhir-data-pipes with Spark Thrift; Superset.

**Spec / source requirements:**
- Data dictionary, analysed (151 fields, 13 sections): https://docs.google.com/spreadsheets/d/1AQCl2ZEJtkl5uOR7GTPSGBd5sYRrCyyFVg1o__xT0oY
- Data dictionary, raw: https://docs.google.com/document/d/1fnSBlK-tarxFVHVlaTsn1suLTDsKQt-RU7xd_wrApv8
- Mobile app: https://github.com/IntelliSOFT-Consulting/android-fhir/tree/jk-surveillance, module `nphiis/` (source package `com.icl.surveillance`, applicationId `com.icl.nphi`, versionCode 24, last commit `112e8c1` on 2026-07-18). The Public-Health-Surveillance-and-Response repo is an older copy; do not use it.
- Deployment: `root@dsrfhir.intellisoftkenya.com`, `/opt/ChanjoKe-HIE`, branch `june-rel` @ `696e47d`

---

## 1. Current state: how a disease flows through NPHIIS today

The findings below come from a read-only review of the live server, this repo, and the mobile app (`android-fhir` @ `jk-surveillance`), done on 2026-10-06.

```
 CAPTURE                    INGEST / REACT                       ANALYSE
 ───────                    ──────────────                       ───────
 Android app (nphiis/)      nginx ─► hie-auth /fhir proxy        fhir-data-pipes (HAPI_JDBC,
  - Questionnaire JSON in      or fhir-gateway (location tag ACL)   every 2 h) ─► Parquet
    app/src/main/assets     ─► HAPI R4 (Postgres)                ─► Spark Thrift :10001
  - offline, sync 15 min    HAPI rest-hook "Encounter?" ─►        ─► Superset SQL datasets
 nphiis-admin (web)           hie-auth: assign EPID,                (MAX(IF(code=linkId, value)))
  - lab result forms          FCM + email CASE_SUBMISSION /       ─► dashboards embedded in
  - triage pages              LAB_RESULT notifications              nphiis-admin (guest token)
```

**Shape of a submission.** Every disease uses the same resources:

| Resource | Disease-specific part |
|---|---|
| Patient | identifier `system` = slug of the form title (e.g. `measles-case-information`); its value is the case Encounter id. The `system-creation` timestamp identifier is added too. The EPID (`http://hie.org/identifiers/EPID`) is added later. |
| Encounter (case) | `reasonCode.coding.code` = `"<Disease> Case Information"`, which is the key used for EPID assignment |
| Encounter (child form) | `partOf` points at the case Encounter. `reasonCode` = `"<Disease> Lab Information"`, and the "Lab Information" suffix is what triggers the LAB_RESULT notification. |
| QuestionnaireResponse | `questionnaire` is never set on the server data |
| Observation (one per answer) | `code` = `{system: http://snomed.info/sct, code: <linkId>}` (the SNOMED system label is wrong; these are linkIds); the value is a string or dateTime |
| All resources | `*-managingLocation` meta tag and extension, which fhir-gateway uses for location-based access control |

**Facts that shape this plan:**
1. **HAPI holds no Questionnaire, CodeSystem, ValueSet or StructureDefinition.** The forms exist only as JSON inside the apps, and the `Surveillance-FHIR-IG` repo is used at design time only. A new disease therefore means shipping new app assets: a new mobile release, plus an nphiis-admin deploy for lab forms.
2. **Disease identity is hard-coded in many places, not in a registry:**
   - Mobile, about 10 Kotlin files (section 4.3).
   - hie-auth, three copies of the reason-code map: `epid-assignment.ts:16`, `missing-epid-encounters.ts:7`, `notification-backfill-job.ts:11`.
   - nphiis-admin: `formsForDisease` (`lab-submission.ts:50`), the lab form registry (`questionnaires.ts:118-192`), and derived-answer branches (`bulk-upload/route.ts:252`).
   - Superset: hand-written SQL per disease.
3. **There is no lifecycle engine.** Case state, classification and follow-up are derived from child Encounters and Observations. The one existing scheduled follow-up is AFP's 60 days: an Observation subscription on `502488184403`, the `AFP_FOLLOW_UP` Prisma notification type, and a daily cron. Contact follow-up for Ebola is the same mechanism with a 21-day window.
4. **Reporting is SQL keyed by linkId.** Choosing linkIds well now, as stable names that match report columns, saves report work later. That convention started in `33a407f4` (reporting-date linkIds equal the CIF 502 column names).
5. **Which server is production.** The mobile app on `jk-surveillance` points at `https://auth.nphiis.health.go.ke/fhir/`, and `docs/architecture.md:126` names that as production. The `dsrfhir.intellisoftkenya.com` hosts are commented out in the app. The `dsrfhir` box reviewed here is **staging** (confirmed 2026-10-06). The production `*.nphiis.health.go.ke` stack has not been reviewed, and the team has no access to it. Deploy and test on staging first. Before the production release, someone with production access runs the read-only checklist in Phase 4, item 5.
6. **Server memory is nearly exhausted:**
   - 15.6 GiB RAM with about 2 GiB free; swap is 100% used.
   - `superset_app` is unhealthy.
   - Stale OpenHIM, mediator and Mongo containers are still running.
   - About 8,200 stale Spark metastore tables.
   - The server also has 7 uncommitted local changes on `june-rel`: the `/v2/fhir` route, HAPI `server_address`, the pipeline `fhirServerUrl`, the gateway Dockerfile, env files, and an untracked `practitioner-backfill.ts`. A naive `git pull`/reset during deployment would wipe them.

---

## 2. The source tool, and what the dictionary does not contain

The dictionary is an export of an existing VHF tool. Its data keys (`doc->'sections'->'x'->'0'->'field'->>'df_value'`) show a JSONB document store with a header block (`initial`) and repeating sections. Structure:

| # | Section (source form name) | Fields | Target in NPHIIS (section 4.1) |
|---|---|---|---|
| 1 | Header `case_investigation_vhf` | 13 (3 are actions: collect samples, convert to case, approve) | Case form, header group |
| 2 | Demographics `case_demographics` | 38 | Case form (reuses the platform's standard demographic linkIds) |
| 3 | Clinical Information `clinical_information_vhf` | 4 | Case form, for every VHF |
| 4 | Clinical Information (Ebola) `clinical_information_ebola` | 9 | Case form, shown only when `disease = Ebola` |
| 5 | Contact exposure | 18 | Case form |
| 6 | Travel exposure | 7 | Case form |
| 7 | Animal and wildlife exposure | 8 | Case form |
| 8 | Clinical care and treatment | 16 | **Child form: VHF Clinical Outcome** (filled in over time) |
| 9 | Vaccination (Ebola) | 4 | Case form, shown only when `disease = Ebola` |
| 10 | Laboratory | 20 | Split. Specimen collection (7 fields) goes in the case form. Preliminary and final results plus final classification (13 fields) go in a **child form: VHF Lab Information**, used in both nphiis-admin and mobile. |
| 11 | Contact follow-up | 7 | **Child form: VHF Contact Follow-up** (repeated once per day, days 0 to 21) |
| 12 | Contact monitoring | 5 | **Child form: VHF Contact Monitoring** (summary and final outcome) |
| 13 | Official `surveillance_tool_official` | 3 | Case form, final group |

**Blocking gaps.** The dictionary does not contain these, and they must be obtained before the forms can be finished:

| Gap | Why it blocks | Ask |
|---|---|---|
| **Answer options for the 68 choice fields** | `disease`, `type_of_record`, `initial_classification`, `final_classification`, `type_of_sample`, `laboratory_tests`, `outcome_of_case`, `exposure_risk`, `current_monitoring_status`, and others cannot be built without them | The source tool's option lists or form export |
| **Skip/display logic** | Many "required" fields are clearly conditional, for example `location_of_investigation_other`, `date_of_death`, everything in the PPE block, and the travel/animal detail fields. The dictionary has validation rules but no `enableWhen` rules. | The source tool's display conditions, or a clinician sign-off on our inferred rules |
| **Case definitions and classification rules** | We need to know how `final_classification` is derived from lab results (in the way `deriveMeaslesFinalClassification` does for measles) | MoH/NPHI Ebola case definition: suspected, probable, confirmed, non-case |
| **Contact model** | Is a contact a separate person record linked to a source case (the usual Go.Data / SORMAS approach)? The `type_of_record` field and the `convert_to_case` action suggest one record type that switches between contact and case. | Confirm the values of `type_of_record`, and confirm whether contacts must be linked to their source case's EPID |
| **"Approve record" workflow** | It implies a review step, and NPHIIS has none today | Who approves, and does the approval gate anything? |
| **Historical data** | The source tool may already hold live Ebola records | Migrate them or not? (Out of scope here unless requested.) |

### 2.1 Update, 2026-10-06: two more sources received, and they conflict

Two new sources arrived:
- **"VHF Options.xlsx"** (https://drive.google.com/file/d/1FhkUeWcFyiRI2neZdpF-j8uMpAJC_W0v): nine option lists.
- **"VHF CIF_Final.doc"** (https://drive.google.com/file/d/1AA_ILfuBhtgYSZufDX10kvTdbaFSBbOC): KNPHI's paper case investigation form, described as "based on Excel data dictionary field names".

They close most of the option-list gap. They also introduce conflicts, so there are now **three sources that disagree**:

| Topic | Dictionary (source tool) | Options.xlsx | CIF_Final (paper) |
|---|---|---|---|
| Disease | `disease` single select | Ebola, Chikungunya, Dengue Fever, Rift Valley Fever, Marburg Virus Disease, Yellow Fever, Lassa Fever, Crimean-Congo HF | Ebola, Marburg, Other VHF (specify) |
| Record type / classification | `type_of_record` **and** `initial_classification` (two fields) | – | One field, "Type of case": Suspected, Probable, Confirmed, Contact |
| Location of investigation | single select | Health Facility, Point of Entry, Residence, School, Unknown, Other | Health facility, Community, Household, Other |
| Marital status | single select | Single, Married, Divorced, Widow, Widower, Not Applicable, Unknown | N/A (child), Single, Married, Divorced, Widowed |
| Occupation | single select + other | 16 values (truck driver, HCW, butcher, … Other) | Employed / Unemployed + "Employed (specify)" |
| Type of residence | single select | Permanent home, IDP, Migrant Community, Refugee Camp, Temporary Shelter, Other, Unknown | Rural, Urban, Camp |
| Symptoms | VHF multi-select **plus** a separate Ebola section with one yes/no per symptom and a second `date_of_onset` | – | One multi-select (Fever, Headache, Fatigue, Vomiting, Diarrhoea, Unexplained bleeding, Muscle pain, Other); one onset date |
| Exposure structure | Three sections (contact, travel, animal), each with a yes/no gate question | – | One "Type of exposure" (Human / Animal / Other); the gate questions are gone |
| Animal contact type | multi-select | Butchering, Caring for a sick animal, Disposing of a carcass, Eating, Skinning, Slaughtering, Other | Handling, Butchering, Eating, Contact with fluids, Other |
| Animal species | **single** select | Baboon, Mosquito, Bat, Buffalo, Camel, Cat, Chimpanzee, Cow, Dog, Duiker, Goat, Gorilla, Monkey, Sheep, Squirrel, Other | **multi**-select: Bat, Monkey, Rodent, Pig, Other |
| PPE | `wearing_ppe` (one field) | – | Two fields: case wearing PPE, and contact wearing PPE. Items: Gloves, Gown, Mask, Goggles, Other |
| Travel | gate + 6 fields | – | Adds **Means of travel** (Land/Air/Water) and **Stopovers**; drops the gate |
| Sample type | single select | 18 values (NP/OP swab, blood, serum, whole blood, CSF, semen, …) | Blood, Urine, Saliva, Tissue, Other |
| Lab tests | multi-select | Antibodies, Cytology, Gram stain, PCR, RDT, Sequencing, Serology, Unknown, Other | PCR, ELISA, Antigen rapid test, Other |
| Lab logistics | – | – | Adds **date sent to lab**, **date received at lab**, **condition of sample** (Good/Spoiled) |
| Preliminary result | gate "preliminary tests done?" + result | – | Positive / Negative / Pending; no gate |
| Contact follow-up | 7 fields (incl. tracer email, approach, challenges) | – | 3 fields (day, date, symptomatic) |
| Contact monitoring (5) and Official sign-off (3) | present | – | **absent** |
| Respondent, household head, nationality | present | – | Mostly absent ("Who provided information?" stays: Patient, Guardian, Relative, HCW, Other) |
| Required flags | e.g. landmark and town optional | – | Town/Village and Landmark are **required** |

Option lists that only CIF_Final provides, with no conflict:
- Sex: Male, Female, Other (specify)
- Pregnant: Yes, No, Unknown
- Education: None, Primary, Secondary, Tertiary
- Insurance: Yes, No
- Type of human contact: Direct, Indirect
- Direct contact: Touching, Body fluids, Sexual contact, Other
- Indirect contact: Fomites, Contaminated environment, Other
- Frequency: Daily, Weekly, Once
- Duration: <15 min, 15 min–1 h, >1 h
- Location of contact: Home, Health facility, Funeral, Workplace, Other
- Relationship: Family, HCW, Friend, Other
- Type of care: Inpatient, Outpatient, Home care
- Outcome: Alive, Dead
- Place of death: Community, Health facility
- Status: Active, Recovered, Dead
- Antibiotics and vaccine received: Yes, No
- Final result: Positive, Negative
- Final classification: Confirmed, Probable, Not a case

**What is still open after these files:**
- **Which source governs (D8, below).**
- **Contact-to-source-case link.** No source has a field linking a contact to the case they were exposed to. CIF_Final's own footnote says the WHO movement/contact table is "not included".
- **Case definition rules** for deriving final classification.
- **Approval step:** CIF_Final drops the Official section, which suggests there is no approval step.

---

---

## 3. Decisions to confirm (recommendations in **bold**)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | One VHF form with a disease selector, or a form per disease | VHF umbrella / Ebola-only | **VHF umbrella, following the dictionary.** Ebola-specific sections are gated by `enableWhen disease = Ebola`, so Marburg, CCHF, RVF and similar diseases can be added later without new plumbing. |
| D2 | EPID condition code | `VHF` / `EVD` / per disease | **`VHF`**, giving `KEN-{CTY}-{SUB}-{YYYY}-VHF-{SEQ}`. The specific disease is stored as an answer and used to filter reports. |
| D3 | Case `reasonCode` (it becomes the Patient identifier slug and the EPID key) | | **`"VHF Case Information"`**, so the slug is `vhf-case-information` |
| D4 | linkId convention | numeric (like `865158268604`) / dictionary field names | **Use the dictionary field names, prefixed `vhf-` where a name is ambiguous.** Keep the platform's standard linkIds for the fields that platform code reads (section 4.2). |
| D5 | Where lab results are entered | mobile only / admin only / both | **Both**, the same way measles works. The same JSON goes into the mobile assets and `nphiis-admin/src/questionnaires/`. The KEMRI VHF lab uses the admin web form or the CSV bulk upload. |
| D6 | Which mobile repo is the release source | Confirmed 2026-10-06 | **`android-fhir`, branch `jk-surveillance`, module `nphiis/`.** |
| D8 | Which source governs content and option lists | Dictionary + Options.xlsx (the existing source tool) / CIF_Final (the KNPHI paper form) / merge | **CIF_Final governs which fields exist, their structure, and their required flags**, because it is the newest and the only one KNPHI has branded as final. Use **Options.xlsx lists where they are richer** (sample type, occupation, residence type, animal species) unless KNPHI says the shorter CIF lists are deliberate. Use dictionary field names as linkIds. Get one sign-off from KNPHI on the merged form before building. |
| D7 | Urgency of notifications | standard CASE_SUBMISSION / immediate national alert | **Immediate alert.** VHF is an immediately notifiable, IHR-relevant disease: notify the county DSO, the sub-county DSO and national users on every new VHF Encounter. |

---

## 4. Phase 1 (PRIORITY): Data capture configuration

Target: the case form, lab form and contact forms can be filled in on mobile and admin, reach HAPI, and receive a `VHF` EPID. Estimated 6–8 working days once the gaps in section 2 are closed.

### 4.1 The form set

| File | Title / Encounter reasonCode | Where it is used | Parent |
|---|---|---|---|
| `vhf-case.json` | `VHF Case Information` | mobile | (case) |
| `vhf-lab-results.json` | `VHF Lab Information` | mobile + nphiis-admin | case Encounter |
| `vhf-clinical-outcome.json` | `VHF Clinical Outcome Information` | mobile | case Encounter |
| `vhf-contact-follow-up.json` | `VHF Contact Follow-up Information` | mobile | contact's case Encounter (one per day) |

The contact-monitoring form was dropped on 2026-10-06 under the D8 rule, because CIF_Final has no such section.

Canonical URL pattern: `http://nphiis.health.go.ke/Questionnaire/<id>`, with `id` and `url` set on every form. Existing lab JSONs have neither, and they should.

### 4.2 Field-mapping rules for converting the dictionary to Questionnaires

- **Type mapping:**

  | Dictionary type | Questionnaire item |
  |---|---|
  | `string` | `string` |
  | `large_string` | `text` |
  | `number` | `integer` (or `decimal` where fractions are possible) |
  | `date` | `date` |
  | `single_select` | `choice` with a drop-down control |
  | `radio_group` | `choice` with `itemControl radio-button` and horizontal `choiceOrientation` |
  | `multiple_select` | `choice` with `repeats: true` and `itemControl check-box` |
  | `phone` | `string` with `entryFormat` and a regex constraint |
  | `email` | `string` with an email regex constraint |
  | `Ident` | `string` |
  | `title` | `display`, or the group text |
  | `hidden` | `questionnaire-hidden` |
  | `Navigation` / `Action` | **not form items**: they become app actions (section 5) |

- **Validation mapping:**
  - "Date not in future" becomes `maxValue` with `today()`, as in `33a407f4`.
  - Ranges such as `day_of_follow_up` 0–21 and `missed_follow_up_days` 0–21 become `minValue`/`maxValue`.
  - Other rules become a `questionnaire-constraint` extension with FHIRPath and `validationtext`.
- **Auto-calculated fields** (`age_years`, `age_months`, `age_days`, `principal_field`) become SDC `variable` plus `calculatedExpression` with `readOnly`. `afp-final-lab-results` already uses `variable`.
- **Platform linkIds must be reused.** Otherwise mobile name/sex/EPID handling, county/sub-county EPID segments, and the admin case-vs-line-list check all break. Map them like this:

  | Dictionary field | linkId to use | Read by |
  |---|---|---|
  | `family` / `given` | `873240407472`, `246751846436` (and `486402457213` if a third name is captured) | mobile `AddClientViewModel` → Patient.name |
  | `sex` | `929966324957` | → Patient.gender |
  | `date_of_birth` | `257830485990` | → Patient.birthDate |
  | `county` (residence) | `a4-county` | hie-auth EPID county segment; mobile address |
  | `subcounty` (residence) | `a3-sub-county` | hie-auth `epid-location-segment.ts:146` |
  | `date_of_onset` | `728034137219` | mobile summary |
  | `reporting_county` / `reporting_subcounty` | reporting-site group `294367770999`… | mobile summary and reports |
  | `type_of_record` | **keep `type_of_record`**. If it uses Case/Contact values, also emit `865158268604` with the value "Case" for cases only, so admin lab verification (`fhir-patient.ts:101`) behaves correctly. | admin lab verify |

  Copy the exact linkIds from `nphiis/src/main/assets/afp-case.json` on `jk-surveillance`. Check that the "EPID from county" segment uses residence county, not reporting county, as the other diseases do.
- **Duplicate field names across sections** must be made unique, because each linkId becomes an Observation code:
  - `date_of_onset` appears in both clinical sections. Keep the platform `728034137219` for the VHF one and use `ebola-date-of-onset` for the Ebola one, or drop the Ebola duplicate; ask the clinicians which.
  - `type_of_contact`, `relationship`, `health_facility`, `phone_number` and similar names should get a section prefix where they clash.

### Task 1: Generate the Questionnaires from the spec instead of writing them by hand (DONE 2026-10-06; Step 5 rendering still to do)

Hand-writing 150 items into five JSON files is slow and error-prone, and the dictionary will change during an outbreak. Add a small generator whose inputs are versioned in this repo.

**Files:**
- Input (**done** on 2026-10-06 on branch `feat/vhf-surveillance`): `forms/vhf/fields.csv` (120 questions across 4 forms), `forms/vhf/options.csv` (35 option lists) and `forms/vhf/README.md`. The README sets out the syntax, the merge rule, and the KNPHI sign-off list.
- Create: `forms/tools/build_questionnaires.py`
- Create: `forms/tools/test_build_questionnaires.py`
- Output (committed): `forms/vhf/out/*.json`

**Interfaces:**
- Produces: `build_forms(fields_csv, options_csv) -> dict[str, dict]`, which maps a form id to a Questionnaire JSON. Also a CLI: `python forms/tools/build_questionnaires.py forms/vhf --out forms/vhf/out`.

- [ ] **Step 1: Write the failing tests**

```python
# forms/tools/test_build_questionnaires.py
from pathlib import Path
from build_questionnaires import build_forms, all_items

VHF = Path(__file__).resolve().parents[2] / "forms" / "vhf"

def forms():
    return build_forms(VHF / "fields.csv", VHF / "options.csv")

def test_every_spec_row_is_emitted_once():
    import csv
    rows = list(csv.DictReader(open(VHF / "fields.csv")))
    fs = forms()
    for r in rows:
        if r["type"] == "platform_block":
            continue
        ids = [i["linkId"] for i in all_items(fs[r["form"]])]
        assert ids.count(r["link_id"]) == 1, (r["form"], r["link_id"])

def test_afp_trigger_linkid_never_used():
    for q in forms().values():
        assert "502488184403" not in {i["linkId"] for i in all_items(q)}

def test_linkids_unique_within_each_form():
    for fid, q in forms().items():
        ids = [i["linkId"] for i in all_items(q)]
        assert len(ids) == len(set(ids)), fid

def test_enablewhen_targets_exist():
    for fid, q in forms().items():
        ids = {i["linkId"] for i in all_items(q)}
        for i in all_items(q):
            for ew in i.get("enableWhen", []):
                assert ew["question"] in ids, f"{fid}:{i['linkId']} -> {ew['question']}"

def test_choice_items_have_options():
    for fid, q in forms().items():
        for i in all_items(q):
            if i["type"] == "choice":
                assert i.get("answerOption"), f"{fid}:{i['linkId']} has no options"

def test_platform_linkids_present_in_case_form():
    case = forms()["vhf-case"]
    ids = {i["linkId"] for i in all_items(case)}
    assert {"a4-county", "a3-sub-county", "929966324957", "257830485990"} <= ids

def test_future_dates_blocked():
    case = forms()["vhf-case"]
    onset = next(i for i in all_items(case) if i["linkId"] == "728034137219")
    assert any(e["url"].endswith("maxValue") for e in onset["extension"])
```

- [ ] **Step 2: Run them and confirm they fail.** Run `python3 -m unittest discover forms/tools`. They should fail with `ModuleNotFoundError: build_questionnaires`. (The tests use the standard library `unittest`, since pytest is not installed.)
- [ ] **Step 3: Implement the generator.** Use the type and validation mapping in section 4.2. Emit `id`, `url`, `status: active`, `title`, one `group` per dictionary section, and the `variable`/`calculatedExpression` items for age. Each item records its source field name in an extension (`http://nphiis.health.go.ke/fhir/StructureDefinition/source-field`) so it can be traced back to the dictionary. The test helper reads this as `extension_source_field`. `platform_block` rows copy the item tree from `nphiis/src/main/assets/afp-case.json` (pass its path as a CLI flag).
- [ ] **Step 4: Run the tests.** All should pass.
- [ ] **Step 5: Load-test the forms.** Open each `out/*.json` in the SDC renderer (https://lhcforms.nlm.nih.gov/sdc, or the Android SDK catalog app) and check skip logic and age calculation by hand.
- [ ] **Step 6: Commit:** `git add forms/vhf forms/tools && git commit -m "Add VHF data dictionary and Questionnaire generator"`

### Task 2: hie-auth: one reason-code map, VHF registered, tests (DONE 2026-10-06, `0e3234ed`)

The reason-code map is copied in three files. Consolidate it before adding VHF, so that a future disease is a one-line change.

**Files:**
- Create: `hie-auth/src/lib/condition-codes.ts`
- Create: `hie-auth/src/lib/condition-codes.test.ts`
- Modify: `hie-auth/src/lib/epid-assignment.ts:16-20,211-214`, `hie-auth/src/lib/missing-epid-encounters.ts:7`, `hie-auth/src/lib/notification-backfill-job.ts:11`. Replace the local maps with the import.
- Modify: `hie-auth/src/lib/lab-result-notification.test.ts`. Add a VHF case.
- Modify: `hie-auth/docs/EPID.md`. Add VHF to the condition table.

**Interfaces:**
- Produces: `conditionCodeForReason(reason: string | undefined): string` and `REASON_CODE_CONDITIONS: Record<string,string>`.

- [ ] **Step 1: Write the failing tests**

```ts
// hie-auth/src/lib/condition-codes.test.ts
import { describe, expect, it } from "vitest";
import { conditionCodeForReason } from "./condition-codes";

describe("conditionCodeForReason", () => {
  it("maps known case forms", () => {
    expect(conditionCodeForReason("Measles Case Information")).toBe("MEA");
    expect(conditionCodeForReason("AFP Case Information")).toBe("AFP");
    expect(conditionCodeForReason("MOH 505 Reporting Form")).toBe("MOH505");
    expect(conditionCodeForReason("VHF Case Information")).toBe("VHF");
  });
  it("keeps the legacy 3-char fallback for unmapped forms", () => {
    expect(conditionCodeForReason("Mpox Register")).toBe("MPO");
  });
  it("returns UNK for empty", () => {
    expect(conditionCodeForReason(undefined)).toBe("UNK");
    expect(conditionCodeForReason("")).toBe("UNK");
  });
});
```

Add the following to `lab-result-notification.test.ts` inside `describe("isLabResultEncounter")`:

```ts
  it("returns true for VHF lab reason code", () => {
    expect(
      isLabResultEncounter({
        partOf: { reference: "Encounter/case-1" },
        reasonCode: [{ coding: [{ code: "VHF Lab Information" }] }],
      }),
    ).toBe(true);
  });
```

- [ ] **Step 2: Run them and confirm they fail.** Run `cd hie-auth && yarn test condition-codes`. They should fail because the module is not found.
- [ ] **Step 3: Implement**

```ts
// hie-auth/src/lib/condition-codes.ts
/** Case-form Encounter.reasonCode → EPID condition segment. Single source of truth. */
export const REASON_CODE_CONDITIONS: Record<string, string> = {
  "Measles Case Information": "MEA",
  "MOH 505 Reporting Form": "MOH505",
  "AFP Case Information": "AFP",
  "VHF Case Information": "VHF",
};

export function conditionCodeForReason(reason: string | undefined): string {
  const rc = reason ? String(reason) : "";
  return REASON_CODE_CONDITIONS[rc] || (rc ? rc.toUpperCase().slice(0, 3) : "UNK");
}
```

In `epid-assignment.ts`, replace the `POSSIBLE_REASON_CODES` constant and lines 211–214 with `const caseCondition = conditionCodeForReason(reasonCode);`. Make the same change in the other two files, keeping each file's existing fallback behaviour: read each one before editing, because they may not fall back the same way.

- [ ] **Step 4: Run the tests.** `yarn test` should be all green, and `yarn build` should compile.
- [ ] **Step 5: Commit:** `git commit -m "Centralise EPID condition codes and register VHF"`

### Task 3: nphiis-admin: register the VHF lab form

**Files:**
- Create: `nphiis-admin/src/questionnaires/vhf-lab-results.json`. Copy it **byte-for-byte** from `forms/vhf/out/vhf-lab-results.json`; this is the same file shipped in the mobile assets. It must contain the `reporting-dates` group, following the `33a407f4` pattern.
- Modify: `nphiis-admin/src/lib/questionnaires.ts`. Add the import (L6-11), add `"vhf-lab-results"` to `ENABLED_FORM_IDS` (L118), and add the definition below to `ALL_LAB_FORMS`.
- Modify: `nphiis-admin/src/lib/lab-submission.ts:50-68`. Add `case "VHF": return ["vhf-lab-results"];`.
- **Modify, required: multi-select support in admin.** `laboratory_tests` repeats ("tick all that apply" in CIF_Final), but admin has no `repeats` support anywhere:
  - `AnswerMap` is `Record<string,string>` (`questionnaires.ts:324`).
  - `SingleResultForm.tsx:643-674` renders every non-radio choice as one `<Select>`.
  - `lab-submission.ts:160-187` (`coerce`/`findChoice`) accepts a single option.
  - Without this, a lab can record only one test, and CSV rows with `PCR;ELISA` are rejected.
  - Add: a multi-value answer type; a check-box renderer; `;`-separated values in CSV `coerce`; **one** Observation whose value is the selected options joined by `", "` in `extractAnswers`, which is what mobile writes (`ScreenerViewModel.kt:420`), so Superset sees one shape for the field; and "any of" matching in `isItemEnabled` for `laboratory_tests_other`.
- Modify: `nphiis-admin/src/app/api/lab/bulk-upload/route.ts:252-261`. Add a `vhf-lab-results` branch that derives `final_classification`; this depends on gap 3 in section 2.

```ts
  {
    id: "vhf-lab-results",
    title: "VHF - Lab Information",
    encounterReason: "VHF Lab Information", // must end in "Lab Information" → LAB_RESULT notification
    questionnaireUrl: "http://nphiis.health.go.ke/Questionnaire/vhf-lab-results",
    allowedRoles: [/* same as measles-lab-results + KEMRI VHF lab role if created */],
  },
```

- [ ] **Step 1:** Make the edits above.
- [ ] **Step 2:** Run `cd nphiis-admin && yarn lint && yarn build`.
- [ ] **Step 3: Manual check against a local stack.** Take a VHF fixture case (Task 5) with EPID `KEN-…-VHF-001` and run `/api/lab/verify-epid`. It should suggest `vhf-lab-results`. Submit a result. The transaction should create a lab Encounter with `partOf` the case, a QuestionnaireResponse and Observations. hie-auth should log a LAB_RESULT notification. The CSV template download should have headers equal to the linkIds.
- [ ] **Step 4: Commit:** `git commit -m "Add VHF lab results form to admin"`

### Task 4: Mobile app (`android-fhir` @ `jk-surveillance`): wire the VHF forms

Assets are under `nphiis/src/main/assets/`. Kotlin paths are under `nphiis/src/main/java/com/icl/surveillance/`. Every file named below was confirmed to exist on that branch.

**First, bring mobile up to date with admin.** The mobile lab JSONs are behind the admin copies. `measles-lab-results.json` on mobile is missing the KEMRI inadequate-specimen changes (`e51d9b19`) and the reporting-date group (`33a407f4`). It also has three linkIds that admin does not (`8732404074721`, `adequate_specimen`, `inadequate_specimen`). `afp-case-stool-lab-results.json` is missing the reporting dates. Since a lab result's Observation codes then depend on where it was entered, sync these files before the VHF lab form becomes the third one to drift. A stub with no logic leaves the case saved without a name, sex or EPID, so every item below is required.

- [ ] `assets/`: add the five JSONs from `forms/vhf/out/`.
- [ ] `res/values/strings.xml`: add `<string name="vhf">Viral Haemorrhagic Fever (Ebola)</string>`.
- [ ] `ui/home/HomeViewModel.kt`: add `VHF(R.drawable.<icon>, R.string.vhf, 6, <level>)` to `Diseases`. Count 6 is the "Immediate notifiable" submenu, alongside Measles and AFP.
- [ ] `ui/home/SingleCaseFragment.kt`: add an explicit branch. Today every count-6 item falls through to `afp-case.json`.
- [ ] `ui/home/CaseSelectionFragment.kt`:
  - "Add New VHF Case" sets `currentCase="VHF Case Information"` and `questionnaire="vhf-case.json"`, then opens `AddParentCaseActivity`.
  - "VHF Case List" opens `CaseListingActivity`.
  - Add the `caseType` map entry → `vhf-case-information`.
- [ ] `viewmodels/AddClientViewModel.kt`: add a `"vhf-case-information"` branch in `savePatientData`:
  - Patient name, gender, birthDate, address and contact from the platform linkIds.
  - EPID prefix `KEN-$cty-$sub-$year-VHF-`.
  - `createSpecimenResource` for each collected sample.
- [ ] `ui/patients/AddCaseActivity.kt`: add `when(questionnaire)` cases for the four child forms. Each calls `ScreenerViewModel.completeLabAssessment(..., "<reasonCode from 4.1>")`.
- [ ] `ui/patients/SummarizedActivity.kt`:
  - Map `vhf-case-information → vhf-case.json` (around L418).
  - Add VHF tabs in `when(latestEncounter)` (around L76): Lab, Clinical Outcome, Contacts.
- [ ] New tab fragments in `ui/patients/custom/vhf/`, copied from `custom/LocalLabFragment.kt` and `custom/afp/AFPFollowUp.kt`.
- [ ] `cases/CaseListingActivity.kt`: add the slug to the routing lists (around L184 and L235).
- [ ] `ui/patients/PatientListViewModel.kt`: add `enrichLabResultsForVHF`, which reads `final_classification` from the "VHF Lab Information" Encounter, and a branch in `mapToPatientItem`.
- [ ] While in these files, fix two problems that also affect VHF:
  - Sub-county and county downloads keep only the Observation query per facility (`TimestampBasedDownloadWorkManagerImpl`). DSOs will not see VHF Patients or Encounters synced down.
  - The hard-coded fallback JWT `TEST_TOKEN` in `utils/Constants.kt`.
- [ ] Build a debug APK, run Task 5's flow on a device against staging, and confirm the EPID comes back after sync.

### Task 5: Fixture and end-to-end check

- [ ] Add `hie-auth/fixtures/vhf-case-submission-bundle.json`, modelled on `measles-case-submission-bundle.json`. Use synthetic data tagged `http://nphiis.health.go.ke/fhir/CodeSystem/test-data|synthetic`, as other test data on the server is.
- [ ] Extend `hie-auth/fixtures/README.md` with these steps:
  1. POST the bundle.
  2. Check that the Encounter and Patient get a `…-VHF-001` EPID.
  3. Check that the CASE_SUBMISSION email and push are sent.
  4. Submit a lab result through the admin.
  5. Check that the LAB_RESULT notification is sent.
- Note that `hie-auth/scripts/` is gitignored, so the generator scripts referenced in the README are not in the repo. Commit a minimal one, or document the curl commands inline.

---

## 5. Phase 2: Workflow (contacts, alerts, classification)

Estimated 4–6 days. It can overlap Phase 1, Task 4.

| Capability | Implementation, following existing patterns |
|---|---|
| **Immediate VHF alert** | In `notification-recipients.ts`, when the condition code is `VHF`, add national and county DSO recipients beyond `CASE_SUBMISSION_NOTIFY_ROLES`. Map `VHF` to "Viral Haemorrhagic Fever" in the `email.ts` and `notification.ts` subjects, which currently show the raw code. Add a test for each. |
| **Contact registration** | Depends on the contact-model gap in section 2. Default design: a contact is a `vhf-case.json` record with `type_of_record = Contact`; its sections are hidden by `enableWhen`; it is linked to the source case through a `source_case_epid` item (a new field, which needs sign-off). Reuse the AFP contact-tracing UI pattern (`ContactInformationFragment`, `completeContactAssessment`). |
| **21-day follow-up reminders** | Mirror the AFP 60-day mechanism. **There is a deployment trap here:** `createFHIRSubscription` deletes *all* subscriptions before recreating them, so the new subscription must be added through the same env-driven startup path, or the Encounter and AFP subscriptions will be lost. Steps: (1) Prisma `NotificationType` adds `VHF_CONTACT_FOLLOW_UP`, with a migration in the style of `20260619120000_add_lab_result_notification_type`; (2) add an Observation subscription on the contact-registration trigger linkId in `fhir-subscriptions.ts`, with new env vars documented in `docs/deployment.md`; (3) a handler in `routes/subscriptions.ts` creates 21 daily rows from `date_of_contact`; (4) a cron in `schedule.ts` notifies the assigned tracer each day; (5) a missed day (no `VHF Contact Follow-up Information` Encounter for that day) escalates to the sub-county DSO. |
| **Convert contact to case** | A mobile action on a symptomatic contact. It writes a new Observation with `type_of_record = Case` (Observations are never edited in place; this is the existing history convention) and prompts for specimen collection. Reporting then uses the latest `type_of_record`. |
| **Final classification** | Derive it server-side in `bulk-upload/route.ts`, following `deriveMeaslesFinalClassification` (`route.ts:91-123`), from the PCR result and the case definition. Add a test once nphiis-admin has a test runner, or put the pure function in a small module and test it there. |
| **Approve record / official sign-off** | Phase 1 captures checked-by, email and date. A real approval gate, if required, would be an admin page following the rumour-triage pattern: a `FEATURES` key, a page, an API route, and an Observation `vhf-approval`. |
| **Admin VHF case and contact board (optional)** | Copy the rumour-triage files from `2308d720`: `app/(app)/vhf/page.tsx`, `components/VhfView.tsx`, `app/api/vhf/route.ts`, `lib/fhir-vhf.ts`, a `VHF_VIEW` key in `lib/roles.ts`, `Navigation.tsx` and `AppShell.tsx`. |

---

## 6. Phase 3: Reporting and analysis

Estimated 3–4 days, after the first synthetic records reach Spark.

- **The pipeline needs no change.** Patient, Encounter, Observation, QuestionnaireResponse and Specimen are already in `resourceList`. Add types only if we start writing Task, Condition or RelatedPerson.
- **Version the Superset SQL in this repo** at `analytics/superset/datasets/vhf-*.sql`. Today the dataset SQL lives only inside Superset or in another repo, which is why `33a407f4` could not update it. Datasets:
  1. `vhf_line_list`: one row per case. Pivot with `MAX(IF(o.code.coding[0].code='<linkId>', o.value.string, NULL))`, filtered on Patient identifier system `vhf-case-information`, with the latest value per linkId. It must expose `county_code`, `sub_county_code`, `facility_id` and `report_type` so that `superset-rls.ts` row-level security applies.
  2. `vhf_lab`: specimens, preliminary and final results, turnaround times (collection → result, using the reporting-date fields).
  3. `vhf_contacts`: contacts per case, follow-up completion (seen days / expected days), contacts lost to follow-up, contacts converted to cases.
- **Dashboard:** "VHF / Ebola Surveillance". KPIs: suspected, probable and confirmed counts by county and week; deaths and CFR; epi curve by onset date; percentage of contacts followed up in the last 24 h; days since the last confirmed case; lab turnaround.
- **Embed it** with `NEXT_PUBLIC_SUPERSET_DASHBOARD_VHF` and a tab in `components/dashboard/ReportsSection.tsx`, and update `env.example` and `docs/deployment.md`. Also note that `ReportsView.tsx` and `ReportsSection.tsx` default to different IDSR dashboard UUIDs; reconcile them.
- **MOH 505 already has `vhf-summary`.** Check that weekly aggregate VHF counts and case-based counts agree.

---

## 7. Phase 4: Deployment and operations (start now, in parallel)

1. **Capture the server's uncommitted changes before any deploy.** Run `git diff` and commit them onto a branch, so nothing in the server working tree is overwritten. Merge `june-rel` and `main` deliberately.
2. **Free memory before adding load:**
   - Stop the stale `openhim-*`, `nphiis-mediators*` and `nginx-dns-reload` containers. This needs owner sign-off.
   - Fix the unhealthy `superset_app`.
   - Prune the build cache, which is 79 GB and reclaimable.
   - Clean the Spark metastore.
   - Consider upsizing the VM to 32 GB before an outbreak surge.
3. **Release order:**
   1. hie-auth (Task 2, plus Phase 2 notifications): `./start-hie.sh up -d --build --force-recreate hie-auth`. It runs `prisma migrate deploy` on start.
   2. nphiis-admin (Task 3): `./start-admin.sh`.
   3. Mobile release through Play Store.
   4. Superset dataset and dashboard import.
   - Follow `docs/deployment.md` sections 408–470 for rollback.
   - Because of the subscription trap above, verify `GET /hapi/fhir/Subscription` still returns 2 or more active subscriptions after every hie-auth restart.
5. **Production pre-release checklist (read-only; to be run by whoever holds production access, since the team does not).** Every hie-auth and nphiis-admin change in this plan assumes production matches staging. Each command below checks one of those assumptions.
   ```bash
   cd <repo dir> && git remote -v && git rev-parse --abbrev-ref HEAD && git log -1 --oneline && git status --short   # branch/commit, uncommitted drift
   docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'                                                         # same services as staging?
   curl -s 'http://localhost:<hapi port>/fhir/Subscription?_summary=data' | grep -E '"criteria"|"status"'             # expect Encounter? and Observation?code=502488184403, active
   docker exec hie-auth printenv | grep -E 'FHIR_.*SUBSCRIPTION|CASE_SUBMISSION_NOTIFY_ROLES|USER_ROLES' | sed 's/=.*PASS.*/=<redacted>/'
   docker exec nphiis-admin printenv | grep NEXT_PUBLIC_SUPERSET_DASHBOARD
   free -h && df -h /
   ```
   Also export the production Superset dataset list. The VHF dashboard is built against staging dataset names, so it must be confirmed that production uses the same names.
6. **Docs:** update `docs/architecture.md` (supported conditions L156/L262, questionnaire table L238-252) and `hie-auth/docs/EPID.md`.

---

## 8. Suggested schedule

| Day | Work |
|---|---|
| 0–1 | Close the gaps in section 2 and decisions D1–D7. Phase 4 items 1–2. Task 2 (hie-auth), which does not depend on the gaps. |
| 1–4 | Task 1 (generator plus forms). Iterate with clinicians on rendered forms. |
| 3–7 | Task 4 (mobile) and Task 3 (admin), in parallel. Task 5 end-to-end on staging. |
| 5–10 | Phase 2: alerts, contacts, 21-day follow-up. |
| 8–12 | Phase 3: Superset datasets and dashboard. Production release. |

## Review focus (most likely failures that no task's tests catch)

1. **A conditional field marked required with no `enableWhen`.** Users are blocked from submitting, for example `date_of_death` for a living patient. Expected: these fields appear only when relevant. Covered by clinician walkthroughs in Task 1, Step 5; add a generator check that every required field in the PPE, travel, animal and outcome blocks has an `enableWhen`.
2. **The VHF case is missing the platform linkIds.** The result is no EPID county segment, or a patient with no name or sex on mobile. Covered by `test_platform_linkids_present_in_case_form` and Task 5.
3. **The lab form JSON drifts between mobile and admin.** Observations then arrive with different codes depending on where they were entered. Mitigation: both copies are produced by the generator, and CI or a review checklist diffs them.
4. **The hie-auth restart drops subscriptions** once the VHF follow-up subscription is added. Mitigation: the post-deploy check in Phase 4, item 3.
5. **County and sub-county users never receive VHF records on mobile** because of the download bug. Fix it in Task 4 and check with a sub-county DSO test account.

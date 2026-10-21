-- VHF (Ebola) line list on Postgres: one row per VHF record, cases and contacts.
-- Port of ../datasets/vhf_line_list.sql (Spark); keep the two in step until Spark is retired.
-- The transmission tree and the county map include it (-- @include vhf_line_list.sql).
--
-- Mobile saves each record (vhf-case.json, used for cases and contacts) as a Patient with
-- identifier system 'vhf-case-information' and one Observation per answer, coded by linkId.
-- Lab results, daily contact follow-ups and contact monitoring are child Encounters whose
-- Observations share the same subject, so everything is pivoted per patient (latest value
-- per code). Choice answers are stored as display text, so comparisons are on LOWER(value).
-- The pipeline writes missing values as '', hence the NULLIFs; timestamps are ISO text.
WITH vhf AS (
  SELECT p.id AS patient_id,
         MAX(CASE WHEN i.type_code = 'EPID' THEN NULLIF(i.value, '') END) AS epid,
         MAX(CASE WHEN i.system = 'http://hie.org/identifiers/CONTACT_ID' THEN NULLIF(i.value, '') END) AS contact_id
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false
  GROUP BY p.id
  HAVING MAX(CASE WHEN i.system = 'vhf-case-information' THEN 1 ELSE 0 END) = 1
),
obs_norm AS (
  -- The admin lab form uses data-dictionary linkIds; mobile uses vhf-* ones.
  -- Map admin codes onto the mobile codes BEFORE taking the latest value.
  SELECT o.patient_id,
         CASE o.code
           WHEN 'final_laboratory_result'         THEN 'vhf-final-result'
           WHEN 'date_of_final_laboratory_result' THEN 'vhf-final-result-date'
           WHEN 'final_laboratory_facility'       THEN 'vhf-final-lab'
           WHEN 'preliminary_laboratory_result'   THEN 'vhf-preliminary-result'
           WHEN 'date_of_preliminary_result'      THEN 'vhf-preliminary-result-date'
           WHEN 'date_sample_received'            THEN 'vhf-received-date'
           WHEN 'condition_of_sample'             THEN 'vhf-sample-condition'
           WHEN 'laboratory_tests'                THEN 'vhf-lab-tests'
           ELSE NULLIF(o.code, '')
         END AS code,
         COALESCE(NULLIF(o.value_string, ''), NULLIF(o.value_cc_text, ''),
                  NULLIF(o.value_cc_display, ''), SUBSTRING(NULLIF(o.value_datetime, '') FROM 1 FOR 10),
                  NULLIF(o.value_integer, ''), NULLIF(o.value_boolean, ''),
                  NULLIF(o.value_quantity, '')) AS val,
         NULLIF(o.last_updated, '')::timestamptz AS lu,
         NULLIF(o.issued, '')::timestamptz AS issued,
         o.id AS obs_id
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM vhf)
),
obs_latest AS (
  SELECT patient_id, code, val FROM (
    SELECT patient_id, code, val,
           -- Ties on lastUpdated are common (a record re-saved at once), so the answer's own
           -- issued time decides; Spark's version had no tie-break and picked arbitrarily.
           ROW_NUMBER() OVER (PARTITION BY patient_id, code
                              ORDER BY lu DESC NULLS LAST, issued DESC NULLS LAST, obs_id COLLATE "C") rn
    FROM obs_norm
  ) x WHERE rn = 1
),
o AS (
  SELECT patient_id AS o_patient_id,
    MAX(CASE WHEN code = 'EPID' THEN val END) AS epid_obs,
    MAX(CASE WHEN code IN ('294367770999','294367770999_county','294367770999_sub_county','294367770999_national') THEN val END) AS county,
    MAX(CASE WHEN code IN ('819946803642','819946803642_county','819946803642_sub_county','819946803642_national') THEN val END) AS subcounty,
    MAX(CASE WHEN code IN ('819943434','819943434_county','819943434_sub_county','819943434_national') THEN val END) AS ward,
    MAX(CASE WHEN code IN ('819946803677','819946803677_county','819946803677_sub_county','819946803677_national') THEN val END) AS facility,
    MAX(CASE WHEN code = 'vhf-disease'                 THEN val END) AS disease,
    MAX(CASE WHEN code = 'vhf-disease-other'           THEN val END) AS disease_other,
    MAX(CASE WHEN code = 'vhf-investigation-date'      THEN val END) AS investigation_date,
    MAX(CASE WHEN code = 'vhf-case-type'               THEN val END) AS case_type,
    MAX(CASE WHEN code = 'vhf-source-case-epid'        THEN val END) AS source_epid,
    MAX(CASE WHEN code = '492731638700'                THEN val END) AS age_years,
    MAX(CASE WHEN code = 'vhf-phone'                   THEN val END) AS phone,
    MAX(CASE WHEN code = 'vhf-occupation-specify'      THEN val END) AS occupation_specify,
    MAX(CASE WHEN code = 'vhf-occupation'              THEN val END) AS occupation,
    MAX(CASE WHEN code = 'vhf-pregnant'                THEN val END) AS pregnant,
    MAX(CASE WHEN code = 'a4-county'                   THEN val END) AS res_county,
    MAX(CASE WHEN code = 'a3-sub-county'               THEN val END) AS res_subcounty,
    MAX(CASE WHEN code = 'vhf-village'                 THEN val END) AS village,
    MAX(CASE WHEN code = 'vhf-symptoms'                THEN val END) AS symptoms,
    MAX(CASE WHEN code = '728034137219'                THEN val END) AS onset_date,
    MAX(CASE WHEN code = 'vhf-care-type'               THEN val END) AS care_type,
    MAX(CASE WHEN code = 'vhf-care-facility'           THEN val END) AS care_facility,
    MAX(CASE WHEN code = 'vhf-admission-date'          THEN val END) AS admission_date,
    MAX(CASE WHEN code = 'vhf-outcome'                 THEN val END) AS outcome,
    MAX(CASE WHEN code = 'vhf-death-date'              THEN val END) AS death_date,
    MAX(CASE WHEN code = 'vhf-case-status'             THEN val END) AS case_status,
    MAX(CASE WHEN code = 'vhf-discharge-date'          THEN val END) AS discharge_date,
    MAX(CASE WHEN code = 'vhf-exposure-type'           THEN val END) AS exposure_type,
    MAX(CASE WHEN code = 'vhf-contact-date'            THEN val END) AS contact_date,
    MAX(CASE WHEN code = 'vhf-relationship'            THEN val END) AS relationship,
    MAX(CASE WHEN code = 'vhf-travelled'               THEN val END) AS travelled,
    MAX(CASE WHEN code = 'vhf-ebola-vaccinated'        THEN val END) AS vaccinated,
    MAX(CASE WHEN code = 'vhf-samples-collected'       THEN val END) AS samples_collected,
    MAX(CASE WHEN code = 'vhf-sample-type'             THEN val END) AS sample_type,
    MAX(CASE WHEN code = 'vhf-collection-date'         THEN val END) AS collection_date,
    MAX(CASE WHEN code = 'vhf-sent-date'               THEN val END) AS sent_date,
    MAX(CASE WHEN code = 'vhf-specimen-id'             THEN val END) AS specimen_id,
    MAX(CASE WHEN code = 'vhf-received-date'           THEN val END) AS received_date,
    MAX(CASE WHEN code = 'vhf-sample-condition'        THEN val END) AS sample_condition,
    MAX(CASE WHEN code = 'vhf-lab-tests'               THEN val END) AS lab_tests,
    MAX(CASE WHEN code = 'vhf-preliminary-result'      THEN val END) AS preliminary_result,
    MAX(CASE WHEN code = 'vhf-preliminary-result-date' THEN val END) AS preliminary_date,
    MAX(CASE WHEN code = 'vhf-final-result'            THEN val END) AS final_result,
    MAX(CASE WHEN code = 'vhf-final-result-date'       THEN val END) AS final_date,
    MAX(CASE WHEN code = 'vhf-final-lab'               THEN val END) AS final_lab,
    MAX(CASE WHEN code = 'final_classification'        THEN val END) AS lab_classification,
    MAX(CASE WHEN code = 'vhf-exposure-risk'           THEN val END) AS exposure_risk,
    MAX(CASE WHEN code = 'vhf-monitoring-status'       THEN val END) AS monitoring_status
  FROM obs_latest GROUP BY patient_id
),
follow_up AS (
  -- Daily contact follow-ups are repeated records, so aggregate all of them.
  SELECT patient_id,
    COUNT(DISTINCT CASE WHEN code = 'vhf-follow-up-date' THEN val END) AS days_followed,
    MAX(CASE WHEN code = 'vhf-follow-up-date' THEN nphiis.to_date_safe(val) END) AS last_follow_up,
    MAX(CASE WHEN code = 'vhf-follow-up-symptomatic' AND LOWER(val) = 'yes' THEN 1 ELSE 0 END) AS ever_symptomatic
  FROM obs_norm
  WHERE code IN ('vhf-follow-up-date', 'vhf-follow-up-symptomatic')
  GROUP BY patient_id
),
submitted AS (
  SELECT patient_id, (MIN(lu) AT TIME ZONE 'UTC')::date AS first_submitted FROM obs_norm GROUP BY patient_id
),
base AS (
  SELECT
    v.patient_id,
    COALESCE(v.epid, o.epid_obs) AS epid,
    v.contact_id,
    o.*,
    s.first_submitted AS date_reported,
    NULLIF(p.birth_date, '') AS birth_date,
    NULLIF(p.gender, '') AS gender,
    TRIM(CONCAT(p.given, ' ', p.family)) AS patient_name,
    f.days_followed, f.last_follow_up, f.ever_symptomatic,
    -- A contact that became a case is reported as a case.
    CASE
      WHEN LOWER(o.case_type) = 'contact'
       AND LOWER(COALESCE(o.monitoring_status, '')) NOT LIKE 'became%' THEN 'Contact'
      ELSE 'Case'
    END AS record_type,
    -- Day 0 of a contact's 21-day follow-up: the date of contact, else the registration date.
    COALESCE(nphiis.to_date_safe(o.contact_date), s.first_submitted) AS day_zero
  FROM vhf v
  JOIN public.patient_flat_pg p ON p.id = v.patient_id
  LEFT JOIN o ON o.o_patient_id = v.patient_id
  LEFT JOIN follow_up f ON f.patient_id = v.patient_id
  LEFT JOIN submitted s ON s.patient_id = v.patient_id
),
classified AS (
  SELECT b.*,
    -- Provisional until KNPHI confirms the VHF case definition: a lab result outranks the
    -- classification entered at investigation (as the mobile app does).
    CASE
      WHEN record_type = 'Contact'                    THEN 'Contact'
      WHEN LOWER(final_result) = 'positive'           THEN 'Confirmed'
      WHEN LOWER(lab_classification) = 'confirmed'    THEN 'Confirmed'
      WHEN LOWER(lab_classification) = 'probable'     THEN 'Probable'
      WHEN LOWER(final_result) = 'negative'
        OR LOWER(lab_classification) LIKE 'not%'      THEN 'Discarded'
      WHEN LOWER(case_type) = 'confirmed'             THEN 'Confirmed'
      WHEN LOWER(case_type) = 'probable'              THEN 'Probable'
      ELSE 'Suspected'
    END AS classification,
    CASE
      WHEN LOWER(outcome) = 'dead' OR LOWER(case_status) = 'dead' THEN 'Dead'
      WHEN LOWER(outcome) = 'alive' THEN 'Alive'
    END AS outcome_final
  FROM base b
)
SELECT
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(county, '')), '\s+', ' ', 'g'))    AS county_rls,
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(subcounty, '')), '\s+', ' ', 'g')) AS subcounty_rls,
  patient_id,
  epid                                    AS "EPID",
  contact_id                              AS "Contact ID",
  record_type                             AS "Record Type",
  classification                          AS "Classification",
  COALESCE(disease_other, disease)        AS "Disease",
  date_reported                           AS "Date Reported",
  -- Monday of the week of onset (else investigation, else report).
  DATE_TRUNC('week', COALESCE(nphiis.to_date_safe(onset_date), nphiis.to_date_safe(investigation_date), date_reported))::date AS "Epi Week",
  CASE WHEN LOWER(final_result) = 'positive' THEN nphiis.to_date_safe(final_date)
       WHEN classification = 'Confirmed'     THEN date_reported
  END                                     AS "Date Confirmed",
  TO_CHAR(nphiis.to_date_safe(investigation_date), 'DD/MM/YYYY') AS "Investigation Date",
  county                                  AS "County",
  subcounty                               AS "Sub County",
  ward                                    AS "Ward",
  facility                                AS "Facility",
  patient_name                            AS "Patient Name",
  CASE LOWER(gender) WHEN 'male' THEN 'M' WHEN 'female' THEN 'F' END AS "Sex",
  COALESCE(nphiis.to_int_safe(age_years),
           FLOOR(nphiis.months_between(COALESCE(nphiis.to_date_safe(onset_date), date_reported),
                                          nphiis.to_date_safe(birth_date)) / 12)::int) AS "Age",
  TO_CHAR(nphiis.to_date_safe(birth_date), 'DD/MM/YYYY') AS "Birth Date",
  phone                                   AS "Phone",
  COALESCE(occupation_specify, occupation) AS "Occupation",
  pregnant                                AS "Pregnant",
  res_county                              AS "Residence County",
  res_subcounty                           AS "Residence Subcounty",
  village                                 AS "Village",
  symptoms                                AS "Symptoms",
  TO_CHAR(nphiis.to_date_safe(onset_date), 'DD/MM/YYYY')     AS "Onset Date",
  care_type                               AS "Care Type",
  care_facility                           AS "Care Facility",
  TO_CHAR(nphiis.to_date_safe(admission_date), 'DD/MM/YYYY') AS "Admission Date",
  outcome_final                           AS "Outcome",
  TO_CHAR(nphiis.to_date_safe(death_date), 'DD/MM/YYYY')     AS "Death Date",
  case_status                             AS "Patient Status",
  TO_CHAR(nphiis.to_date_safe(discharge_date), 'DD/MM/YYYY') AS "Discharge Date",
  exposure_type                           AS "Exposure Type",
  TO_CHAR(nphiis.to_date_safe(contact_date), 'DD/MM/YYYY')   AS "Contact Date",
  relationship                            AS "Relationship",
  source_epid                             AS "Source EPID",
  travelled                               AS "Travelled",
  vaccinated                              AS "Vaccinated",
  samples_collected                       AS "Samples Collected",
  sample_type                             AS "Sample Type",
  TO_CHAR(nphiis.to_date_safe(collection_date), 'DD/MM/YYYY') AS "Collection Date",
  TO_CHAR(nphiis.to_date_safe(sent_date), 'DD/MM/YYYY')       AS "Sent Date",
  specimen_id                             AS "Specimen ID",
  TO_CHAR(nphiis.to_date_safe(received_date), 'DD/MM/YYYY')   AS "Received Date",
  sample_condition                        AS "Sample Condition",
  lab_tests                               AS "Lab Tests",
  preliminary_result                      AS "Preliminary Result",
  TO_CHAR(nphiis.to_date_safe(preliminary_date), 'DD/MM/YYYY') AS "Preliminary Date",
  final_result                            AS "Final Result",
  TO_CHAR(nphiis.to_date_safe(final_date), 'DD/MM/YYYY')      AS "Final Date",
  final_lab                               AS "Final Lab",
  -- Days from sample collection to the final result.
  nphiis.to_date_safe(final_date) - nphiis.to_date_safe(collection_date) AS "Lab Turnaround",
  -- Contact follow-up (empty for cases).
  exposure_risk                           AS "Exposure Risk",
  CASE WHEN record_type = 'Contact' THEN TO_CHAR(day_zero + 21, 'DD/MM/YYYY') END AS "Followup Ends",
  CASE WHEN record_type = 'Contact' THEN COALESCE(days_followed, 0) END AS "Days Followed",
  TO_CHAR(last_follow_up, 'DD/MM/YYYY')   AS "Last Followup",
  CASE WHEN record_type = 'Contact'
       THEN CASE WHEN last_follow_up >= CURRENT_DATE - 1 THEN 'Yes' ELSE 'No' END END AS "Seen Recently",
  CASE WHEN record_type = 'Contact' THEN CASE WHEN ever_symptomatic = 1 THEN 'Yes' ELSE 'No' END END AS "Ever Symptomatic",
  -- Latest monitoring status; without one, derived from the 21-day window.
  CASE
    WHEN record_type <> 'Contact' THEN NULL
    WHEN monitoring_status IS NOT NULL THEN monitoring_status
    WHEN CURRENT_DATE - day_zero > 21 THEN 'Window complete'
    ELSE 'Under follow up'
  END                                     AS "Monitoring Status"
FROM classified

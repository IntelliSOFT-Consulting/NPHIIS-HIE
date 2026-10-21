-- Precomputed: refresh_tables.py builds this into the Spark table nphiis_vhf_line_list
-- (hourly, after the data pipeline); the "VHF Line List" dataset reads that table.
-- VHF (Ebola) line list: one row per VHF record, cases and contacts.
--
-- Mobile saves each record (vhf-case.json, used for cases and contacts) as a
-- Patient with identifier system 'vhf-case-information' and one Observation per
-- answer, coded by linkId. Lab results, daily contact follow-ups and contact
-- monitoring are child Encounters whose Observations share the same subject, so
-- everything is pivoted per patient (latest value per code).
--
-- Choice answers are stored as the option's display text ("Positive",
-- "Contact"), so comparisons are on LOWER(value).
--
-- Superset rejects some column names in table charts as "sub-queries" (e.g.
-- three plain words, or a keyword such as CASE or FROM); build_vhf_dashboard.py
-- checks every name.
WITH vhf AS (
  SELECT p.id AS patient_id,
         MAX(CASE WHEN id_elem.type.coding[0].code = 'EPID' THEN id_elem.value END) AS epid,
         MAX(CASE WHEN id_elem.system = 'http://hie.org/identifiers/CONTACT_ID' THEN id_elem.value END) AS contact_id
  FROM patient p
  LATERAL VIEW EXPLODE(p.identifier) id_table AS id_elem
  WHERE COALESCE(p.active, true) = true
  GROUP BY p.id
  HAVING MAX(CASE WHEN id_elem.system = 'vhf-case-information' THEN 1 ELSE 0 END) = 1
),
obs_norm AS (
  -- The admin lab form uses data-dictionary linkIds; mobile uses vhf-* ones.
  -- Map admin codes onto the mobile codes BEFORE taking the latest value.
  SELECT o.subject.patientId AS patient_id,
         CASE o.code.coding[0].code
           WHEN 'final_laboratory_result'                 THEN 'vhf-final-result'
           WHEN 'date_of_final_laboratory_result'         THEN 'vhf-final-result-date'
           WHEN 'final_laboratory_facility'               THEN 'vhf-final-lab'
           WHEN 'preliminary_laboratory_result'           THEN 'vhf-preliminary-result'
           WHEN 'date_of_preliminary_result'              THEN 'vhf-preliminary-result-date'
           WHEN 'date_sample_received'                    THEN 'vhf-received-date'
           WHEN 'condition_of_sample'                     THEN 'vhf-sample-condition'
           WHEN 'laboratory_tests'                        THEN 'vhf-lab-tests'
           ELSE o.code.coding[0].code
         END AS code,
         COALESCE(o.value.string, o.value.codeableConcept.text,
                  o.value.codeableConcept.coding[0].display,
                  SUBSTRING(CAST(o.value.dateTime AS STRING), 1, 10),
                  CAST(o.value.integer AS STRING), CAST(o.value.boolean AS STRING),
                  CAST(o.value.quantity.value AS STRING)) AS val,
         o.meta.lastUpdated AS lu
  FROM Observation o
  WHERE o.subject.patientId IN (SELECT patient_id FROM vhf)
),
obs_latest AS (
  SELECT patient_id, code, val FROM (
    SELECT patient_id, code, val,
           ROW_NUMBER() OVER (PARTITION BY patient_id, code ORDER BY lu DESC) rn
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
  -- Daily contact follow-ups are repeated records, so aggregate all of them
  -- rather than the latest value.
  SELECT patient_id,
    COUNT(DISTINCT CASE WHEN code = 'vhf-follow-up-date' THEN val END) AS days_followed,
    MAX(CASE WHEN code = 'vhf-follow-up-date' THEN TO_DATE(val) END)   AS last_follow_up,
    MAX(CASE WHEN code = 'vhf-follow-up-symptomatic' AND LOWER(val) = 'yes' THEN 1 ELSE 0 END) AS ever_symptomatic
  FROM obs_norm
  WHERE code IN ('vhf-follow-up-date', 'vhf-follow-up-symptomatic')
  GROUP BY patient_id
),
submitted AS (
  SELECT patient_id, MIN(lu) AS first_submitted FROM obs_norm GROUP BY patient_id
),
base AS (
  SELECT
    v.patient_id,
    COALESCE(v.epid, o.epid_obs) AS epid,
    v.contact_id,
    o.*,
    DATE(s.first_submitted) AS date_reported,
    p.birthDate AS birth_date,
    p.gender,
    TRIM(CONCAT(CONCAT_WS(' ', p.name[0].given), ' ', COALESCE(p.name[0].family, ''))) AS patient_name,
    f.days_followed, f.last_follow_up, f.ever_symptomatic,
    -- A contact that became a case is reported as a case.
    CASE
      WHEN LOWER(o.case_type) = 'contact'
       AND LOWER(COALESCE(o.monitoring_status, '')) NOT LIKE 'became%' THEN 'Contact'
      ELSE 'Case'
    END AS record_type,
    -- Day 0 of a contact's 21-day follow-up: the date of contact, else the
    -- registration date (same rule as the mobile app).
    COALESCE(TO_DATE(o.contact_date), DATE(s.first_submitted)) AS day_zero
  FROM vhf v
  JOIN patient p ON p.id = v.patient_id
  LEFT JOIN o ON o.o_patient_id = v.patient_id
  LEFT JOIN follow_up f ON f.patient_id = v.patient_id
  LEFT JOIN submitted s ON s.patient_id = v.patient_id
),
classified AS (
  SELECT b.*,
    -- Provisional until KNPHI confirms the VHF case definition: a lab result
    -- outranks the classification entered at investigation. Mirrors the
    -- mobile app (Positive -> confirmed, Negative -> discarded).
    CASE
      WHEN record_type = 'Contact'                                   THEN 'Contact'
      WHEN LOWER(final_result) = 'positive'                          THEN 'Confirmed'
      WHEN LOWER(lab_classification) = 'confirmed'                   THEN 'Confirmed'
      WHEN LOWER(lab_classification) = 'probable'                    THEN 'Probable'
      WHEN LOWER(final_result) = 'negative'
        OR LOWER(lab_classification) LIKE 'not%'                     THEN 'Discarded'
      WHEN LOWER(case_type) = 'confirmed'                            THEN 'Confirmed'
      WHEN LOWER(case_type) = 'probable'                             THEN 'Probable'
      ELSE 'Suspected'
    END AS classification,
    CASE
      WHEN LOWER(outcome) = 'dead' OR LOWER(case_status) = 'dead' THEN 'Dead'
      WHEN LOWER(outcome) = 'alive' THEN 'Alive'
    END AS outcome_final
  FROM base b
)
SELECT
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(county, '')), '\\s+', ' '))    AS county_rls,
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(subcounty, '')), '\\s+', ' ')) AS subcounty_rls,
  patient_id,
  epid                                    AS `EPID`,
  contact_id                              AS `Contact ID`,
  record_type                             AS `Record Type`,
  classification                          AS `Classification`,
  COALESCE(disease_other, disease)        AS `Disease`,
  -- Real DATEs so the dashboard time filter and epi curve can bind to them.
  date_reported                           AS `Date Reported`,
  -- Monday of the week of onset (else investigation, else report). Superset's
  -- Hive weekly time grain uses a date pattern Spark 3 rejects.
  CAST(DATE_TRUNC('WEEK', COALESCE(TO_DATE(onset_date), TO_DATE(investigation_date), date_reported)) AS DATE) AS `Epi Week`,
  CASE WHEN LOWER(final_result) = 'positive' THEN TO_DATE(final_date)
       WHEN classification = 'Confirmed'     THEN date_reported
  END                                     AS `Date Confirmed`,
  DATE_FORMAT(TO_DATE(investigation_date), 'dd/MM/yyyy') AS `Investigation Date`,
  county                                  AS `County`,
  subcounty                               AS `Sub County`,
  ward                                    AS `Ward`,
  facility                                AS `Facility`,
  patient_name                            AS `Patient Name`,
  CASE LOWER(gender) WHEN 'male' THEN 'M' WHEN 'female' THEN 'F' END AS `Sex`,
  COALESCE(CAST(age_years AS INT),
           CAST(FLOOR(MONTHS_BETWEEN(COALESCE(TO_DATE(onset_date), date_reported), TO_DATE(birth_date)) / 12) AS INT)) AS `Age`,
  DATE_FORMAT(TO_DATE(birth_date), 'dd/MM/yyyy') AS `Birth Date`,
  phone                                   AS `Phone`,
  COALESCE(occupation_specify, occupation) AS `Occupation`,
  pregnant                                AS `Pregnant`,
  res_county                              AS `Residence County`,
  res_subcounty                           AS `Residence Subcounty`,
  village                                 AS `Village`,
  symptoms                                AS `Symptoms`,
  DATE_FORMAT(TO_DATE(onset_date), 'dd/MM/yyyy')     AS `Onset Date`,
  care_type                               AS `Care Type`,
  care_facility                           AS `Care Facility`,
  DATE_FORMAT(TO_DATE(admission_date), 'dd/MM/yyyy') AS `Admission Date`,
  outcome_final                           AS `Outcome`,
  DATE_FORMAT(TO_DATE(death_date), 'dd/MM/yyyy')     AS `Death Date`,
  case_status                             AS `Patient Status`,
  DATE_FORMAT(TO_DATE(discharge_date), 'dd/MM/yyyy') AS `Discharge Date`,
  exposure_type                           AS `Exposure Type`,
  DATE_FORMAT(TO_DATE(contact_date), 'dd/MM/yyyy')   AS `Contact Date`,
  relationship                            AS `Relationship`,
  source_epid                             AS `Source EPID`,
  travelled                               AS `Travelled`,
  vaccinated                              AS `Vaccinated`,
  samples_collected                       AS `Samples Collected`,
  sample_type                             AS `Sample Type`,
  DATE_FORMAT(TO_DATE(collection_date), 'dd/MM/yyyy') AS `Collection Date`,
  DATE_FORMAT(TO_DATE(sent_date), 'dd/MM/yyyy')       AS `Sent Date`,
  specimen_id                             AS `Specimen ID`,
  DATE_FORMAT(TO_DATE(received_date), 'dd/MM/yyyy')   AS `Received Date`,
  sample_condition                        AS `Sample Condition`,
  lab_tests                               AS `Lab Tests`,
  preliminary_result                      AS `Preliminary Result`,
  DATE_FORMAT(TO_DATE(preliminary_date), 'dd/MM/yyyy') AS `Preliminary Date`,
  final_result                            AS `Final Result`,
  DATE_FORMAT(TO_DATE(final_date), 'dd/MM/yyyy')      AS `Final Date`,
  final_lab                               AS `Final Lab`,
  -- Days from sample collection to the final result.
  DATEDIFF(TO_DATE(final_date), TO_DATE(collection_date)) AS `Lab Turnaround`,
  -- Contact follow-up (empty for cases).
  exposure_risk                           AS `Exposure Risk`,
  CASE WHEN record_type = 'Contact' THEN DATE_FORMAT(DATE_ADD(day_zero, 21), 'dd/MM/yyyy') END AS `Followup Ends`,
  CASE WHEN record_type = 'Contact' THEN COALESCE(days_followed, 0) END AS `Days Followed`,
  DATE_FORMAT(last_follow_up, 'dd/MM/yyyy') AS `Last Followup`,
  CASE WHEN record_type = 'Contact'
       THEN IF(last_follow_up >= DATE_SUB(CURRENT_DATE(), 1), 'Yes', 'No') END AS `Seen Recently`,
  CASE WHEN record_type = 'Contact' THEN IF(ever_symptomatic = 1, 'Yes', 'No') END AS `Ever Symptomatic`,
  -- Latest monitoring status; without one, derived from the 21-day window.
  CASE
    WHEN record_type <> 'Contact' THEN NULL
    WHEN monitoring_status IS NOT NULL THEN monitoring_status
    WHEN DATEDIFF(CURRENT_DATE(), day_zero) > 21 THEN 'Window complete'
    ELSE 'Under follow up'
  END                                     AS `Monitoring Status`
FROM classified

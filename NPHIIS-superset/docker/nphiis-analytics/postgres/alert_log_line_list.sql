-- Alert Log line list on Postgres: one row per alert (the mobile Alert Log form, alert-rumor-log.json).
--
-- Mobile saves each alert as a Patient with identifier system 'alert-rumor-log' and one
-- Observation per answer, coded by linkId. The latest value per code is pivoted per patient,
-- as in vhf_line_list.sql. Choice answers are stored as display text ("Yes", "Male").
-- Alerts saved before the form was reorganised use older codes (alert-name, alert-location,
-- alert-signs-symptoms); they are read as a fallback so those rows are not empty.
-- The pipeline writes missing values as '', hence the NULLIFs.
-- Column names avoid plain three-word names and SQL keywords: Superset rejects those in
-- table charts as sub-queries.
WITH alerts AS (
  SELECT p.id AS patient_id,
         MAX(CASE WHEN i.system = 'alert-rumor-log' THEN NULLIF(i.value, '') END) AS alert_uuid
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false
  GROUP BY p.id
  HAVING MAX(CASE WHEN i.system = 'alert-rumor-log' THEN 1 ELSE 0 END) = 1
),
obs_norm AS (
  SELECT o.patient_id,
         NULLIF(o.code, '') AS code,
         COALESCE(NULLIF(o.value_string, ''), NULLIF(o.value_cc_text, ''),
                  NULLIF(o.value_cc_display, ''), SUBSTRING(NULLIF(o.value_datetime, '') FROM 1 FOR 10),
                  NULLIF(o.value_integer, ''), NULLIF(o.value_boolean, ''),
                  NULLIF(o.value_quantity, '')) AS val,
         NULLIF(o.last_updated, '')::timestamptz AS lu,
         NULLIF(o.issued, '')::timestamptz AS issued,
         o.id AS obs_id
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM alerts)
),
obs_latest AS (
  SELECT patient_id, code, val FROM (
    SELECT patient_id, code, val,
           ROW_NUMBER() OVER (PARTITION BY patient_id, code
                              ORDER BY lu DESC NULLS LAST, issued DESC NULLS LAST, obs_id COLLATE "C") rn
    FROM obs_norm
    WHERE code IS NOT NULL
  ) x WHERE rn = 1
),
o AS (
  SELECT patient_id AS o_patient_id,
    MAX(CASE WHEN code = 'alert-identifier'          THEN val END) AS alert_id,
    MAX(CASE WHEN code = 'alert-date'                THEN val END) AS alert_date,
    MAX(CASE WHEN code = 'alert-source-type'         THEN val END) AS source,
    MAX(CASE WHEN code = 'alert-source-type-other'   THEN val END) AS source_other,
    MAX(CASE WHEN code = 'alert-facility'            THEN val END) AS reporting_facility,
    MAX(CASE WHEN code = 'alert-reporter-name'       THEN val END) AS reporter,
    MAX(CASE WHEN code = 'alert-reporter-mobile'     THEN val END) AS reporter_phone,
    MAX(CASE WHEN code = '486402457213'              THEN val END) AS family_name,
    MAX(CASE WHEN code = '873240407472'              THEN val END) AS given_names,
    MAX(CASE WHEN code = 'alert-name'                THEN val END) AS legacy_name,
    MAX(CASE WHEN code = '929966324957'              THEN val END) AS sex,
    MAX(CASE WHEN code = '492731638700'              THEN val END) AS age_years,
    MAX(CASE WHEN code = '185726989867'              THEN val END) AS age_months,
    MAX(CASE WHEN code = 'alert-home-country'        THEN val END) AS residence_country,
    MAX(CASE WHEN code = 'a4-county'                 THEN val END) AS res_county,
    MAX(CASE WHEN code = 'a3-sub-county'             THEN val END) AS res_subcounty,
    MAX(CASE WHEN code = 'a2-ward'                   THEN val END) AS res_ward,
    MAX(CASE WHEN code = 'alert-village'             THEN val END) AS village,
    MAX(CASE WHEN code = 'alert-location'            THEN val END) AS legacy_location,
    MAX(CASE WHEN code = 'alert-mobile'              THEN val END) AS phone,
    MAX(CASE WHEN code = 'alert-vital-status'        THEN val END) AS vital_status,
    MAX(CASE WHEN code = 'alert-hcw'                 THEN val END) AS hcw,
    MAX(CASE WHEN code = 'alert-hcw-facility'        THEN val END) AS hcw_facility,
    MAX(CASE WHEN code = 'alert-hcw-role'            THEN val END) AS hcw_role,
    MAX(CASE WHEN code = 'alert-onset-date'          THEN val END) AS onset_date,
    MAX(CASE WHEN code = 'alert-true-onset-date'     THEN val END) AS true_onset_date,
    MAX(CASE WHEN code = 'alert-fever'               THEN val END) AS fever,
    MAX(CASE WHEN code = 'alert-headache'            THEN val END) AS headache,
    MAX(CASE WHEN code = 'alert-chills'              THEN val END) AS chills,
    MAX(CASE WHEN code = 'alert-weakness'            THEN val END) AS weakness,
    MAX(CASE WHEN code = 'alert-joint-pain'          THEN val END) AS joint_pain,
    MAX(CASE WHEN code = 'alert-fatigue'             THEN val END) AS fatigue,
    MAX(CASE WHEN code = 'alert-muscle-pain'         THEN val END) AS muscle_pain,
    MAX(CASE WHEN code = 'alert-diarrhoea'           THEN val END) AS diarrhoea,
    MAX(CASE WHEN code = 'alert-nose-bleeding'       THEN val END) AS nose_bleeding,
    MAX(CASE WHEN code = 'alert-vomiting'            THEN val END) AS vomiting,
    MAX(CASE WHEN code = 'alert-unexplained-bleeding' THEN val END) AS unexplained_bleeding,
    MAX(CASE WHEN code = 'alert-signs-symptoms'      THEN val END) AS legacy_symptoms,
    MAX(CASE WHEN code = 'alert-known-case-contact'  THEN val END) AS known_contact,
    MAX(CASE WHEN code = 'alert-known-case-name'     THEN val END) AS known_case,
    MAX(CASE WHEN code = 'alert-travelled'           THEN val END) AS travelled,
    MAX(CASE WHEN code = 'alert-travel-from'         THEN val END) AS travel_from,
    MAX(CASE WHEN code = 'alert-travel-mode'         THEN val END) AS travel_mode,
    MAX(CASE WHEN code = 'alert-travel-mode-other'   THEN val END) AS travel_mode_other,
    MAX(CASE WHEN code = 'alert-sample-collected'    THEN val END) AS sample_taken,
    MAX(CASE WHEN code = 'alert-meets-case-definition' THEN val END) AS meets_definition,
    MAX(CASE WHEN code = 'alert-specimen-date'       THEN val END) AS specimen_date,
    MAX(CASE WHEN code = 'alert-specimen-type'       THEN val END) AS specimen_type,
    MAX(CASE WHEN code = 'alert-specimen-type-other' THEN val END) AS specimen_type_other,
    MAX(CASE WHEN code = 'alert-investigator-name'   THEN val END) AS investigator,
    MAX(CASE WHEN code = 'alert-investigation-date'  THEN val END) AS investigation_date,
    MAX(CASE WHEN code = 'alert-description'         THEN val END) AS comments,
    -- Where the alert was logged from (Reporting Site group, same codes as the VHF form).
    MAX(CASE WHEN code IN ('294367770999','294367770999_county','294367770999_sub_county','294367770999_national') THEN val END) AS site_county,
    MAX(CASE WHEN code IN ('819946803642','819946803642_county','819946803642_sub_county','819946803642_national') THEN val END) AS site_subcounty
  FROM obs_latest
  GROUP BY patient_id
)
SELECT
  a.patient_id                                         AS "Patient ID",
  COALESCE(o.alert_id, a.alert_uuid)                   AS "Alert ID",
  nphiis.to_date_safe(o.alert_date)                    AS "Date Alerted",
  DATE_TRUNC('week', nphiis.to_date_safe(o.alert_date))::date AS "Epi Week",
  COALESCE(NULLIF(o.source_other, ''), o.source)       AS "Source",
  COALESCE(o.reporting_facility, o.legacy_location)    AS "Reported By",
  o.reporter                                           AS "Reporter",
  o.reporter_phone                                     AS "Reporter Phone",
  COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', o.given_names, o.family_name)), ''), o.legacy_name) AS "Patient Name",
  o.sex                                                AS "Sex",
  COALESCE(o.age_years::numeric, ROUND(o.age_months::numeric / 12, 1)) AS "Age",
  o.age_months::numeric                                AS "Age Months",
  o.residence_country                                  AS "Country",
  o.res_county                                         AS "County",
  o.res_subcounty                                      AS "Sub County",
  o.res_ward                                           AS "Ward",
  o.village                                            AS "Village",
  o.phone                                              AS "Phone",
  o.vital_status                                       AS "Vital Status",
  o.hcw                                                AS "HCW",
  o.hcw_facility                                       AS "HCW Facility",
  o.hcw_role                                           AS "HCW Role",
  nphiis.to_date_safe(o.onset_date)                    AS "Onset Date",
  nphiis.to_date_safe(o.true_onset_date)               AS "True Onset",
  COALESCE(
    NULLIF(CONCAT_WS(', ',
      CASE WHEN LOWER(o.fever) = 'yes'                THEN 'Fever' END,
      CASE WHEN LOWER(o.headache) = 'yes'             THEN 'Headache' END,
      CASE WHEN LOWER(o.chills) = 'yes'               THEN 'Chills' END,
      CASE WHEN LOWER(o.weakness) = 'yes'             THEN 'Weakness' END,
      CASE WHEN LOWER(o.joint_pain) = 'yes'           THEN 'Joint pain' END,
      CASE WHEN LOWER(o.fatigue) = 'yes'              THEN 'Fatigue' END,
      CASE WHEN LOWER(o.muscle_pain) = 'yes'          THEN 'Muscle pain' END,
      CASE WHEN LOWER(o.diarrhoea) = 'yes'            THEN 'Diarrhoea' END,
      CASE WHEN LOWER(o.nose_bleeding) = 'yes'        THEN 'Nose bleeding' END,
      CASE WHEN LOWER(o.vomiting) = 'yes'             THEN 'Vomiting' END,
      CASE WHEN LOWER(o.unexplained_bleeding) = 'yes' THEN 'Unexplained bleeding' END), ''),
    o.legacy_symptoms)                                 AS "Symptoms",
  (CASE WHEN LOWER(o.fever) = 'yes' THEN 1 ELSE 0 END + CASE WHEN LOWER(o.headache) = 'yes' THEN 1 ELSE 0 END
   + CASE WHEN LOWER(o.chills) = 'yes' THEN 1 ELSE 0 END + CASE WHEN LOWER(o.weakness) = 'yes' THEN 1 ELSE 0 END
   + CASE WHEN LOWER(o.joint_pain) = 'yes' THEN 1 ELSE 0 END + CASE WHEN LOWER(o.fatigue) = 'yes' THEN 1 ELSE 0 END
   + CASE WHEN LOWER(o.muscle_pain) = 'yes' THEN 1 ELSE 0 END + CASE WHEN LOWER(o.diarrhoea) = 'yes' THEN 1 ELSE 0 END
   + CASE WHEN LOWER(o.nose_bleeding) = 'yes' THEN 1 ELSE 0 END + CASE WHEN LOWER(o.vomiting) = 'yes' THEN 1 ELSE 0 END
   + CASE WHEN LOWER(o.unexplained_bleeding) = 'yes' THEN 1 ELSE 0 END) AS "Symptom Count",
  o.known_contact                                      AS "Known Contact",
  o.known_case                                         AS "Known Case",
  o.travelled                                          AS "Travelled",
  o.travel_from                                        AS "Travel From",
  COALESCE(NULLIF(o.travel_mode_other, ''), o.travel_mode) AS "Travel Mode",
  o.sample_taken                                       AS "Sample Taken",
  o.meets_definition                                   AS "Meets Definition",
  nphiis.to_date_safe(o.specimen_date)                 AS "Specimen Date",
  COALESCE(NULLIF(o.specimen_type_other, ''), o.specimen_type) AS "Specimen Type",
  o.investigator                                       AS "Investigator",
  nphiis.to_date_safe(o.investigation_date)            AS "Investigated",
  -- Days from the alert to the field investigation.
  nphiis.to_date_safe(o.investigation_date) - nphiis.to_date_safe(o.alert_date) AS "Days To Visit",
  o.comments                                           AS "Comments",
  o.site_county                                        AS "Logged County",
  o.site_subcounty                                     AS "Logged Subcounty"
FROM alerts a
LEFT JOIN o ON o.o_patient_id = a.patient_id

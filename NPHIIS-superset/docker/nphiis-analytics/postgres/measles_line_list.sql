-- Measles CIF & Results line list on Postgres.
-- Port of the measles-cif-502 Spark dataset (id 109). One row per measles case.
-- Keeps ALL column names (backtick-quoted in Spark = double-quoted aliases here).
--
-- The outer SELECT in the Spark version reformats date columns from the inner base.
-- In Postgres we compute everything in one pass inside the WITH chain and emit the
-- same final column list with the same names.
WITH epid_identifier AS (
  SELECT i.id AS patient_id, NULLIF(i.value, '') AS epid_number
  FROM public.patient_identifier_pg i
  WHERE i.type_code = 'EPID'
    AND EXISTS (
      SELECT 1 FROM public.patient_identifier_pg i2
      WHERE i2.id = i.id AND i2.system LIKE 'measles-%'
    )
),
obs_norm AS (
  SELECT
    o.patient_id,
    CASE
      WHEN o.code IN ('finalClassification','final-classification')    THEN 'finalClassification'
      WHEN o.code IN ('measlesIgM','measles-igm')                      THEN 'measlesIgM'
      WHEN o.code IN ('rubellaIgM','rubella-igm')                      THEN 'rubellaIgM'
      WHEN o.code IN ('specimenCondition','specimen-condition')        THEN 'specimenCondition'
      WHEN o.code IN ('specimenReceivedDate','date-specimen-received') THEN 'specimenReceivedDate'
      WHEN o.code IN ('resultsToEPI','date-lab-sent-results')          THEN 'resultsToEPI'
      WHEN o.code IN ('sentToRegional','655865451155')                 THEN 'sentToRegional'
      WHEN o.code IN ('labId','8732404074721')                         THEN 'labId'
      ELSE NULLIF(o.code, '')
    END AS code,
    COALESCE(
      NULLIF(o.value_string, ''),
      NULLIF(o.value_cc_text, ''),
      NULLIF(o.value_cc_display, ''),
      SUBSTRING(NULLIF(o.value_datetime, '') FROM 1 FOR 10),
      NULLIF(o.value_integer, ''),
      NULLIF(o.value_boolean, ''),
      NULLIF(o.value_quantity, '')
    ) AS val,
    NULLIF(o.last_updated, '')::timestamptz AS lu,
    o.id AS obs_id
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (
    SELECT DISTINCT p.id FROM public.patient_flat_pg p
    JOIN public.patient_identifier_pg i ON i.id = p.id
    WHERE p.active IS DISTINCT FROM false AND i.system LIKE 'measles-%'
  )
),
obs_latest AS (
  SELECT patient_id, code, val, lu FROM (
    SELECT patient_id, code, val, lu,
           ROW_NUMBER() OVER (PARTITION BY patient_id, code
                              ORDER BY lu DESC NULLS LAST, obs_id COLLATE "C") rn
    FROM obs_norm
  ) x WHERE rn = 1
),
o AS (
  SELECT patient_id,
    MAX(CASE WHEN code = 'labId'          THEN val END) AS lab_id_obs,
    MAX(CASE WHEN code IN ('294367770999','294367770999_county','294367770999_sub_county','294367770999_national') THEN val END) AS county_obs,
    MAX(CASE WHEN code IN ('819946803642','819946803642_county','819946803642_sub_county','819946803642_national') THEN val END) AS subcounty_obs,
    MAX(CASE WHEN code IN ('819943434','819943434_county','819943434_sub_county','819943434_national')             THEN val END) AS ward_obs,
    MAX(CASE WHEN code IN ('819946803677','819946803677_county','819946803677_sub_county','819946803677_national') THEN val END) AS facility_obs,
    MAX(CASE WHEN code IN ('438862163919','438862163919_county','438862163919_sub_county','438862163919_national') THEN val END) AS ftype_obs,
    MAX(CASE WHEN code = 'age-at-onset'   THEN val END) AS age_onset_obs,
    MAX(CASE WHEN code = '492731638700'   THEN val END) AS age_years_obs,
    MAX(CASE WHEN code = '185726989867'   THEN val END) AS age_months_obs,
    MAX(CASE WHEN code = '828303331247'   THEN val END) AS age_days_obs,
    MAX(CASE WHEN code = 'a4-county'      THEN val END) AS res_county_obs,
    MAX(CASE WHEN code = 'a3-sub-county'  THEN val END) AS res_subcounty_obs,
    MAX(CASE WHEN code = 'a2-ward'        THEN val END) AS res_ward_obs,
    MAX(CASE WHEN code = '242811643559'   THEN val END) AS village_obs,
    MAX(CASE WHEN code = '946232932304'   THEN val END) AS landmark_obs,
    MAX(CASE WHEN code = '424111786438'   THEN val END) AS street_obs,
    MAX(CASE WHEN code = '754217593839'   THEN val END) AS phone_obs,
    MAX(CASE WHEN code = '554231819382'   THEN val END) AS hf_date_obs,
    MAX(CASE WHEN code = '483042281962'   THEN val END) AS status_obs,
    MAX(CASE WHEN code = '340908984116'   THEN val END) AS admission_obs,
    MAX(CASE WHEN code = '755731625544'   THEN val END) AS ipop_obs,
    MAX(CASE WHEN code = '508745697175'   THEN val END) AS outcome_obs,
    MAX(CASE WHEN code = '728034137219'   THEN val END) AS onset_obs,
    MAX(CASE WHEN code = '745196148424'   THEN val END) AS symptoms_obs,
    MAX(CASE WHEN code = '576528567552'   THEN val END) AS rash_date_obs,
    MAX(CASE WHEN code = '704922081985'   THEN val END) AS rash_type_obs,
    MAX(CASE WHEN code = '679340979918'   THEN val END) AS rash_other_obs,
    MAX(CASE WHEN code = '207408507040'   THEN val END) AS home_visit_obs,
    MAX(CASE WHEN code = '566661890668'   THEN val END) AS visit_date_obs,
    MAX(CASE WHEN code = '865158268604'   THEN val END) AS case_line_obs,
    MAX(CASE WHEN code = '517772812375'   THEN val END) AS vaccinated_obs,
    MAX(CASE WHEN code = '886125589225'   THEN val END) AS doses_obs,
    MAX(CASE WHEN code = '308128177300'   THEN val END) AS mr30_obs,
    MAX(CASE WHEN code = '544290619304'   THEN val END) AS last_vacc_obs,
    MAX(CASE WHEN code = '412689284625'   THEN val END) AS specimen_obs,
    MAX(CASE WHEN code = '8962468583341'  THEN val END) AS spec_date_obs,
    MAX(CASE WHEN code = '258912872921'   THEN val END) AS other_spec_obs,
    MAX(CASE WHEN code = '340507649387'   THEN val END) AS other_spec_type_obs,
    MAX(CASE WHEN code = '699353598445'   THEN val END) AS other_spec_date_obs,
    MAX(CASE WHEN code = '718251724172'   THEN val END) AS spec_sent_obs,
    MAX(CASE WHEN code = 'specimenReceivedDate'  THEN val END) AS spec_recv_obs,
    MAX(CASE WHEN code = 'specimenCondition'     THEN val END) AS spec_cond_obs,
    MAX(CASE WHEN code = 'measlesIgM'            THEN val END) AS measles_igm_obs,
    MAX(CASE WHEN code = 'rubellaIgM'            THEN val END) AS rubella_igm_obs,
    MAX(CASE WHEN code = 'residence'             THEN val END) AS residence_obs,
    MAX(CASE WHEN code = 'resultsToEPI'          THEN val END) AS results_epi_obs,
    MAX(CASE WHEN code = 'sentToRegional'        THEN val END) AS sent_regional_obs,
    MAX(CASE WHEN code = 'finalClassification'   THEN val END) AS final_class_obs,
    MAX(CASE WHEN code = 'measlesIgM'            THEN lu END)  AS measles_igm_obs_lu,
    MAX(CASE WHEN code = 'finalClassification'   THEN lu END)  AS final_class_obs_lu
  FROM obs_latest GROUP BY patient_id
),
submit_dates AS (
  SELECT patient_id, MIN(lu) AS case_submit
  FROM obs_norm GROUP BY patient_id
),
reporter AS (
  -- reporter = practitioner who submitted the earliest observation
  -- In the flat tables there is no Practitioner join, so we leave name/role NULL
  -- (same behaviour as when the practitioner is absent in Spark).
  SELECT CAST(NULL AS TEXT) AS patient_id,
         CAST(NULL AS TEXT) AS reporter_name,
         CAST(NULL AS TEXT) AS reporter_role
  WHERE 1 = 0
),
base AS (
  SELECT
    p.id AS patient_id,
    'KEN' AS "CountryCode",
    o.subcounty_obs AS "ReportingDistrict",
    o.county_obs    AS "ReportingCounty",
    (COALESCE(o.measles_igm_obs_lu, o.final_class_obs_lu) AT TIME ZONE 'UTC')::date AS "DateDistrictRecLabResults",
    (COALESCE(o.measles_igm_obs_lu, o.final_class_obs_lu) AT TIME ZONE 'UTC')::date AS "DateHealthfacilitynotified",
    (COALESCE(o.measles_igm_obs_lu, o.final_class_obs_lu) AT TIME ZONE 'UTC')::date AS "DateLabSentResulttodistrict",
    (COALESCE(o.measles_igm_obs_lu, o.final_class_obs_lu) AT TIME ZONE 'UTC')::date AS "DateSentFormtodistrict",
    (sd.case_submit AT TIME ZONE 'UTC')::date AS "SubmittedDate",
    (sd.case_submit AT TIME ZONE 'UTC')::date AS "DateReceivedNatlevel",
    (sd.case_submit AT TIME ZONE 'UTC')::date AS "DateRecformdistrict",
    NULL::text AS "Reporter Name",
    NULL::text AS "Reporter Role",
    CASE
      WHEN LOWER(o.residence_obs) = 'urban' THEN 'U'
      WHEN LOWER(o.residence_obs) = 'rural' THEN 'R'
      ELSE o.residence_obs
    END AS "Urbanrural",
    o.ward_obs      AS "Ward",
    o.facility_obs  AS "ReportingHealthfacility",
    o.ftype_obs     AS "Type of health facility",
    ei.epid_number  AS "IDNumber",
    TRIM(COALESCE(p.given,'') || ' ' || COALESCE(p.family,'')) AS "NamesOfPatient",
    CASE WHEN LOWER(NULLIF(p.gender,'')) = 'male'   THEN 'M'
         WHEN LOWER(NULLIF(p.gender,'')) = 'female' THEN 'F' ELSE NULL END AS "Sex",
    nphiis.to_date_safe(p.birth_date) AS "DateOfBirth",
    -- Age at Onset text  (Y years, M months, D days)
    CASE
      WHEN p.birth_date IS NULL THEN NULL
      WHEN nphiis.to_date_safe(COALESCE(o.onset_obs, p.last_updated)) IS NULL THEN NULL
      ELSE
        FLOOR(nphiis.months_between(
                nphiis.to_date_safe(COALESCE(o.onset_obs, p.last_updated)),
                nphiis.to_date_safe(p.birth_date)) / 12)::int::text || ' years, ' ||
        (FLOOR(nphiis.months_between(
                nphiis.to_date_safe(COALESCE(o.onset_obs, p.last_updated)),
                nphiis.to_date_safe(p.birth_date)))::int % 12)::text || ' months, ' ||
        ((nphiis.to_date_safe(COALESCE(o.onset_obs, p.last_updated)) -
          (nphiis.to_date_safe(p.birth_date) +
           FLOOR(nphiis.months_between(
                   nphiis.to_date_safe(COALESCE(o.onset_obs, p.last_updated)),
                   nphiis.to_date_safe(p.birth_date)))::int * INTERVAL '1 month')::date))::text || ' days'
    END AS "Age at Onset",
    o.age_years_obs  AS "AgeInyears",
    o.age_months_obs AS "AgeInmonths",
    o.age_days_obs   AS "Days",
    COALESCE(p.address_city, '')  AS "PatientsResidence",
    ''                            AS "Parent Guardian Name",
    o.res_subcounty_obs AS "DistrictofResidence",
    o.res_county_obs    AS "ProvinceOfResidence",
    o.res_ward_obs      AS "Residence Ward",
    o.village_obs       AS "Residence or Village",
    o.landmark_obs      AS "Neighborhood major landmark",
    o.street_obs        AS "Street Plot Estate S location",
    o.phone_obs         AS "Telephone No of parent or guardian",
    nphiis.to_date_safe(o.hf_date_obs)  AS "DateSeenHealthFacility",
    CASE WHEN o.status_obs = 'Yes' THEN 1 ELSE 2 END AS "Inoutpatient",
    o.admission_obs AS "Date of Admission",
    o.ipop_obs      AS "IP OP No",
    CASE
      WHEN o.outcome_obs = 'Alive'   THEN 1
      WHEN o.outcome_obs = 'Dead'    THEN 2
      WHEN o.outcome_obs = 'Unknown' THEN 9
      ELSE NULL
    END AS "Outcome",
    o.onset_obs       AS "DateOfonset",
    o.symptoms_obs    AS "Clinical symptoms",
    o.rash_date_obs   AS "Date of Onset of rash",
    o.rash_type_obs   AS "Type of Rash",
    o.rash_other_obs  AS "If Other, specify",
    o.home_visit_obs  AS "Was home of patient visited for contact investigation",
    o.visit_date_obs  AS "If yes, date of visit",
    o.case_line_obs   AS "Is this a Case or a Line List",
    CASE WHEN LOWER(TRIM(o.case_line_obs)) LIKE 'line%' THEN 'Line List' ELSE 'Case' END AS "RecordType",
    o.vaccinated_obs  AS "Was patient vaccinated against illness",
    CASE WHEN o.doses_obs ~ '^[0-9]+$' THEN o.doses_obs::int ELSE NULL END AS "NumberOfVaccinedoses",
    o.mr30_obs        AS "MR vaccination given in last 30 days prior to onset of illness",
    o.last_vacc_obs   AS "DateOfLastvaccination",
    o.specimen_obs    AS "Specimen collected",
    o.spec_date_obs   AS "DateSpecimencollected",
    o.other_spec_obs  AS "Were other specimen types collected",
    o.other_spec_type_obs AS "If yes, specify other specimen type",
    o.other_spec_date_obs AS "Date of other specimen type collection",
    o.spec_sent_obs   AS "DateSpecimenSenttolab",
    o.lab_id_obs      AS "Lab ID No",
    o.spec_recv_obs   AS "DateLabReceivedSpecimen",
    CASE
      WHEN LOWER(o.spec_cond_obs) = 'adequate'                       THEN 1
      WHEN LOWER(o.spec_cond_obs) IN ('not adequate','inadequate')    THEN 2
      ELSE NULL
    END AS "SpecimenCondition",
    CASE LOWER(o.measles_igm_obs)
      WHEN 'positive'      THEN 1
      WHEN 'negative'      THEN 2
      WHEN 'indeterminate' THEN 3
      WHEN 'not done'      THEN 4
      WHEN 'pending'       THEN 5
      WHEN 'unknown'       THEN 9
      ELSE NULL
    END AS "MeaslesIgm",
    CASE LOWER(o.rubella_igm_obs)
      WHEN 'positive'      THEN 1
      WHEN 'negative'      THEN 2
      WHEN 'indeterminate' THEN 3
      WHEN 'not done'      THEN 4
      WHEN 'pending'       THEN 5
      WHEN 'unknown'       THEN 9
      ELSE NULL
    END AS "RubellaIgm",
    o.results_epi_obs   AS "Date lab sent out results to EPI Surv Unit",
    o.sent_regional_obs AS "Date Serum specimen was sent to regional lab for IgM confirmation",
    CASE
      WHEN LOWER(o.final_class_obs) LIKE '%confirmed by lab%'   THEN 1
      WHEN LOWER(o.final_class_obs) LIKE '%epi link%'           THEN 2
      WHEN LOWER(o.final_class_obs) LIKE '%compatible%'         THEN 3
      WHEN LOWER(o.final_class_obs) LIKE '%discarded%'          THEN 4
      WHEN TRIM(LOWER(o.final_class_obs)) = 'pending'           THEN 5
      WHEN LOWER(o.measles_igm_obs) = 'negative'                THEN 4
      WHEN LOWER(o.measles_igm_obs) = 'positive'                THEN 1
      WHEN LOWER(o.measles_igm_obs) IN ('indeterminate','inconclusive') THEN 3
      WHEN LOWER(o.final_class_obs) LIKE '%pending%'            THEN 5
      ELSE NULL
    END AS "FinalClassification",
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(o.county_obs, '')), '\s+', ' ', 'g'))    AS county_rls,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(o.subcounty_obs, '')), '\s+', ' ', 'g')) AS subcounty_rls
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg pi ON pi.id = p.id AND pi.system LIKE 'measles-%'
  LEFT JOIN o ON o.patient_id = p.id
  LEFT JOIN epid_identifier ei ON ei.patient_id = p.id
  LEFT JOIN submit_dates sd ON sd.patient_id = p.id
  WHERE p.active IS DISTINCT FROM false
)

SELECT
  county_rls,
  subcounty_rls,
  "Lab ID No",
  "Age at Onset",
  "ReportingCounty",
  "Reporter Name",
  "Reporter Role",
  "MR vaccination given in last 30 days prior to onset of illness",
  TO_CHAR(nphiis.to_date_safe("Date Serum specimen was sent to regional lab for IgM confirmation"), 'DD/MM/YYYY') AS "Date Serum specimen was sent to regional lab for IgM confirmation",
  TO_CHAR(nphiis.to_date_safe("Date lab sent out results to EPI Surv Unit"), 'DD/MM/YYYY') AS "Date lab sent out results to EPI Surv Unit",
  "Is this a Case or a Line List",
  "RecordType",
  "Was home of patient visited for contact investigation",
  "If yes, specify other specimen type",
  TO_CHAR(nphiis.to_date_safe("Date of other specimen type collection"), 'DD/MM/YYYY') AS "Date of other specimen type collection",
  "Telephone No of parent or guardian",
  TO_CHAR(nphiis.to_date_safe("If yes, date of visit"), 'DD/MM/YYYY') AS "If yes, date of visit",
  TO_CHAR(nphiis.to_date_safe("Date of Onset of rash"), 'DD/MM/YYYY') AS "Date of Onset of rash",
  "Street Plot Estate S location",
  "Was patient vaccinated against illness",
  "Were other specimen types collected",
  "Type of health facility",
  "If Other, specify",
  TO_CHAR(nphiis.to_date_safe("Date of Admission"), 'DD/MM/YYYY') AS "Date of Admission",
  "Parent Guardian Name",
  "IP OP No",
  "Neighborhood major landmark",
  "Type of Rash",
  "Residence or Village",
  "Clinical symptoms",
  "Residence Ward",
  "Specimen collected",
  "Days",
  "Outcome",
  "Sex",
  "Ward",
  patient_id,
  "DistrictofResidence",
  "ProvinceOfResidence",
  "ReportingHealthfacility",
  "IDNumber",
  "NamesOfPatient",
  TO_CHAR("DateOfBirth", 'DD/MM/YYYY') AS "DateOfBirth",
  "AgeInyears",
  "AgeInmonths",
  "PatientsResidence",
  TO_CHAR("DateSeenHealthFacility", 'DD/MM/YYYY') AS "DateSeenHealthFacility",
  "Inoutpatient",
  TO_CHAR(nphiis.to_date_safe("DateOfonset"), 'DD/MM/YYYY') AS "DateOfonset",
  "NumberOfVaccinedoses",
  TO_CHAR(nphiis.to_date_safe("DateOfLastvaccination"), 'DD/MM/YYYY') AS "DateOfLastvaccination",
  TO_CHAR(nphiis.to_date_safe("DateSpecimencollected"), 'DD/MM/YYYY') AS "DateSpecimencollected",
  TO_CHAR(nphiis.to_date_safe("DateSpecimenSenttolab"), 'DD/MM/YYYY') AS "DateSpecimenSenttolab",
  TO_CHAR(nphiis.to_date_safe("DateLabReceivedSpecimen"), 'DD/MM/YYYY') AS "DateLabReceivedSpecimen",
  "SpecimenCondition",
  "MeaslesIgm",
  "RubellaIgm",
  "FinalClassification",
  CASE
    WHEN "FinalClassification" = 1 THEN 'Confirmed by lab'
    WHEN "FinalClassification" = 2 THEN 'Epi-linked'
    WHEN "FinalClassification" = 3 THEN 'Compatible'
    WHEN "FinalClassification" = 4 THEN 'Discarded'
    ELSE 'Pending lab results'
  END AS "CaseClassification",
  "CountryCode",
  "ReportingDistrict",
  TO_CHAR("DateDistrictRecLabResults", 'DD/MM/YYYY') AS "DateDistrictRecLabResults",
  "Urbanrural",
  TO_CHAR("DateHealthfacilitynotified", 'DD/MM/YYYY') AS "DateHealthfacilitynotified",
  TO_CHAR("DateLabSentResulttodistrict", 'DD/MM/YYYY') AS "DateLabSentResulttodistrict",
  TO_CHAR("DateReceivedNatlevel", 'DD/MM/YYYY') AS "DateReceivedNatlevel",
  TO_CHAR("DateRecformdistrict", 'DD/MM/YYYY') AS "DateRecformdistrict",
  TO_CHAR("DateSentFormtodistrict", 'DD/MM/YYYY') AS "DateSentFormtodistrict",
  "SubmittedDate",
  TO_CHAR("SubmittedDate", 'DD/MM/YYYY') AS "Date Submitted"
FROM base

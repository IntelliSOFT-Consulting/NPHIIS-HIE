-- Measles Cases by Age Group and Vaccine Doses on Postgres. Port of Measles_ByAge_VaxDoses (id 114).
{% set roles = current_user_roles() %}

WITH measles_patients AS (
  SELECT DISTINCT p.id AS patient_id,
    nphiis.to_date_safe(p.birth_date) AS birth_date,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(p.address_city,'')),'\s+',' ','g'))  AS county,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(p.address_state,'')),'\s+',' ','g')) AS subcounty
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE i.system LIKE 'measles-%'
),
dose_observations AS (
  SELECT
    o.patient_id,
    NULLIF(o.last_updated,'')::date AS report_date,
    COALESCE(
      nphiis.to_int_safe(o.value_quantity),
      nphiis.to_int_safe(o.value_integer),
      NULLIF(REGEXP_REPLACE(COALESCE(NULLIF(o.value_string,''),''), '[^0-9]', '', 'g'), '')::int,
      NULLIF(REGEXP_REPLACE(LOWER(COALESCE(NULLIF(o.value_cc_display,''), NULLIF(o.value_cc_text,''))),'[^0-9]','','g'), '')::int
    ) AS dose_count
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM measles_patients)
    AND o.code = '886125589225'
),
per_patient AS (
  SELECT
    mp.patient_id,
    mp.birth_date,
    COALESCE(NULLIF(mp.county,''),    'UNKNOWN') AS county,
    COALESCE(NULLIF(mp.subcounty,''), 'UNKNOWN') AS subcounty,
    MAX(d.dose_count) AS best_dose,
    COALESCE(MAX(d.report_date), CURRENT_DATE) AS ref_date
  FROM measles_patients mp
  LEFT JOIN dose_observations d ON d.patient_id = mp.patient_id
  GROUP BY mp.patient_id, mp.birth_date, mp.county, mp.subcounty
),
age_bucketed AS (
  SELECT patient_id, county, subcounty, birth_date, ref_date,
    CASE
      WHEN birth_date IS NOT NULL
        THEN FLOOR(nphiis.months_between(ref_date, birth_date) / 12)
      ELSE NULL
    END AS age_years,
    best_dose
  FROM per_patient
),
classified AS (
  SELECT patient_id, county, subcounty,
    CASE
      WHEN age_years IS NULL           THEN 'z) Unknown Age'
      WHEN age_years < 1               THEN 'a) <1 Yr'
      WHEN age_years BETWEEN 1 AND 4   THEN 'b) 1-4 Yrs'
      WHEN age_years BETWEEN 5 AND 9   THEN 'c) 5-9 Yrs'
      WHEN age_years BETWEEN 10 AND 14 THEN 'd) 10-14 Yrs'
      ELSE 'e) 15+ Yrs'
    END AS age_group,
    CASE
      WHEN best_dose IS NULL THEN 'a) Unknown'
      WHEN best_dose = 0     THEN 'b) Zero Dose'
      WHEN best_dose = 1     THEN 'c) 1 Dose'
      WHEN best_dose >= 2    THEN 'd) >=2 Doses'
      ELSE 'a) Unknown'
    END AS dose_bucket
  FROM age_bucketed
),
bucket_agg AS (
  SELECT county, subcounty, age_group, dose_bucket, COUNT(*) AS cases
  FROM classified GROUP BY county, subcounty, age_group, dose_bucket
),
with_totals AS (
  SELECT county, subcounty, age_group, dose_bucket, cases,
    SUM(cases) OVER (PARTITION BY county, subcounty, age_group) AS row_total
  FROM bucket_agg
)

SELECT
  county AS county_rls,
  county,
  subcounty,
  age_group,
  dose_bucket,
  cases,
  row_total,
  CAST(cases AS DOUBLE PRECISION) / NULLIF(row_total, 0)         AS pct,
  (CAST(cases AS DOUBLE PRECISION) / NULLIF(row_total, 0)) * 100 AS pct100
FROM with_totals
WHERE '{{ "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER" in roles }}' = 'False'
ORDER BY
  county, subcounty,
  CASE SUBSTRING(age_group, 1, 1) WHEN 'a' THEN 1 WHEN 'b' THEN 2 WHEN 'c' THEN 3 WHEN 'd' THEN 4 WHEN 'e' THEN 5 WHEN 'z' THEN 99 ELSE 98 END,
  CASE SUBSTRING(dose_bucket, 1, 1) WHEN 'a' THEN 1 WHEN 'b' THEN 2 WHEN 'c' THEN 3 WHEN 'd' THEN 4 ELSE 99 END

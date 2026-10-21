-- Measles Vaccination Status by County on Postgres. Port of Measles_VaxStatus_ByCounty_Pct (id 100).
{% set roles = current_user_roles() %}

WITH measles_patients AS (
  SELECT DISTINCT p.id AS patient_id,
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
    AND o.code = '886125589225'  -- numberOfVaccineDoses
),
per_patient AS (
  SELECT
    mp.patient_id,
    COALESCE(NULLIF(mp.county,''),    'UNKNOWN') AS county,
    COALESCE(NULLIF(mp.subcounty,''), 'UNKNOWN') AS subcounty,
    MAX(d.dose_count) AS best_dose
  FROM measles_patients mp
  LEFT JOIN dose_observations d ON d.patient_id = mp.patient_id
  GROUP BY mp.patient_id, mp.county, mp.subcounty
),
classified AS (
  SELECT patient_id, county, subcounty,
    CASE
      WHEN best_dose IS NULL THEN 'Unknown'
      WHEN best_dose = 0     THEN 'Zero Dose'
      WHEN best_dose = 1     THEN '1 Dose'
      WHEN best_dose >= 2    THEN '>= 2 Doses'
      ELSE 'Unknown'
    END AS dose_bucket
  FROM per_patient
),
bucket_agg AS (
  SELECT county, subcounty, dose_bucket, COUNT(*) AS cases
  FROM classified GROUP BY county, subcounty, dose_bucket
),
with_totals AS (
  SELECT county, subcounty, dose_bucket, cases,
    SUM(cases) OVER (PARTITION BY county, subcounty) AS row_total
  FROM bucket_agg
)

SELECT
  county AS county_rls,
  county,
  subcounty,
  dose_bucket,
  cases,
  row_total,
  CAST(cases AS DOUBLE PRECISION) / NULLIF(row_total, 0)         AS pct,
  (CAST(cases AS DOUBLE PRECISION) / NULLIF(row_total, 0)) * 100 AS pct100
FROM with_totals
WHERE '{{ "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER" in roles }}' = 'False'
ORDER BY
  county, subcounty,
  CASE dose_bucket WHEN 'Unknown' THEN 1 WHEN 'Zero Dose' THEN 2 WHEN '1 Dose' THEN 3 WHEN '>= 2 Doses' THEN 4 ELSE 99 END

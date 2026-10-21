-- Measles Epicurve (stacked by classification) on Postgres.
-- Port of MEASLES_Epicurve_WeeklyClass (id 105).
{% set roles = current_user_roles() %}

WITH measles_patients AS (
  SELECT DISTINCT p.id AS patient_id,
    NULLIF(p.address_city,'')  AS county,
    NULLIF(p.address_state,'') AS sub_county
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE i.system LIKE 'measles-case-information%'
),
measles_obs AS (
  SELECT
    o.patient_id,
    NULLIF(o.code,'') AS code,
    COALESCE(
      NULLIF(o.value_string,''),
      NULLIF(o.value_cc_text,''),
      NULLIF(o.value_cc_display,'')
    ) AS val,
    NULLIF(o.last_updated,'')::date AS obs_date
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM measles_patients)
),
pivot AS (
  SELECT
    m.patient_id,
    MAX(CASE
          WHEN m.code = '576528567552'  -- Date of Onset of rash
          THEN m.val
        END) AS onset_dt_str,
    MAX(CASE
          WHEN m.code IN ('finalClassification','final-classification')
          THEN m.val
        END) AS final_class_raw,
    MAX(CASE
          WHEN m.code IN ('measlesIgM','measles-igm')
          THEN m.val
        END) AS measles_igm_raw,
    MIN(m.obs_date) AS submit_date
  FROM measles_obs m
  GROUP BY m.patient_id
),
clean AS (
  SELECT
    mp.patient_id,
    nphiis.to_date_safe(onset_dt_str) AS onset_date,
    submit_date,
    CASE
      WHEN LOWER(final_class_raw) LIKE '%lab%'          THEN 'Lab Confirmed'
      WHEN LOWER(final_class_raw) LIKE '%epi%'          THEN 'Epi-Linked'
      WHEN LOWER(final_class_raw) LIKE '%compatible%'   THEN 'Compatible'
      WHEN LOWER(final_class_raw) LIKE '%discard%'      THEN 'Discarded'
      WHEN LOWER(measles_igm_raw) = 'positive'          THEN 'Lab Confirmed'
      WHEN LOWER(measles_igm_raw) = 'negative'          THEN 'Discarded'
      ELSE 'Pending'
    END AS classification_bucket
  FROM pivot mp
),
with_weeks AS (
  SELECT
    c.patient_id,
    c.classification_bucket,
    DATE_TRUNC('week', c.submit_date::timestamptz) AS week_start,
    COALESCE(NULLIF(mp.county,''), '(Blank)')     AS county,
    COALESCE(NULLIF(mp.sub_county,''), '(Blank)') AS sub_county,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(NULLIF(mp.county,''), '(Blank)')),'\s+',' ','g'))     AS county_rls,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(NULLIF(mp.sub_county,''), '(Blank)')),'\s+',' ','g')) AS subcounty_rls
  FROM clean c
  JOIN measles_patients mp ON mp.patient_id = c.patient_id
  WHERE c.submit_date IS NOT NULL
)

SELECT
  week_start,
  EXTRACT(WEEK FROM week_start)::int AS week_number,
  EXTRACT(YEAR FROM week_start)::int AS year,
  county,
  sub_county,
  county_rls,
  subcounty_rls,
  classification_bucket,
  COUNT(*) AS cases
FROM with_weeks
GROUP BY
  week_start, EXTRACT(WEEK FROM week_start), EXTRACT(YEAR FROM week_start),
  county, sub_county, county_rls, subcounty_rls,
  classification_bucket
ORDER BY week_start, classification_bucket

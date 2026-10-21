-- AFP Epi Weeks on Postgres. Port of afp_epi_weeks_virtual (id 95).
-- Jinja2 role check kept intact — Superset evaluates it at query time.
{% set roles = current_user_roles() %}

{% if 'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER' in roles %}

SELECT
  CAST(NULL AS TEXT)        AS county_rls,
  CAST(NULL AS TEXT)        AS county,
  CAST(NULL AS TIMESTAMPTZ) AS week_start,
  CAST(NULL AS TEXT)        AS epi_week_label,
  CAST(NULL AS TEXT)        AS week_range,
  CAST(NULL AS BIGINT)      AS cases
WHERE 1 = 0

{% else %}

WITH afp_patients AS (
  SELECT DISTINCT p.id AS patient_id,
    NULLIF(p.address_city, '')  AS county,
    NULLIF(p.address_state, '') AS sub_county,
    nphiis.to_date_safe(p.birth_date) AS birth_date
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false
    AND i.system LIKE 'afp-case-information%'
    AND i.system NOT LIKE 'afp-contact%'
),
afp_obs AS (
  SELECT
    o.patient_id,
    COALESCE(
      NULLIF(o.value_string,''),
      NULLIF(o.value_cc_text,''),
      NULLIF(o.value_cc_display,''),
      SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10),
      NULLIF(o.value_integer,'')
    ) AS observation_value,
    NULLIF(o.last_updated,'')::date AS obs_date
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM afp_patients)
    AND o.code IN (
      '728034137219',  -- onset date
      '426321975477',  -- notification date
      '502488184403'   -- investigation date (fallback)
    )
),
last_obs AS (
  SELECT patient_id, MAX(obs_date) AS last_obs_date
  FROM afp_obs GROUP BY patient_id
),
afp_pivot AS (
  SELECT
    patient_id,
    MAX(CASE WHEN code = '728034137219' THEN observation_value END) AS date_onset,
    MAX(CASE WHEN code = '426321975477' THEN observation_value END) AS date_first_seen
  FROM (
    SELECT o.patient_id, o.code,
           COALESCE(NULLIF(o.value_string,''), NULLIF(o.value_cc_text,''),
                    SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) AS observation_value
    FROM public.observation_flat_pg o
    WHERE o.patient_id IN (SELECT patient_id FROM afp_patients)
      AND o.code IN ('728034137219','426321975477')
  ) x GROUP BY patient_id
),
afp_base AS (
  SELECT
    ap.patient_id,
    ap.county,
    COALESCE(
      nphiis.to_date_safe(piv.date_onset),
      nphiis.to_date_safe(piv.date_first_seen),
      lo.last_obs_date
    ) AS report_date
  FROM afp_patients ap
  LEFT JOIN afp_pivot piv ON piv.patient_id = ap.patient_id
  LEFT JOIN last_obs  lo  ON lo.patient_id  = ap.patient_id
),
weekly AS (
  SELECT
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(county,'')),'\s+',' ','g')) AS county_rls,
    TRIM(COALESCE(county,'')) AS county,
    DATE_TRUNC('week', report_date) AS week_start,
    EXTRACT(YEAR FROM DATE_TRUNC('week', report_date))::int::text || '-W' ||
      LPAD(EXTRACT(WEEK FROM DATE_TRUNC('week', report_date))::int::text, 2, '0') AS epi_week_label,
    TO_CHAR(DATE_TRUNC('week', report_date), 'YYYY-MM-DD') || ' → ' ||
      TO_CHAR(DATE_TRUNC('week', report_date) + 6, 'YYYY-MM-DD') AS week_range
  FROM afp_base
  WHERE report_date IS NOT NULL
)

SELECT
  county_rls,
  county,
  week_start,
  epi_week_label,
  week_range,
  COUNT(*) AS cases
FROM weekly
GROUP BY county_rls, county, week_start, epi_week_label, week_range
ORDER BY county_rls, week_start

{% endif %}

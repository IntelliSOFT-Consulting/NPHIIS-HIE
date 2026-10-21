-- AFP Subcounty Surveillance Status on Postgres. Port of afp_subcounty_surveillance_status (id 103).
{% set roles = current_user_roles() %}

{% if 'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER' in roles %}

SELECT
  CAST(NULL AS TEXT)   AS county_rls,
  CAST(NULL AS TEXT)   AS county,
  CAST(NULL AS BIGINT) AS total_subcounties,
  CAST(NULL AS BIGINT) AS failed_both_cnt,
  CAST(NULL AS BIGINT) AS met_one_cnt,
  CAST(NULL AS BIGINT) AS met_both_cnt,
  CAST(NULL AS BIGINT) AS not_reported_cnt,
  CAST(NULL AS DOUBLE PRECISION) AS failed_both_pct,
  CAST(NULL AS DOUBLE PRECISION) AS met_one_pct,
  CAST(NULL AS DOUBLE PRECISION) AS met_both_pct,
  CAST(NULL AS DOUBLE PRECISION) AS not_reported_pct
WHERE 1 = 0

{% else %}

WITH afp_pat AS (
  SELECT DISTINCT p.id AS patient_id,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(p.address_city,'')),'\s+',' ','g'))  AS county,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(p.address_state,'')),'\s+',' ','g')) AS sub_county,
    nphiis.to_date_safe(p.birth_date) AS birth_date
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false
    AND i.system LIKE 'afp-case-information%'
    AND i.system NOT LIKE 'afp-contact%'
),
county_sc AS (
  SELECT county, sub_county
  FROM afp_pat
  WHERE NULLIF(county,'') IS NOT NULL AND NULLIF(sub_county,'') IS NOT NULL
  GROUP BY county, sub_county
),
denom AS (
  SELECT county, COUNT(*) AS total_subcounties FROM county_sc GROUP BY county
),
obs_pivot AS (
  SELECT
    o.patient_id,
    MAX(CASE WHEN o.code = '728034137219' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_onset,
    MAX(CASE WHEN o.code = '426321975477' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_notification,
    MAX(CASE WHEN o.code = '502488184403' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_investigation,
    MAX(CASE WHEN o.code = '737703942433' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS stool1_date,
    MAX(CASE WHEN o.code = '711388438654' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS stool2_date
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM afp_pat)
    AND NULLIF(o.last_updated,'')::date >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY o.patient_id
),
derived AS (
  SELECT
    ap.county, ap.sub_county, ap.birth_date,
    nphiis.to_date_safe(piv.date_onset)         AS onset_dt,
    nphiis.to_date_safe(piv.date_notification)  AS notification_dt,
    nphiis.to_date_safe(piv.date_investigation) AS investigation_dt,
    nphiis.to_date_safe(piv.stool1_date)        AS stool1_dt,
    nphiis.to_date_safe(piv.stool2_date)        AS stool2_dt,
    CASE
      WHEN ap.birth_date IS NULL
        OR COALESCE(nphiis.to_date_safe(piv.date_onset), nphiis.to_date_safe(piv.date_notification)) IS NULL THEN NULL
      ELSE FLOOR(nphiis.months_between(
             COALESCE(nphiis.to_date_safe(piv.date_onset), nphiis.to_date_safe(piv.date_notification)),
             ap.birth_date) / 12)
    END AS age_years,
    CASE
      WHEN piv.stool1_date IS NOT NULL AND piv.stool2_date IS NOT NULL
        AND ABS(nphiis.to_date_safe(piv.stool2_date) - nphiis.to_date_safe(piv.stool1_date)) >= 1
        AND piv.date_onset IS NOT NULL
        AND (nphiis.to_date_safe(piv.stool1_date) - nphiis.to_date_safe(piv.date_onset)) BETWEEN 0 AND 14
        AND (nphiis.to_date_safe(piv.stool2_date) - nphiis.to_date_safe(piv.date_onset)) BETWEEN 0 AND 14
      THEN 1 ELSE 0 END AS adequate_stool
  FROM afp_pat ap
  LEFT JOIN obs_pivot piv ON piv.patient_id = ap.patient_id
),
subcounty_perf AS (
  SELECT
    county, sub_county,
    COUNT(*)                                         AS cases_in_sc,
    AVG(adequate_stool) * 100.0                      AS stool_adequacy_pct,
    SUM(CASE WHEN age_years < 15 THEN 1 ELSE 0 END)  AS u15_cases
  FROM derived
  GROUP BY county, sub_county
),
subcounty_bucket AS (
  SELECT
    c.county, c.sub_county,
    COALESCE(sp.cases_in_sc, 0) AS cases_in_sc,
    CASE
      WHEN COALESCE(sp.cases_in_sc, 0) = 0 THEN 'Not Reported AFP Case'
      ELSE
        CASE
          WHEN COALESCE(sp.stool_adequacy_pct, 0) >= 80 AND COALESCE(sp.u15_cases, 0) >= 2 THEN 'Met both Indicators'
          WHEN COALESCE(sp.stool_adequacy_pct, 0) >= 80 OR  COALESCE(sp.u15_cases, 0) >= 2 THEN 'Met one Indicator'
          ELSE 'Failed both Indicators'
        END
    END AS bucket
  FROM county_sc c
  LEFT JOIN subcounty_perf sp ON sp.county = c.county AND sp.sub_county = c.sub_county
),
county_totals AS (
  SELECT county, bucket, COUNT(*) AS subcounties_in_bucket
  FROM subcounty_bucket GROUP BY county, bucket
)

SELECT
  d.county AS county_rls,
  d.county AS county,
  d.total_subcounties,
  COALESCE(SUM(CASE WHEN ct.bucket = 'Failed both Indicators'  THEN ct.subcounties_in_bucket END), 0) AS failed_both_cnt,
  COALESCE(SUM(CASE WHEN ct.bucket = 'Met one Indicator'       THEN ct.subcounties_in_bucket END), 0) AS met_one_cnt,
  COALESCE(SUM(CASE WHEN ct.bucket = 'Met both Indicators'     THEN ct.subcounties_in_bucket END), 0) AS met_both_cnt,
  COALESCE(SUM(CASE WHEN ct.bucket = 'Not Reported AFP Case'   THEN ct.subcounties_in_bucket END), 0) AS not_reported_cnt,
  ROUND(100.0 * COALESCE(SUM(CASE WHEN ct.bucket = 'Failed both Indicators' THEN ct.subcounties_in_bucket END),0) / d.total_subcounties, 1) AS failed_both_pct,
  ROUND(100.0 * COALESCE(SUM(CASE WHEN ct.bucket = 'Met one Indicator'      THEN ct.subcounties_in_bucket END),0) / d.total_subcounties, 1) AS met_one_pct,
  ROUND(100.0 * COALESCE(SUM(CASE WHEN ct.bucket = 'Met both Indicators'    THEN ct.subcounties_in_bucket END),0) / d.total_subcounties, 1) AS met_both_pct,
  ROUND(100.0 * COALESCE(SUM(CASE WHEN ct.bucket = 'Not Reported AFP Case'  THEN ct.subcounties_in_bucket END),0) / d.total_subcounties, 1) AS not_reported_pct
FROM denom d
LEFT JOIN county_totals ct ON ct.county = d.county
GROUP BY d.county, d.total_subcounties
ORDER BY county

{% endif %}

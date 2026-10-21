-- AFP Subcounty Line List on Postgres. Port of AFP_Subcounty_LineList_v1 (id 112).
WITH afp_patients AS (
  SELECT DISTINCT p.id AS patient_id,
    p.address_city  AS county,
    p.address_state AS sub_county,
    nphiis.to_date_safe(p.birth_date) AS birth_date
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false
    AND i.system ILIKE 'afp-case-information%'
    AND i.system NOT ILIKE 'afp-contact%'
),
obs_pivot AS (
  SELECT
    o.patient_id,
    MAX(CASE WHEN o.code = '728034137219' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_onset,
    MAX(CASE WHEN o.code = '426321975477' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_notification,
    MAX(CASE WHEN o.code = '502488184403' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_investigation,
    MAX(CASE WHEN o.code = '737703942433' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS stool1_date,
    MAX(CASE WHEN o.code = '711388438654' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS stool2_date,
    MAX(CASE WHEN o.code = '564450145870' THEN NULLIF(o.value_string,'') END) AS true_afp_flag
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM afp_patients)
  GROUP BY o.patient_id
),
last_obs AS (
  SELECT patient_id, MAX(NULLIF(last_updated,'')::date) AS last_obs_date
  FROM public.observation_flat_pg
  WHERE patient_id IN (SELECT patient_id FROM afp_patients)
  GROUP BY patient_id
),
cases AS (
  SELECT
    ap.patient_id, ap.county, ap.sub_county, ap.birth_date,
    nphiis.to_date_safe(piv.date_onset)         AS onset_dt,
    nphiis.to_date_safe(piv.date_notification)  AS notification_dt,
    nphiis.to_date_safe(piv.date_investigation) AS investigation_dt,
    nphiis.to_date_safe(piv.stool1_date)        AS stool1_dt,
    nphiis.to_date_safe(piv.stool2_date)        AS stool2_dt,
    COALESCE(
      nphiis.to_date_safe(piv.date_onset),
      nphiis.to_date_safe(piv.date_notification),
      lo.last_obs_date
    ) AS report_date,
    piv.true_afp_flag AS "True_AFP_flag"
  FROM afp_patients ap
  LEFT JOIN obs_pivot piv ON piv.patient_id = ap.patient_id
  LEFT JOIN last_obs  lo  ON lo.patient_id  = ap.patient_id
),
derived AS (
  SELECT c.*,
    CASE
      WHEN c.birth_date IS NULL OR c.report_date IS NULL THEN NULL
      ELSE FLOOR(nphiis.months_between(c.report_date, c.birth_date) / 12)
    END AS age_years,
    CASE
      WHEN c.stool1_dt IS NOT NULL AND c.stool2_dt IS NOT NULL
        AND ABS(c.stool2_dt - c.stool1_dt) >= 1
        AND c.onset_dt IS NOT NULL
        AND (c.stool1_dt - c.onset_dt) BETWEEN 0 AND 14
        AND (c.stool2_dt - c.onset_dt) BETWEEN 0 AND 14
      THEN 1 ELSE 0 END AS adequate_stool
  FROM cases c
)

SELECT
  d.county     AS county,
  d.sub_county AS subcounty,
  ROUND(SUM(CASE WHEN d.age_years < 15 THEN 1 ELSE 0 END) * 1.0, 2) AS "NPAFP Rate",
  CONCAT(ROUND(AVG(d.adequate_stool) * 100, 0)::text, '%') AS "Pct Stool Adequacy",
  CASE
    WHEN (AVG(d.adequate_stool) * 100) >= 80
     AND  SUM(CASE WHEN d.age_years < 15 THEN 1 ELSE 0 END) >= 2  THEN 'Met both Indicators'
    WHEN (AVG(d.adequate_stool) * 100) >= 80
      OR  SUM(CASE WHEN d.age_years < 15 THEN 1 ELSE 0 END) >= 2  THEN 'Met one Indicator'
    ELSE 'Failed both Indicators'
  END AS "Meets Surveillance Indicators_Grp"
FROM derived d
WHERE d.report_date IS NOT NULL
  AND d.report_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY d.county, d.sub_county
HAVING COUNT(*) > 0
ORDER BY county, subcounty

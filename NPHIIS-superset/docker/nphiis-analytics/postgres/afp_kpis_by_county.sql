-- AFP KPIs by County on Postgres. Port of afp_kpis_by_county_total_v1 (id 97).
-- Jinja2 role check kept intact.
{% set roles = current_user_roles() %}

{% if 'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER' in roles %}

SELECT
  CAST(NULL AS INT)    AS sort_key,
  CAST(NULL AS TEXT)   AS county_rls,
  CAST(NULL AS TEXT)   AS county,
  CAST(NULL AS INT)    AS is_total_row,
  CAST(NULL AS BIGINT) AS "Under 15yr pop",
  CAST(NULL AS DOUBLE PRECISION) AS "Expected AFP Cases",
  CAST(NULL AS BIGINT) AS "# AFP Cases Detected",
  CAST(NULL AS BIGINT) AS "Under 15 year AFP Cases Detected",
  CAST(NULL AS INT)    AS "# U15 NPAFP Cases",
  CAST(NULL AS DOUBLE PRECISION) AS "NPAFP rate",
  CAST(NULL AS DOUBLE PRECISION) AS "Stool Adequacy rate",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct NPENT",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct AFP detection system",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct within 7 days of onset_notification",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct Within 48hrs of notification and investigation",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct Timeliness of field activities",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct Timeliness of field and shipment activities"
WHERE 1 = 0

{% else %}

WITH afp_patients AS (
  SELECT DISTINCT p.id AS patient_id,
    NULLIF(p.address_city,'')  AS county,
    NULLIF(p.address_state,'') AS sub_county,
    nphiis.to_date_safe(p.birth_date) AS birth_date
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false
    AND i.system LIKE 'afp-case-information%'
    AND i.system NOT LIKE 'afp-contact%'
),
obs_pivot AS (
  SELECT
    o.patient_id,
    MAX(CASE WHEN o.code = '728034137219' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_onset,
    MAX(CASE WHEN o.code = '426321975477' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_notification,
    MAX(CASE WHEN o.code = '502488184403' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_investigation,
    MAX(CASE WHEN o.code = '737703942433' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS stool1_date,
    MAX(CASE WHEN o.code = '711388438654' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS stool2_date,
    MAX(CASE WHEN o.code = '808177332790' THEN COALESCE(NULLIF(o.value_string,''), SUBSTRING(NULLIF(o.value_datetime,'') FROM 1 FOR 10)) END) AS date_sent_to_lab,
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
    ap.patient_id,
    ap.county,
    ap.sub_county,
    ap.birth_date,
    nphiis.to_date_safe(piv.date_onset)         AS onset_dt,
    nphiis.to_date_safe(piv.date_notification)  AS notification_dt,
    nphiis.to_date_safe(piv.date_investigation) AS investigation_dt,
    nphiis.to_date_safe(piv.stool1_date)        AS stool1_dt,
    nphiis.to_date_safe(piv.stool2_date)        AS stool2_dt,
    nphiis.to_date_safe(piv.date_sent_to_lab)   AS shipment_dt,
    COALESCE(
      nphiis.to_date_safe(piv.date_onset),
      nphiis.to_date_safe(piv.date_notification),
      lo.last_obs_date
    ) AS report_date
  FROM afp_patients ap
  LEFT JOIN obs_pivot piv ON piv.patient_id = ap.patient_id
  LEFT JOIN last_obs  lo  ON lo.patient_id  = ap.patient_id
),
derived AS (
  SELECT
    c.*,
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
      THEN 1 ELSE 0 END AS adequate_stool,
    CASE WHEN c.onset_dt IS NOT NULL AND c.notification_dt IS NOT NULL
              AND (c.notification_dt - c.onset_dt) <= 7
         THEN 1 ELSE 0 END AS within7d_onset_to_notification,
    CASE WHEN c.notification_dt IS NOT NULL AND c.investigation_dt IS NOT NULL
              AND EXTRACT(EPOCH FROM (c.investigation_dt - c.notification_dt)) / 3600.0 <= 48
         THEN 1 ELSE 0 END AS within48h_notification_to_investigation,
    CASE
      WHEN c.onset_dt IS NOT NULL AND c.notification_dt IS NOT NULL
           AND (c.notification_dt - c.onset_dt) <= 7
       AND c.notification_dt IS NOT NULL AND c.investigation_dt IS NOT NULL
           AND EXTRACT(EPOCH FROM (c.investigation_dt - c.notification_dt)) / 3600.0 <= 48
      THEN 1 ELSE 0 END AS timely_field_activities,
    CASE
      WHEN c.onset_dt IS NOT NULL AND c.notification_dt IS NOT NULL
           AND (c.notification_dt - c.onset_dt) <= 7
       AND c.notification_dt IS NOT NULL AND c.investigation_dt IS NOT NULL
           AND EXTRACT(EPOCH FROM (c.investigation_dt - c.notification_dt)) / 3600.0 <= 48
       AND c.shipment_dt IS NOT NULL
      THEN 1 ELSE 0 END AS timely_field_and_shipment
  FROM cases c
),
county_kpis AS (
  SELECT
    d.county AS county_rls,
    d.county AS county,
    0        AS is_total_row,
    CAST(NULL AS BIGINT)  AS "Under 15yr pop",
    CAST(NULL AS DOUBLE PRECISION) AS "Expected AFP Cases",
    COUNT(*)              AS "# AFP Cases Detected",
    SUM(CASE WHEN d.age_years < 15 THEN 1 ELSE 0 END) AS "Under 15 year AFP Cases Detected",
    CAST(NULL AS INT)     AS "# U15 NPAFP Cases",
    CAST(NULL AS DOUBLE PRECISION) AS "NPAFP rate",
    ROUND(AVG(d.adequate_stool::numeric) * 100, 1) AS "Stool Adequacy rate",
    CAST(NULL AS DOUBLE PRECISION) AS "Pct NPENT",
    CAST(NULL AS DOUBLE PRECISION) AS "Pct AFP detection system",
    ROUND(AVG(d.within7d_onset_to_notification::numeric) * 100, 1)          AS "Pct within 7 days of onset_notification",
    ROUND(AVG(d.within48h_notification_to_investigation::numeric) * 100, 1) AS "Pct Within 48hrs of notification and investigation",
    ROUND(AVG(d.timely_field_activities::numeric) * 100, 1)                 AS "Pct Timeliness of field activities",
    ROUND(AVG(d.timely_field_and_shipment::numeric) * 100, 1)               AS "Pct Timeliness of field and shipment activities"
  FROM derived d
  WHERE d.report_date IS NOT NULL
  GROUP BY d.county
),
county_total_row AS (
  SELECT
    d.county AS county_rls,
    'Total'  AS county,
    1        AS is_total_row,
    CAST(NULL AS BIGINT)  AS "Under 15yr pop",
    CAST(NULL AS DOUBLE PRECISION) AS "Expected AFP Cases",
    COUNT(*)              AS "# AFP Cases Detected",
    SUM(CASE WHEN d.age_years < 15 THEN 1 ELSE 0 END) AS "Under 15 year AFP Cases Detected",
    CAST(NULL AS INT)     AS "# U15 NPAFP Cases",
    CAST(NULL AS DOUBLE PRECISION) AS "NPAFP rate",
    ROUND(AVG(d.adequate_stool::numeric) * 100, 1) AS "Stool Adequacy rate",
    CAST(NULL AS DOUBLE PRECISION) AS "Pct NPENT",
    CAST(NULL AS DOUBLE PRECISION) AS "Pct AFP detection system",
    ROUND(AVG(d.within7d_onset_to_notification::numeric) * 100, 1)          AS "Pct within 7 days of onset_notification",
    ROUND(AVG(d.within48h_notification_to_investigation::numeric) * 100, 1) AS "Pct Within 48hrs of notification and investigation",
    ROUND(AVG(d.timely_field_activities::numeric) * 100, 1)                 AS "Pct Timeliness of field activities",
    ROUND(AVG(d.timely_field_and_shipment::numeric) * 100, 1)               AS "Pct Timeliness of field and shipment activities"
  FROM derived d
  WHERE d.report_date IS NOT NULL
  GROUP BY d.county
)

SELECT 0 AS sort_key, county_kpis.* FROM county_kpis
UNION ALL
SELECT 1 AS sort_key, county_total_row.* FROM county_total_row

{% endif %}

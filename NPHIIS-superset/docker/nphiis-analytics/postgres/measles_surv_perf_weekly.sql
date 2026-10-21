-- Measles Surveillance Performance (Weekly) on Postgres.
-- Port of Measles_Surv_Perf_Weekly (id 99).
-- Jinja2 templates kept intact.
{% set roles = current_user_roles() %}
{% set u = user_location_info() %}
{% set county = (u.get("countyName") or u.get("county") or "") | trim %}
{% set county_uc = county | upper %}

{% if 'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER' in roles %}

SELECT
  CAST(NULL AS TEXT)   AS county_rls,
  CAST(NULL AS TEXT)   AS "EPID Number",
  CAST(NULL AS TEXT)   AS "Lab ID",
  CAST(NULL AS TEXT)   AS county,
  CAST(NULL AS TEXT)   AS sub_county,
  CAST(NULL AS TEXT)   AS ward,
  CAST(NULL AS TEXT)   AS "Health Facility",
  CAST(NULL AS TIMESTAMPTZ) AS report_week_start,
  CAST(NULL AS DOUBLE PRECISION) AS "SubCounty Pop",
  CAST(NULL AS BIGINT) AS "# Susp Meas Cases",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct Spec Collected",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct Results Available",
  CAST(NULL AS BIGINT) AS "Measles +ve",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct Measles IgM +ve",
  CAST(NULL AS BIGINT) AS "Rubella +ve",
  CAST(NULL AS BIGINT) AS "FC Confirmed Lab",
  CAST(NULL AS BIGINT) AS "FC Epilinked",
  CAST(NULL AS BIGINT) AS "FC Compatible",
  CAST(NULL AS BIGINT) AS "FC Total Meas Cases",
  CAST(NULL AS DOUBLE PRECISION) AS "Pct Subcounties with Invstd Case",
  CAST(NULL AS DOUBLE PRECISION) AS "Conf measles incidence",
  CAST(NULL AS DOUBLE PRECISION) AS "Non-measles febrile rash illness",
  CAST(NULL AS INT)    AS is_total_row
WHERE 1 = 0

{% else %}

WITH measles_patients AS (
  SELECT DISTINCT p.id AS patient_id,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(p.address_city,'')),'\s+',' ','g'))  AS county,
    TRIM(REGEXP_REPLACE(UPPER(COALESCE(p.address_state,'')),'\s+',' ','g')) AS sub_county
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false AND i.system LIKE 'measles-%'
),
obs_epid AS (
  SELECT i.id AS patient_id, NULLIF(i.value,'') AS epid_number
  FROM public.patient_identifier_pg i
  WHERE i.type_code = 'EPID'
    AND i.id IN (SELECT patient_id FROM measles_patients)
),
obs_lab_id AS (
  SELECT o.patient_id, MAX(NULLIF(o.value_string,'')) AS lab_id
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM measles_patients)
    AND o.code = 'labId'
  GROUP BY o.patient_id
),
obs_ward AS (
  SELECT o.patient_id,
    MAX(TRIM(REGEXP_REPLACE(UPPER(COALESCE(o.value_string,'')),'\s+',' ','g'))) AS ward
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM measles_patients)
    AND o.code IN ('819943434','819943434_county','819943434_sub_county','819943434_national')
  GROUP BY o.patient_id
),
obs_facility AS (
  SELECT o.patient_id,
    MAX(TRIM(REGEXP_REPLACE(UPPER(COALESCE(o.value_string,'')),'\s+',' ','g'))) AS facility
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM measles_patients)
    AND o.code IN ('819946803677','819946803677_county','819946803677_sub_county','819946803677_national')
  GROUP BY o.patient_id
),
measles_obs AS (
  SELECT
    o.patient_id,
    COALESCE(NULLIF(o.value_string,''), NULLIF(o.value_cc_text,''), NULLIF(o.value_cc_display,'')) AS val,
    NULLIF(o.last_updated,'')::date AS obs_date,
    o.code
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM measles_patients)
),
tagged AS (
  SELECT
    patient_id, obs_date,
    CASE WHEN code IN ('412689284625') THEN 1 ELSE 0 END AS flag_specimen_collected,
    CASE WHEN code IN ('measlesIgM','measles-igm','rubellaIgM','rubella-igm','specimenReceivedDate','date-specimen-received') THEN 1 ELSE 0 END AS flag_result_available,
    CASE WHEN code IN ('measlesIgM','measles-igm') AND LOWER(val) = 'positive' THEN 1 ELSE 0 END AS flag_measles_igm_pos,
    CASE WHEN code IN ('rubellaIgM','rubella-igm') AND LOWER(val) = 'positive' THEN 1 ELSE 0 END AS flag_rubella_pos,
    CASE
      WHEN code IN ('finalClassification','final-classification') AND LOWER(val) LIKE '%confirmed by lab%' THEN 'Lab Confirmed'
      WHEN code IN ('finalClassification','final-classification') AND LOWER(val) LIKE '%epi link%'        THEN 'Epi-Linked'
      WHEN code IN ('finalClassification','final-classification') AND LOWER(val) LIKE '%compatible%'      THEN 'Compatible'
      WHEN code IN ('finalClassification','final-classification') AND LOWER(val) LIKE '%discard%'         THEN 'Discarded'
      ELSE NULL
    END AS final_class
  FROM measles_obs
),
per_patient_week AS (
  SELECT
    mp.patient_id,
    oe.epid_number,
    ol.lab_id,
    mp.county,
    mp.sub_county,
    ow.ward,
    of2.facility,
    DATE_TRUNC('week', COALESCE(MAX(t.obs_date), CURRENT_DATE)::timestamptz) AS report_week_start,
    MAX(t.flag_specimen_collected) AS specimen_collected,
    MAX(t.flag_result_available)   AS result_available,
    MAX(t.flag_measles_igm_pos)    AS measles_igm_pos,
    MAX(t.flag_rubella_pos)        AS rubella_pos,
    MAX(CASE WHEN t.final_class = 'Lab Confirmed' THEN 1 ELSE 0 END) AS fc_lab,
    MAX(CASE WHEN t.final_class = 'Epi-Linked'    THEN 1 ELSE 0 END) AS fc_epi,
    MAX(CASE WHEN t.final_class = 'Compatible'    THEN 1 ELSE 0 END) AS fc_comp
  FROM measles_patients mp
  LEFT JOIN tagged t  ON t.patient_id = mp.patient_id
  LEFT JOIN obs_epid oe ON oe.patient_id = mp.patient_id
  LEFT JOIN obs_lab_id ol ON ol.patient_id = mp.patient_id
  LEFT JOIN obs_facility of2 ON of2.patient_id = mp.patient_id
  LEFT JOIN obs_ward ow ON ow.patient_id = mp.patient_id
  GROUP BY mp.patient_id, oe.epid_number, ol.lab_id, mp.county, mp.sub_county, ow.ward, of2.facility
),
subcounty_coverage AS (
  SELECT
    county, report_week_start,
    COUNT(DISTINCT sub_county)                                            AS n_subcounties_observed,
    COUNT(DISTINCT CASE WHEN specimen_collected = 1 THEN sub_county END) AS n_subcounties_investigated
  FROM per_patient_week
  GROUP BY county, report_week_start
),
kpi_base AS (
  SELECT
    ppw.epid_number, ppw.lab_id, ppw.county, ppw.sub_county, ppw.ward, ppw.facility,
    ppw.report_week_start,
    COUNT(*)                               AS susp_meas_cases,
    SUM(ppw.specimen_collected)            AS specimens_collected,
    SUM(ppw.result_available)              AS results_available,
    SUM(ppw.measles_igm_pos)               AS measles_pos,
    SUM(ppw.rubella_pos)                   AS rubella_pos,
    SUM(ppw.fc_lab)                        AS fc_confirmed_lab,
    SUM(ppw.fc_epi)                        AS fc_epilinked,
    SUM(ppw.fc_comp)                       AS fc_compatible,
    SUM(ppw.fc_lab + ppw.fc_epi + ppw.fc_comp) AS fc_total_meas_cases
  FROM per_patient_week ppw
  GROUP BY ppw.epid_number, ppw.lab_id, ppw.county, ppw.sub_county, ppw.ward, ppw.facility, ppw.report_week_start
),
base AS (
  SELECT
    k.epid_number, k.lab_id, k.county, k.sub_county, k.ward, k.facility,
    k.report_week_start,
    k.susp_meas_cases, k.specimens_collected, k.results_available,
    k.measles_pos, k.rubella_pos,
    k.fc_confirmed_lab, k.fc_epilinked, k.fc_compatible, k.fc_total_meas_cases,
    sc.n_subcounties_observed, sc.n_subcounties_investigated,
    CAST(NULL AS BIGINT) AS pop
  FROM kpi_base k
  LEFT JOIN subcounty_coverage sc ON sc.county = k.county AND sc.report_week_start = k.report_week_start
),
county_weekly_rows AS (
  SELECT
    county AS county_rls,
    epid_number AS "EPID Number",
    lab_id AS "Lab ID",
    county,
    sub_county,
    ward,
    facility AS "Health Facility",
    report_week_start,
    CAST(pop AS DOUBLE PRECISION) AS "SubCounty Pop",
    susp_meas_cases AS "# Susp Meas Cases",
    ROUND(CASE WHEN susp_meas_cases > 0 THEN (specimens_collected * 100.0) / susp_meas_cases END, 0) AS "Pct Spec Collected",
    ROUND(CASE WHEN specimens_collected > 0 THEN (results_available * 100.0) / specimens_collected END, 0) AS "Pct Results Available",
    measles_pos AS "Measles +ve",
    ROUND(CASE WHEN results_available > 0 THEN (measles_pos * 100.0) / results_available END, 0) AS "Pct Measles IgM +ve",
    rubella_pos AS "Rubella +ve",
    fc_confirmed_lab AS "FC Confirmed Lab",
    fc_epilinked AS "FC Epilinked",
    fc_compatible AS "FC Compatible",
    fc_total_meas_cases AS "FC Total Meas Cases",
    ROUND(CASE WHEN n_subcounties_observed > 0 THEN (n_subcounties_investigated * 100.0) / n_subcounties_observed END, 0) AS "Pct Subcounties with Invstd Case",
    ROUND(CASE WHEN pop IS NOT NULL AND pop > 0 THEN (fc_confirmed_lab * 100000.0) / pop END, 2) AS "Conf measles incidence",
    ROUND(CASE WHEN pop IS NOT NULL AND pop > 0 THEN ((susp_meas_cases - fc_total_meas_cases) * 100000.0) / pop END, 2) AS "Non-measles febrile rash illness",
    0 AS is_total_row
  FROM base
),
single_total_row AS (
  SELECT
    {% if county_uc == '' %}
      'TOTAL' AS county_rls,
    {% else %}
      '{{ county_uc }}' AS county_rls,
    {% endif %}
    CAST(NULL AS TEXT) AS "EPID Number",
    CAST(NULL AS TEXT) AS "Lab ID",
    'Total' AS county,
    CAST(NULL AS TEXT) AS sub_county,
    CAST(NULL AS TEXT) AS ward,
    CAST(NULL AS TEXT) AS "Health Facility",
    CAST(NULL AS TIMESTAMPTZ) AS report_week_start,
    SUM(CAST(pop AS DOUBLE PRECISION)) AS "SubCounty Pop",
    SUM(susp_meas_cases) AS "# Susp Meas Cases",
    ROUND(CASE WHEN SUM(susp_meas_cases) > 0 THEN (SUM(specimens_collected) * 100.0) / SUM(susp_meas_cases) END, 0) AS "Pct Spec Collected",
    ROUND(CASE WHEN SUM(specimens_collected) > 0 THEN (SUM(results_available) * 100.0) / SUM(specimens_collected) END, 0) AS "Pct Results Available",
    SUM(measles_pos) AS "Measles +ve",
    ROUND(CASE WHEN SUM(results_available) > 0 THEN (SUM(measles_pos) * 100.0) / SUM(results_available) END, 0) AS "Pct Measles IgM +ve",
    SUM(rubella_pos) AS "Rubella +ve",
    SUM(fc_confirmed_lab) AS "FC Confirmed Lab",
    SUM(fc_epilinked) AS "FC Epilinked",
    SUM(fc_compatible) AS "FC Compatible",
    SUM(fc_total_meas_cases) AS "FC Total Meas Cases",
    ROUND(CASE WHEN SUM(n_subcounties_observed) > 0 THEN (SUM(n_subcounties_investigated) * 100.0) / SUM(n_subcounties_observed) END, 0) AS "Pct Subcounties with Invstd Case",
    ROUND(CASE WHEN SUM(pop) > 0 THEN (SUM(fc_confirmed_lab) * 100000.0) / SUM(pop) END, 2) AS "Conf measles incidence",
    ROUND(CASE WHEN SUM(pop) > 0 THEN ((SUM(susp_meas_cases) - SUM(fc_total_meas_cases)) * 100000.0) / SUM(pop) END, 2) AS "Non-measles febrile rash illness",
    1 AS is_total_row
  FROM base
  {% if county_uc != '' %}
  WHERE UPPER(TRIM(county)) = '{{ county_uc }}'
  {% endif %}
)

SELECT * FROM county_weekly_rows
UNION ALL
SELECT * FROM single_total_row

{% endif %}

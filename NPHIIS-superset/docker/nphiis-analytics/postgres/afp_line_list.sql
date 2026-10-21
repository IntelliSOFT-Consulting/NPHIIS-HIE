-- AFP (Acute Flaccid Paralysis) detailed line list on Postgres.
-- Port of the afp_line_list Spark dataset (id 125). One row per AFP index case.
-- Keeps ALL column names identical to the Spark version so charts need no edits.
--
-- Translation notes vs Spark:
--   Patient.identifier LIKE '%afp-%'  -> JOIN patient_identifier_pg WHERE system LIKE 'afp-%'
--   p.name[0].given / family          -> p.given / p.family
--   p.birthDate                       -> p.birth_date
--   p.address[0].city/state           -> p.address_city / p.address_state  (via obs pivot)
--   CAST(p.identifier AS STRING) NOT LIKE '%afp-contact%'  -> identifier system filter
--   Specimen COLLECT_SET              -> STRING_AGG
--   WEEKOFYEAR / MONTH / YEAR         -> EXTRACT(...)
--   MONTHS_BETWEEN                    -> nphiis.months_between()
--   TO_DATE(val)                      -> nphiis.to_date_safe(val)
--   obs_flat filters only value_string IS NOT NULL (mirrors Spark behaviour)
WITH
-- ── 1. AFP index patients ────────────────────────────────────────────────────
afp AS (
  SELECT DISTINCT p.id AS patient_id
  FROM public.patient_flat_pg p
  JOIN public.patient_identifier_pg i ON i.id = p.id
  WHERE p.active IS DISTINCT FROM false
    AND i.system LIKE 'afp-%'
    AND i.system NOT LIKE 'afp-contact%'
),

-- ── 2. EPID from Patient.identifier (type_code = 'EPID') ────────────────────
epid_id AS (
  SELECT i.id AS patient_id, NULLIF(i.value, '') AS epid_number
  FROM public.patient_identifier_pg i
  WHERE i.type_code = 'EPID'
    AND i.id IN (SELECT patient_id FROM afp)
),

-- ── 3. Observations – latest value per (patient, code) ──────────────────────
obs_norm AS (
  SELECT
    o.patient_id,
    NULLIF(o.code, '')  AS code,
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
    NULLIF(o.issued, '')::timestamptz       AS issued,
    o.id AS obs_id
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (SELECT patient_id FROM afp)
    AND o.value_string IS NOT NULL        -- mirrors obs_flat: only value_string rows
),
obs_latest AS (
  SELECT patient_id, code, val FROM (
    SELECT patient_id, code, val,
           ROW_NUMBER() OVER (PARTITION BY patient_id, code
                              ORDER BY lu DESC NULLS LAST, issued DESC NULLS LAST, obs_id COLLATE "C") rn
    FROM obs_norm
  ) x WHERE rn = 1
),

-- ── 4. Pivot ─────────────────────────────────────────────────────────────────
o AS (
  SELECT patient_id,
    MAX(CASE WHEN code = 'EPID' THEN val END)  AS epid_obs,
    MAX(CASE WHEN code IN ('294367770999','294367770999_county','294367770999_sub_county','294367770999_national') THEN val END) AS rep_county,
    MAX(CASE WHEN code IN ('819946803642','819946803642_county','819946803642_sub_county','819946803642_national') THEN val END) AS rep_subcounty,
    MAX(CASE WHEN code IN ('819943434','819943434_county','819943434_sub_county','819943434_national')             THEN val END) AS rep_ward,
    MAX(CASE WHEN code IN ('819946803677','819946803677_county','819946803677_sub_county','819946803677_national') THEN val END) AS rep_facility,
    MAX(CASE WHEN code IN ('438862163919','438862163919_county','438862163919_sub_county','438862163919_national') THEN val END) AS rep_facility_type,
    MAX(CASE WHEN code = 'age-at-onset'  THEN val END) AS age_at_onset,
    MAX(CASE WHEN code = '492731638700'  THEN val END) AS age_years_raw,
    MAX(CASE WHEN code = '185726989867'  THEN val END) AS age_months_raw,
    MAX(CASE WHEN code = '828303331247'  THEN val END) AS age_days_raw,
    MAX(CASE WHEN code = '856448027666'  THEN val END) AS parent_name,
    MAX(CASE WHEN code = '576318206363'  THEN val END) AS parent_phone,
    MAX(CASE WHEN code = 'a4-county'         THEN val END) AS res_county,
    MAX(CASE WHEN code = 'a3-sub-county'     THEN val END) AS res_subcounty,
    MAX(CASE WHEN code = 'a2-ward'           THEN val END) AS res_ward,
    MAX(CASE WHEN code = 'residence-details' THEN val END) AS res_village,
    MAX(CASE WHEN code = '946232932304'      THEN val END) AS res_landmark,
    MAX(CASE WHEN code = '487686858194'      THEN val END) AS res_nearest_hf,
    MAX(CASE WHEN code = '110761799063'      THEN val END) AS res_town,
    MAX(CASE WHEN code = '502488184403' THEN val END) AS investigation_date,
    MAX(CASE WHEN code = '426321975477' THEN val END) AS notification_date,
    MAX(CASE WHEN code = '171292274939' THEN val END) AS notified_by,
    MAX(CASE WHEN code = '336643888536' THEN val END) AS admitted,
    MAX(CASE WHEN code = '507199621281' THEN val END) AS admission_date,
    MAX(CASE WHEN code = '525996604810' THEN val END) AS ip_op_no,
    MAX(CASE WHEN code = '728034137219' THEN val END) AS onset_date,
    MAX(CASE WHEN code = '932108244312' THEN val END) AS fever_at_onset,
    MAX(CASE WHEN code = '396371836778' THEN val END) AS sudden_onset,
    MAX(CASE WHEN code = '917680711879' THEN val END) AS progressive_lt_3days,
    MAX(CASE WHEN code = '776980947995' THEN val END) AS flaccid,
    MAX(CASE WHEN code = '679475123276' THEN val END) AS asymmetric,
    MAX(CASE WHEN code = '828001350323' THEN val END) AS site_of_paralysis,
    MAX(CASE WHEN code = '815911574910' THEN val END) AS site_of_paralysis_other,
    MAX(CASE WHEN code = '249388449455' THEN val END) AS limb_sensitive_to_pain,
    MAX(CASE WHEN code = '638592165160' THEN val END) AS injection_before_onset,
    MAX(CASE WHEN code = '701518392602' THEN val END) AS injection_site,
    MAX(CASE WHEN code = '564450145870' THEN val END) AS true_afp,
    MAX(CASE WHEN code = '212304573462' THEN val END) AS outcome,
    MAX(CASE WHEN code = '970455623029' THEN val END) AS vaccinated,
    MAX(CASE WHEN code = '886125589225' THEN val END) AS doses_raw,
    MAX(CASE WHEN code = '413372430071' THEN val END) AS opv_birth_date,
    MAX(CASE WHEN code = '671158128551' THEN val END) AS dose1_date,
    MAX(CASE WHEN code = '286826008175' THEN val END) AS dose2_date,
    MAX(CASE WHEN code = '705067672267' THEN val END) AS dose3_date,
    MAX(CASE WHEN code = '974686716540' THEN val END) AS dose4_date,
    MAX(CASE WHEN code = '597572769623' THEN val END) AS dose_last_date,
    MAX(CASE WHEN code = '610048088023' THEN val END) AS vacc_last_30days,
    MAX(CASE WHEN code = '960020813971' THEN val END) AS vacc_30days_interval,
    MAX(CASE WHEN code = '910678978959' THEN val END) AS sia_last_opv_date,
    MAX(CASE WHEN code = '774679982525' THEN val END) AS sia_opv_total,
    MAX(CASE WHEN code = '440401067645' THEN val END) AS ri_opv_total,
    MAX(CASE WHEN code = '799376740588' THEN val END) AS sia_ipv_total,
    MAX(CASE WHEN code = '999346763880' THEN val END) AS ri_ipv_total,
    MAX(CASE WHEN code = '766122504504' THEN val END) AS last_ipv_date,
    MAX(CASE WHEN code = '650080600932' THEN val END) AS ri_vacc_source,
    MAX(CASE WHEN code = '511517897367' THEN val END) AS immunocompromised,
    MAX(CASE WHEN code = '737703942433' THEN val END) AS spec1_date,
    MAX(CASE WHEN code = '711388438654' THEN val END) AS spec2_date,
    MAX(CASE WHEN code = '808177332790' THEN val END) AS spec_sent_national_date,
    MAX(CASE WHEN code = '8732404074721' THEN val END) AS lab_id,
    MAX(CASE WHEN code = '689825280680'  THEN val END) AS spec_received_national_date,
    MAX(CASE WHEN code = '482422649078'  THEN val END) AS spec_status_at_lab,
    MAX(CASE WHEN code = '87324040799'   THEN val END) AS spec_status_reasons,
    MAX(CASE WHEN code = '381386487834'  THEN val END) AS cell_culture_date,
    MAX(CASE WHEN code = '294651853506'  THEN val END) AS results_sent_epi_date,
    MAX(CASE WHEN code = '825243480539'  THEN val END) AS results_received_epi_date,
    MAX(CASE WHEN code = '314664353334'  THEN val END) AS cell_culture_result,
    MAX(CASE WHEN code = '664540760261'  THEN val END) AS sent_to_regional_date,
    MAX(CASE WHEN code = '722030957484'  THEN val END) AS itd_diff_sent_epi_date,
    MAX(CASE WHEN code = '227970871286'  THEN val END) AS itd_diff_received_epi_date,
    MAX(CASE WHEN code = '785896758719'  THEN val END) AS sequence_lab_name,
    MAX(CASE WHEN code = '449083966360'  THEN val END) AS final_spec_received_date,
    MAX(CASE WHEN code = '488660441709'  THEN val END) AS w1,
    MAX(CASE WHEN code = '304726305375'  THEN val END) AS w2,
    MAX(CASE WHEN code = '429298085556'  THEN val END) AS w3,
    MAX(CASE WHEN code = '603390896339'  THEN val END) AS sl1,
    MAX(CASE WHEN code = '637386699350'  THEN val END) AS sl2,
    MAX(CASE WHEN code = '642108278020'  THEN val END) AS sl3,
    MAX(CASE WHEN code = '993167573301'  THEN val END) AS vdpv1,
    MAX(CASE WHEN code = '887531494210'  THEN val END) AS vdpv2,
    MAX(CASE WHEN code = '873571107268'  THEN val END) AS vdpv3,
    MAX(CASE WHEN code = '259831634933'  THEN val END) AS npent_final,
    MAX(CASE WHEN code = '734480121751'  THEN val END) AS nev_final,
    MAX(CASE WHEN code = '884059764011'  THEN val END) AS isolate_sent_seq_date,
    MAX(CASE WHEN code = '112582142968'  THEN val END) AS final_seq_results_date,
    MAX(CASE WHEN code = '329949474707'  THEN val END) AS final_classification,
    MAX(CASE WHEN code = '605288347412'  THEN val END) AS vdpv_serotype,
    MAX(CASE WHEN code = '603703292281'  THEN val END) AS investigator_name,
    MAX(CASE WHEN code = '687763288866'  THEN val END) AS investigator_designation,
    MAX(CASE WHEN code = '185009111706'  THEN val END) AS investigator_unit,
    MAX(CASE WHEN code = '923170318537'  THEN val END) AS investigator_address,
    MAX(CASE WHEN code = '205898169162'  THEN val END) AS investigator_phone,
    MAX(CASE WHEN code = '309115311461'  THEN val END) AS itd_larm_received_date,
    MAX(CASE WHEN code = '450268834120'  THEN val END) AS itd_rarm_received_date,
    MAX(CASE WHEN code = '182061775266'  THEN val END) AS itd_isolate_source,
    MAX(CASE WHEN code = '559190044029'  THEN val END) AS itd_fta_card,
    MAX(CASE WHEN code = '147804391964'  THEN val END) AS itd_lab_id,
    MAX(CASE WHEN code = '379580967971'  THEN val END) AS itd_lab_name,
    MAX(CASE WHEN code = '555866549945'  THEN val END) AS itd_referring_lab_id,
    MAX(CASE WHEN code = '588753377451'  THEN val END) AS itd_referring_lab_name,
    MAX(CASE WHEN code = '604576595427'  THEN val END) AS itd_isolate_condition,
    MAX(CASE WHEN code = '899206340098'  THEN val END) AS itd_isolate_received_date,
    MAX(CASE WHEN code = '670564765735'  THEN val END) AS itd_rrt_pcr_itd,
    MAX(CASE WHEN code = '795171205431'  THEN val END) AS itd_rrt_pcr_vdpv,
    MAX(CASE WHEN code = '194632710244'  THEN val END) AS itd_nsl1,
    MAX(CASE WHEN code = '814898215847'  THEN val END) AS itd_nsl2,
    MAX(CASE WHEN code = '938956068345'  THEN val END) AS itd_nsl3,
    MAX(CASE WHEN code = '748636325943'  THEN val END) AS itd_sl1,
    MAX(CASE WHEN code = '869333548534'  THEN val END) AS itd_sl2,
    MAX(CASE WHEN code = '869333548501'  THEN val END) AS itd_sl3,
    MAX(CASE WHEN code = '316656745446'  THEN val END) AS itd_rrt_vdpv1,
    MAX(CASE WHEN code = '906760113640'  THEN val END) AS itd_rrt_vdpv2,
    MAX(CASE WHEN code = '579529262394'  THEN val END) AS itd_rrt_vdpv3,
    MAX(CASE WHEN code = '132333641777'  THEN val END) AS itd_npent,
    MAX(CASE WHEN code = '175266509822'  THEN val END) AS itd_nev,
    MAX(CASE WHEN code = '392363322139'  THEN val END) AS itd_final_combined,
    MAX(CASE WHEN code = '303783620410'  THEN val END) AS itd_mixture,
    MAX(CASE WHEN code = '491282170031'  THEN val END) AS itd_final_result_date,
    MAX(CASE WHEN code = '349581384607'  THEN val END) AS itd_results_sent_date,
    MAX(CASE WHEN code = '873179362660'  THEN val END) AS itd_isolate_sent_seq
  FROM obs_latest
  GROUP BY patient_id
),

-- ── 5. Specimen (stool) ──────────────────────────────────────────────────────
spec AS (
  SELECT
    s.patient_id,
    COUNT(*)                                                    AS specimen_resource_count,
    MAX(nphiis.to_date_safe(s.collected))                      AS first_specimen_date_resource,
    STRING_AGG(DISTINCT NULLIF(s.type_text, ''), ', ')         AS specimen_types
  FROM public.specimen_flat_pg s
  WHERE s.patient_id IN (SELECT patient_id FROM afp)
  GROUP BY s.patient_id
),

-- ── 6. Assemble base ─────────────────────────────────────────────────────────
base AS (
  SELECT
    p.id                                                           AS patient_id,
    'AFP'                                                          AS disease,
    'Kenya'                                                        AS country,
    COALESCE(o.epid_obs, ei.epid_number)                           AS epid_no,
    NULLIF(p.last_updated, '')::timestamptz                        AS record_last_updated,

    o.rep_county                                                   AS county,
    o.rep_subcounty                                                AS sub_county,
    o.rep_ward                                                     AS ward,
    o.rep_facility                                                 AS health_facility,
    o.rep_facility_type                                            AS facility_type,

    TRIM(COALESCE(p.given, '') || ' ' || COALESCE(p.family, ''))   AS patient_name,
    CASE WHEN LOWER(NULLIF(p.gender,'')) = 'male'   THEN 'M'
         WHEN LOWER(NULLIF(p.gender,'')) = 'female' THEN 'F' ELSE NULL END AS sex,
    NULLIF(p.gender, '')                                           AS sex_full,
    nphiis.to_date_safe(p.birth_date)                              AS date_of_birth,
    o.age_at_onset                                                 AS age_at_onset_text,
    nphiis.to_int_safe(o.age_years_raw)                            AS age_years,
    nphiis.to_int_safe(o.age_months_raw)                           AS age_months,
    nphiis.to_int_safe(o.age_days_raw)                             AS age_days,
    o.parent_name,
    o.parent_phone,

    o.res_county, o.res_subcounty, o.res_ward, o.res_village,
    o.res_landmark, o.res_nearest_hf, o.res_town,

    nphiis.to_date_safe(o.investigation_date)                      AS date_of_investigation,
    nphiis.to_date_safe(o.notification_date)                       AS date_of_notification,
    o.notified_by,
    o.admitted,
    nphiis.to_date_safe(o.admission_date)                          AS date_of_admission,
    o.ip_op_no,
    CASE WHEN o.admitted = 'Yes' THEN 1 WHEN o.admitted = 'No' THEN 2 ELSE NULL END AS in_out_patient,

    nphiis.to_date_safe(o.onset_date)                              AS date_of_onset,
    o.fever_at_onset, o.sudden_onset, o.progressive_lt_3days, o.flaccid, o.asymmetric,
    o.site_of_paralysis, o.site_of_paralysis_other, o.limb_sensitive_to_pain,
    o.injection_before_onset, o.injection_site,
    o.true_afp,
    o.outcome,
    CASE WHEN o.outcome = 'Alive'           THEN 1
         WHEN o.outcome = 'Dead'            THEN 2
         WHEN o.outcome = 'Still Hospitized' THEN 1
         ELSE 9 END                                                AS outcome_code,

    o.vaccinated,
    nphiis.to_int_safe(o.doses_raw)                                AS opv_doses,
    nphiis.to_date_safe(o.opv_birth_date)  AS opv_birth_date,
    nphiis.to_date_safe(o.dose1_date)      AS dose1_date,
    nphiis.to_date_safe(o.dose2_date)      AS dose2_date,
    nphiis.to_date_safe(o.dose3_date)      AS dose3_date,
    nphiis.to_date_safe(o.dose4_date)      AS dose4_date,
    nphiis.to_date_safe(o.dose_last_date)  AS dose_last_date,
    o.vacc_last_30days,
    nphiis.to_int_safe(o.vacc_30days_interval) AS vacc_30days_interval,
    nphiis.to_date_safe(o.sia_last_opv_date)   AS sia_last_opv_date,
    nphiis.to_int_safe(o.sia_opv_total)        AS sia_opv_total,
    nphiis.to_int_safe(o.ri_opv_total)         AS ri_opv_total,
    nphiis.to_int_safe(o.sia_ipv_total)        AS sia_ipv_total,
    nphiis.to_int_safe(o.ri_ipv_total)         AS ri_ipv_total,
    nphiis.to_date_safe(o.last_ipv_date)       AS last_ipv_date,
    o.ri_vacc_source,
    o.immunocompromised,

    nphiis.to_date_safe(o.spec1_date)                              AS stool1_date,
    nphiis.to_date_safe(o.spec2_date)                              AS stool2_date,
    nphiis.to_date_safe(o.spec_sent_national_date)                 AS stool_sent_national_date,
    sp.specimen_resource_count,
    sp.specimen_types,

    o.lab_id,
    nphiis.to_date_safe(o.spec_received_national_date)             AS stool_received_national_date,
    o.spec_status_at_lab,
    o.spec_status_reasons,
    nphiis.to_date_safe(o.cell_culture_date)                       AS cell_culture_date,
    nphiis.to_date_safe(o.results_sent_epi_date)                   AS results_sent_epi_date,
    nphiis.to_date_safe(o.results_received_epi_date)               AS results_received_epi_date,
    o.cell_culture_result,
    nphiis.to_date_safe(o.sent_to_regional_date)                   AS sent_to_regional_date,
    nphiis.to_date_safe(o.itd_diff_sent_epi_date)                  AS itd_diff_sent_epi_date,
    nphiis.to_date_safe(o.itd_diff_received_epi_date)              AS itd_diff_received_epi_date,

    o.sequence_lab_name,
    nphiis.to_date_safe(o.final_spec_received_date)                AS final_spec_received_date,
    o.w1, o.w2, o.w3, o.sl1, o.sl2, o.sl3, o.vdpv1, o.vdpv2, o.vdpv3,
    o.npent_final, o.nev_final,
    nphiis.to_date_safe(o.isolate_sent_seq_date)                   AS isolate_sent_seq_date,
    nphiis.to_date_safe(o.final_seq_results_date)                  AS final_seq_results_date,
    o.final_classification,
    o.vdpv_serotype,
    o.investigator_name, o.investigator_designation, o.investigator_unit,
    o.investigator_address, o.investigator_phone,

    nphiis.to_date_safe(o.itd_larm_received_date)                  AS itd_larm_received_date,
    nphiis.to_date_safe(o.itd_rarm_received_date)                  AS itd_rarm_received_date,
    o.itd_isolate_source, o.itd_fta_card, o.itd_lab_id, o.itd_lab_name,
    o.itd_referring_lab_id, o.itd_referring_lab_name, o.itd_isolate_condition,
    nphiis.to_date_safe(o.itd_isolate_received_date)               AS itd_isolate_received_date,
    o.itd_rrt_pcr_itd, o.itd_rrt_pcr_vdpv,
    o.itd_nsl1, o.itd_nsl2, o.itd_nsl3, o.itd_sl1, o.itd_sl2, o.itd_sl3,
    o.itd_rrt_vdpv1, o.itd_rrt_vdpv2, o.itd_rrt_vdpv3,
    o.itd_npent, o.itd_nev, o.itd_final_combined, o.itd_mixture,
    nphiis.to_date_safe(o.itd_final_result_date)                   AS itd_final_result_date,
    nphiis.to_date_safe(o.itd_results_sent_date)                   AS itd_results_sent_date,
    o.itd_isolate_sent_seq

  FROM public.patient_flat_pg p
  JOIN afp a ON a.patient_id = p.id
  LEFT JOIN o    ON o.patient_id  = p.id
  LEFT JOIN spec sp ON sp.patient_id = p.id
  LEFT JOIN epid_id ei ON ei.patient_id = p.id
  WHERE TRIM(COALESCE(p.given, '') || ' ' || COALESCE(p.family, '')) IS NOT NULL
    AND NOT (p.given = 'MOH-505')
),

-- ── 7. Derived analytics columns ─────────────────────────────────────────────
derived AS (
  SELECT
    b.*,

    COALESCE(
      CASE WHEN b.date_of_birth IS NOT NULL AND b.date_of_onset IS NOT NULL
           THEN CAST(FLOOR(nphiis.months_between(b.date_of_onset, b.date_of_birth)) AS INT) END,
      CASE WHEN b.age_years IS NOT NULL THEN b.age_years * 12 + COALESCE(b.age_months, 0) END,
      b.age_months
    )                                                             AS age_in_months_total,

    COALESCE(b.date_of_onset, b.date_of_notification,
             (NULLIF(b.record_last_updated::text,''))::date)      AS epi_date,
    EXTRACT(YEAR  FROM COALESCE(b.date_of_onset, b.date_of_notification,
             (NULLIF(b.record_last_updated::text,''))::date))::int AS epi_year,
    EXTRACT(WEEK  FROM COALESCE(b.date_of_onset, b.date_of_notification,
             (NULLIF(b.record_last_updated::text,''))::date))::int AS epi_week,
    EXTRACT(MONTH FROM COALESCE(b.date_of_onset, b.date_of_notification,
             (NULLIF(b.record_last_updated::text,''))::date))::int AS epi_month,

    COALESCE(b.opv_doses, CASE WHEN b.vaccinated = 'No' THEN 0 END) AS effective_opv_doses,

    (b.stool1_date - b.date_of_onset)                             AS days_onset_to_stool1,
    (b.stool2_date - b.date_of_onset)                             AS days_onset_to_stool2,
    (b.stool2_date - b.stool1_date)                               AS days_between_stools,
    (CASE WHEN b.stool1_date IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN b.stool2_date IS NOT NULL THEN 1 ELSE 0 END)     AS stool_specimen_count,

    (b.date_of_notification - b.date_of_onset)                    AS days_onset_to_notification,
    (b.date_of_investigation - b.date_of_notification)            AS days_notification_to_investigation,
    (b.date_of_investigation - b.date_of_onset)                   AS days_onset_to_investigation,
    (b.stool_sent_national_date - COALESCE(b.stool2_date, b.stool1_date)) AS days_collection_to_shipment,
    (b.stool_received_national_date - b.stool_sent_national_date)         AS days_shipment_to_lab,
    (b.results_sent_epi_date - b.stool_received_national_date)            AS lab_turnaround_days
  FROM base b
)

SELECT
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(county, '')), '\s+', ' ', 'g'))     AS county_rls,
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(sub_county, '')), '\s+', ' ', 'g')) AS subcounty_rls,

  d.*,

  CASE WHEN age_in_months_total < 180 THEN 1 ELSE 0 END              AS is_under_15,
  CASE WHEN age_in_months_total BETWEEN 6 AND 59 THEN 1 ELSE 0 END   AS is_6_59_months,
  CASE
    WHEN age_in_months_total IS NULL          THEN 'Unknown'
    WHEN age_in_months_total < 6              THEN '<6m'
    WHEN age_in_months_total < 60             THEN '6-59m'
    WHEN age_in_months_total < 120            THEN '5-9y'
    WHEN age_in_months_total < 180            THEN '10-14y'
    ELSE '15y+'
  END                                                                AS age_group,

  CASE
    WHEN effective_opv_doses IS NULL         THEN 'Unknown'
    WHEN effective_opv_doses = 0             THEN 'a) Zero Dose'
    WHEN effective_opv_doses BETWEEN 1 AND 2 THEN 'b) 1-2 Doses'
    ELSE 'c) 3+ Doses'
  END                                                                AS dose_category,

  CASE WHEN LOWER(spec_status_at_lab) = 'good' THEN 1
       WHEN LOWER(spec_status_at_lab) = 'bad'  THEN 0 ELSE NULL END  AS specimen_condition_good,
  CASE WHEN stool_specimen_count = 2
            AND days_between_stools >= 1
            AND days_onset_to_stool1 BETWEEN 0 AND 14
            AND days_onset_to_stool2 BETWEEN 0 AND 14
       THEN 1 ELSE 0 END                                             AS stool_adequate_collection,
  CASE WHEN stool_specimen_count = 2
            AND days_between_stools >= 1
            AND days_onset_to_stool1 BETWEEN 0 AND 14
            AND days_onset_to_stool2 BETWEEN 0 AND 14
            AND LOWER(spec_status_at_lab) = 'good'
       THEN 1 ELSE 0 END                                             AS is_stool_adequate,

  CASE
    WHEN final_classification = 'WPV'                         THEN 'WPV'
    WHEN final_classification IN ('cVDPV','aVDPV','iVDPV')    THEN 'VDPV'
    WHEN final_classification = 'Compatible'                  THEN 'Compatible'
    WHEN final_classification = 'Discarded'                   THEN 'Discarded'
    WHEN final_classification = 'Not an AFP' OR true_afp = 'No' THEN 'Not AFP'
    ELSE 'Pending Classification'
  END                                                                AS classification_category,
  CASE WHEN final_classification IS NOT NULL THEN 1 ELSE 0 END       AS has_final_classification,
  CASE WHEN final_classification = 'WPV' THEN 1 ELSE 0 END           AS is_wpv,
  CASE WHEN final_classification IN ('cVDPV','aVDPV','iVDPV') THEN 1 ELSE 0 END AS is_cvdpv,
  CASE WHEN final_classification = 'Compatible' THEN 1 ELSE 0 END    AS is_compatible,
  CASE WHEN final_classification = 'Discarded' THEN 1 ELSE 0 END     AS is_discarded,
  CASE WHEN final_classification = 'Not an AFP' OR true_afp = 'No' THEN 1 ELSE 0 END AS is_not_afp,
  CASE WHEN true_afp = 'Yes' THEN 1 ELSE 0 END                      AS is_true_afp,

  CASE WHEN final_classification IN ('WPV','cVDPV','aVDPV','iVDPV')
            OR w1 = 'Yes' OR w2 = 'Yes' OR w3 = 'Yes'
            OR vdpv1 = 'Positive' OR vdpv2 = 'Positive' OR vdpv3 = 'Positive'
       THEN 1 ELSE 0 END                                             AS is_confirmed_polio,

  CASE WHEN cell_culture_result IS NOT NULL OR final_classification IS NOT NULL
            OR npent_final IS NOT NULL OR itd_final_combined IS NOT NULL
       THEN 1 ELSE 0 END                                             AS has_lab_results,
  CASE WHEN stool_specimen_count > 0 AND cell_culture_result IS NULL
            AND final_classification IS NULL THEN 1 ELSE 0 END       AS is_pending_lab_results,

  CASE WHEN npent_final = 'Yes' OR itd_npent = 'Yes'
            OR cell_culture_result LIKE '%NPENT%' THEN 1 ELSE 0 END  AS is_npent,
  CASE WHEN nev_final = 'Yes' OR itd_nev = 'Yes' THEN 1 ELSE 0 END   AS is_nev,

  CASE WHEN final_classification IN ('WPV','cVDPV','aVDPV','iVDPV')
            OR w1 = 'Yes' OR w2 = 'Yes' OR w3 = 'Yes'
            OR vdpv1 = 'Positive' OR vdpv2 = 'Positive' OR vdpv3 = 'Positive'
       THEN 0 ELSE 1 END                                             AS is_npafp,

  CASE WHEN days_onset_to_notification BETWEEN 0 AND 7  THEN 1
       WHEN days_onset_to_notification IS NULL THEN NULL ELSE 0 END  AS notified_within_7days,
  CASE WHEN days_notification_to_investigation BETWEEN 0 AND 2 THEN 1
       WHEN days_notification_to_investigation IS NULL THEN NULL ELSE 0 END AS investigated_within_48hrs,
  CASE WHEN days_collection_to_shipment BETWEEN 0 AND 3 THEN 1
       WHEN days_collection_to_shipment IS NULL THEN NULL ELSE 0 END AS shipped_within_3days,
  CASE WHEN days_shipment_to_lab BETWEEN 0 AND 3 THEN 1
       WHEN days_shipment_to_lab IS NULL THEN NULL ELSE 0 END        AS specimen_arrived_within_3days,

  1                                                                  AS afp_case_count
FROM derived d

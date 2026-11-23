-- EVD Daily Snapshot on Postgres: one row per sub-county per reporting date.
--
-- The admin portal (Outbreak Response > EVD Daily Snapshot) saves each return as one standalone
-- FHIR QuestionnaireResponse for questionnaire
-- http://nphiis.health.go.ke/Questionnaire/evd-daily-snapshot, id evd-snapshot-<SUB-COUNTY>-<yyyymmdd>
-- (nphiis-admin src/lib/evd-snapshot.ts). The pipeline flattens it into
-- questionnaire_response_flat_pg and questionnaire_response_answer_pg; the answers are pivoted
-- here by linkId. Counts are whole numbers (the pipeline writes missing text as '', hence NULLIF).
-- authored is the FIRST submission time (kept when a return is edited); "Timely" means that
-- time was at or before 09:00 EAT on the reporting date.
-- Column names avoid plain three-word names and SQL keywords: Superset rejects those in
-- table charts as sub-queries.
WITH qr AS (
  SELECT f.id,
         NULLIF(f.authored, '')::timestamptz      AS authored,
         NULLIF(f.last_updated, '')::timestamptz  AS last_updated
  FROM public.questionnaire_response_flat_pg f
  WHERE f.questionnaire = 'http://nphiis.health.go.ke/Questionnaire/evd-daily-snapshot'
    AND f.status IS DISTINCT FROM 'entered-in-error'
),
a AS (
  SELECT x.id,
    MAX(CASE WHEN x.link_id = 'county'                    THEN regexp_replace(NULLIF(x.value_reference, ''), '^Location/', '') END) AS county_id,
    MAX(CASE WHEN x.link_id = 'sub-county'                THEN regexp_replace(NULLIF(x.value_reference, ''), '^Location/', '') END) AS subcounty_id,
    MAX(CASE WHEN x.link_id = 'reporting-date'            THEN NULLIF(x.value_date, '') END)     AS reporting_date,
    MAX(CASE WHEN x.link_id = 'focal-person'              THEN NULLIF(x.value_string, '') END)   AS focal_person,
    MAX(CASE WHEN x.link_id = 'phone'                     THEN NULLIF(x.value_string, '') END)   AS phone,
    MAX(CASE WHEN x.link_id = 'email'                     THEN NULLIF(x.value_string, '') END)   AS email,
    MAX(CASE WHEN x.link_id = 'challenges'                THEN NULLIF(x.value_string, '') END)   AS challenges,
    MAX(CASE WHEN x.link_id = 'a-alerts-received'         THEN nphiis.to_int_safe(x.value_integer) END) AS alerts_received,
    MAX(CASE WHEN x.link_id = 'a-suspected-cases'         THEN nphiis.to_int_safe(x.value_integer) END) AS suspected_cases,
    MAX(CASE WHEN x.link_id = 'a-alerts-verified'         THEN nphiis.to_int_safe(x.value_integer) END) AS alerts_verified,
    MAX(CASE WHEN x.link_id = 'a-cases-investigated'      THEN nphiis.to_int_safe(x.value_integer) END) AS cases_investigated,
    MAX(CASE WHEN x.link_id = 'a-cases-isolated'          THEN nphiis.to_int_safe(x.value_integer) END) AS cases_isolated,
    MAX(CASE WHEN x.link_id = 'a-specimens-shipped'       THEN nphiis.to_int_safe(x.value_integer) END) AS specimens_shipped,
    MAX(CASE WHEN x.link_id = 'a-lab-positive'            THEN nphiis.to_int_safe(x.value_integer) END) AS lab_positive,
    MAX(CASE WHEN x.link_id = 'a-lab-negative'            THEN nphiis.to_int_safe(x.value_integer) END) AS lab_negative,
    MAX(CASE WHEN x.link_id = 'a-lab-pending'             THEN nphiis.to_int_safe(x.value_integer) END) AS lab_pending,
    MAX(CASE WHEN x.link_id = 'b-new-contacts'            THEN nphiis.to_int_safe(x.value_integer) END) AS new_contacts,
    MAX(CASE WHEN x.link_id = 'b-contacts-due'            THEN nphiis.to_int_safe(x.value_integer) END) AS contacts_due,
    MAX(CASE WHEN x.link_id = 'b-contacts-followed-up'    THEN nphiis.to_int_safe(x.value_integer) END) AS contacts_followed_up,
    MAX(CASE WHEN x.link_id = 'b-contacts-lost'           THEN nphiis.to_int_safe(x.value_integer) END) AS contacts_lost,
    MAX(CASE WHEN x.link_id = 'b-contacts-symptomatic'    THEN nphiis.to_int_safe(x.value_integer) END) AS contacts_symptomatic,
    MAX(CASE WHEN x.link_id = 'b-contacts-completed-21d'  THEN nphiis.to_int_safe(x.value_integer) END) AS contacts_completed_21d,
    MAX(CASE WHEN x.link_id = 'b-travellers-screened'     THEN nphiis.to_int_safe(x.value_integer) END) AS travellers_screened,
    MAX(CASE WHEN x.link_id = 'b-travellers-referred'     THEN nphiis.to_int_safe(x.value_integer) END) AS travellers_referred
  FROM public.questionnaire_response_answer_pg x
  WHERE x.id IN (SELECT id FROM qr)
  GROUP BY x.id
)
SELECT
  qr.id                                                    AS "Snapshot ID",
  nphiis.to_date_safe(a.reporting_date)                    AS "Reporting Date",
  nphiis.to_date_safe(a.reporting_date) - 1                AS "Period Covered",
  DATE_TRUNC('week', nphiis.to_date_safe(a.reporting_date))::date AS "Epi Week",
  COALESCE(NULLIF(cl.name, ''), a.county_id)               AS "County",
  COALESCE(NULLIF(sl.name, ''), a.subcounty_id)            AS "Sub County",
  a.focal_person                                           AS "Focal Person",
  a.phone                                                  AS "Phone",
  a.email                                                  AS "Email",
  a.alerts_received                                        AS "Alerts Received",
  a.suspected_cases                                        AS "Suspected Cases",
  a.alerts_verified                                        AS "Alerts Verified",
  a.cases_investigated                                     AS "Cases Investigated",
  a.cases_isolated                                         AS "Cases Isolated",
  a.specimens_shipped                                      AS "Specimens Shipped",
  a.lab_positive                                           AS "Lab Positive",
  a.lab_negative                                           AS "Lab Negative",
  a.lab_pending                                            AS "Lab Pending",
  a.new_contacts                                           AS "New Contacts",
  a.contacts_due                                           AS "Contacts Due",
  a.contacts_followed_up                                   AS "Contacts Followed",
  a.contacts_lost                                          AS "Contacts Lost",
  a.contacts_symptomatic                                   AS "Contacts Symptomatic",
  a.contacts_completed_21d                                 AS "Contacts Completed",
  a.travellers_screened                                    AS "Travellers Screened",
  a.travellers_referred                                    AS "Travellers Referred",
  a.challenges                                             AS "Challenges",
  (qr.authored AT TIME ZONE 'Africa/Nairobi')              AS "Submitted At",
  (qr.last_updated AT TIME ZONE 'Africa/Nairobi')          AS "Last Edited",
  CASE WHEN qr.authored <= ((nphiis.to_date_safe(a.reporting_date)::timestamp + interval '9 hours') AT TIME ZONE 'Africa/Nairobi')
       THEN 'Yes' ELSE 'No' END                            AS "Timely",
  -- Area columns for row-level security, upper-case and single-spaced like the VHF datasets, so
  -- county and sub-county officers see only their own returns.
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(NULLIF(cl.name, ''), a.county_id, '')), '\s+', ' ', 'g'))    AS county_rls,
  TRIM(REGEXP_REPLACE(UPPER(COALESCE(NULLIF(sl.name, ''), a.subcounty_id, '')), '\s+', ' ', 'g')) AS subcounty_rls
FROM qr
JOIN a ON a.id = qr.id
LEFT JOIN public.location_flat_pg cl ON cl.id = a.county_id
LEFT JOIN public.location_flat_pg sl ON sl.id = a.subcounty_id

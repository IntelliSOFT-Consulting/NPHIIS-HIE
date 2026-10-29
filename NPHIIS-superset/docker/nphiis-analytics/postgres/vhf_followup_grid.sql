-- VHF contact follow-up grid on Postgres: one row per contact, Day 1 to Day 21 as columns, each
-- cell the finding of that day's follow-up visit. Built on vhf_contacts.sql (included below), so
-- it carries the same area and row-level-security columns.
--
-- Day N = follow-up date minus date of contact (the entered day when there is no date), as in
-- vhf_contacts.sql. A cell reads:
--   ✓ Well               seen, no symptoms
--   ⚠ Fever, Malaise     seen, symptomatic (the symptoms recorded)
--   ... · 38.6°C         morning/evening temperature, when taken
--   ... · Dead           contact status when it is not Alive
--   ... · Not found      what got in the way of the visit (challenges), when recorded
--   ✗ Missed             a day that has passed with no visit
--   (blank)              a day still to come
-- Column names are two words so Superset does not take them for sub-queries.
WITH contacts AS (
-- @include vhf_contacts.sql
),
visit_obs AS (
  SELECT e.part_of_id AS contact_encounter_id, e.id AS visit_id, o.code,
         COALESCE(NULLIF(o.value_string, ''), NULLIF(o.value_cc_text, ''), NULLIF(o.value_cc_display, ''),
                  NULLIF(o.value_integer, ''), NULLIF(o.value_boolean, ''), NULLIF(o.value_quantity, '')) AS val,
         ROW_NUMBER() OVER (PARTITION BY o.encounter_id, o.code
                            ORDER BY COALESCE(NULLIF(o.last_updated, ''), NULLIF(o.issued, ''))::timestamptz DESC NULLS LAST,
                                     o.id COLLATE "C") AS rn
  FROM public.observation_flat_pg o
  JOIN public.encounter_flat_pg e ON e.id = o.encounter_id AND e.part_of_id <> ''
  WHERE o.code IN ('vhf-follow-up-day', 'vhf-follow-up-date', 'vhf-follow-up-symptomatic', 'vhf-follow-up-symptoms',
                   'vhf-follow-up-symptoms-other', 'vhf-follow-up-temperature-am', 'vhf-follow-up-temperature-pm',
                   'vhf-follow-up-contact-status', 'vhf-follow-up-challenges')
),
visit AS (
  SELECT contact_encounter_id, visit_id,
         MAX(CASE WHEN code = 'vhf-follow-up-day' THEN val END) AS entered_day,
         MAX(CASE WHEN code = 'vhf-follow-up-date' THEN val END) AS fu_date,
         MAX(CASE WHEN code = 'vhf-follow-up-symptomatic' THEN val END) AS symptomatic,
         MAX(CASE WHEN code = 'vhf-follow-up-symptoms' THEN val END) AS symptoms,
         MAX(CASE WHEN code = 'vhf-follow-up-symptoms-other' THEN val END) AS symptoms_other,
         MAX(CASE WHEN code = 'vhf-follow-up-temperature-am' THEN val END) AS temp_am,
         MAX(CASE WHEN code = 'vhf-follow-up-temperature-pm' THEN val END) AS temp_pm,
         MAX(CASE WHEN code = 'vhf-follow-up-contact-status' THEN val END) AS contact_status,
         MAX(CASE WHEN code = 'vhf-follow-up-challenges' THEN val END) AS challenges
  FROM visit_obs
  WHERE rn = 1
  GROUP BY contact_encounter_id, visit_id
),
dated AS (
  SELECT v.*,
         COALESCE(nphiis.to_date_safe(substr(v.fu_date, 1, 10)) - c.contact_date, nphiis.to_int_safe(v.entered_day)) AS day,
         nphiis.to_date_safe(substr(v.fu_date, 1, 10)) AS visit_date
  FROM visit v
  JOIN contacts c ON c.encounter_id = v.contact_encounter_id
  WHERE v.entered_day IS NOT NULL OR v.fu_date IS NOT NULL
),
cells AS (
  -- One visit per contact and day: the latest by date.
  SELECT DISTINCT ON (contact_encounter_id, day)
         contact_encounter_id, day,
         CASE WHEN LOWER(symptomatic) = 'yes'
              THEN '⚠ ' || COALESCE(NULLIF(CONCAT_WS(', ', NULLIF(symptoms, ''), NULLIF(symptoms_other, '')), ''), 'Symptomatic')
              ELSE '✓ Well' END
         || COALESCE(' · ' || NULLIF(CONCAT_WS('/', NULLIF(temp_am, ''), NULLIF(temp_pm, '')), '') || '°C', '')
         || CASE WHEN NULLIF(contact_status, '') IS NOT NULL AND LOWER(contact_status) <> 'alive' THEN ' · ' || contact_status ELSE '' END
         || COALESCE(' · ' || NULLIF(challenges, ''), '') AS finding
  FROM dated
  WHERE day BETWEEN 1 AND 21
  ORDER BY contact_encounter_id, day, visit_date DESC NULLS LAST, visit_id COLLATE "C"
)
SELECT
  c.contact_id                                   AS "Contact ID",
  c.source_case                                  AS "Source Case",
  c.relationship                                 AS "Relationship",
  c.contact_date                                 AS "Contact Date",
  c.last_day                                     AS "Last Day",
  c.status                                       AS "Status",
  c.days_followed_up                             AS "Days Seen",
  c.days_expected                                AS "Days Due",
  c.county_name                                  AS "County",
  c.sub_county_name                              AS "Sub County",
  COALESCE(MAX(CASE WHEN v.day = 1 THEN v.finding END),
           CASE WHEN 1 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 1",
  COALESCE(MAX(CASE WHEN v.day = 2 THEN v.finding END),
           CASE WHEN 2 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 2",
  COALESCE(MAX(CASE WHEN v.day = 3 THEN v.finding END),
           CASE WHEN 3 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 3",
  COALESCE(MAX(CASE WHEN v.day = 4 THEN v.finding END),
           CASE WHEN 4 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 4",
  COALESCE(MAX(CASE WHEN v.day = 5 THEN v.finding END),
           CASE WHEN 5 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 5",
  COALESCE(MAX(CASE WHEN v.day = 6 THEN v.finding END),
           CASE WHEN 6 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 6",
  COALESCE(MAX(CASE WHEN v.day = 7 THEN v.finding END),
           CASE WHEN 7 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 7",
  COALESCE(MAX(CASE WHEN v.day = 8 THEN v.finding END),
           CASE WHEN 8 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 8",
  COALESCE(MAX(CASE WHEN v.day = 9 THEN v.finding END),
           CASE WHEN 9 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 9",
  COALESCE(MAX(CASE WHEN v.day = 10 THEN v.finding END),
           CASE WHEN 10 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 10",
  COALESCE(MAX(CASE WHEN v.day = 11 THEN v.finding END),
           CASE WHEN 11 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 11",
  COALESCE(MAX(CASE WHEN v.day = 12 THEN v.finding END),
           CASE WHEN 12 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 12",
  COALESCE(MAX(CASE WHEN v.day = 13 THEN v.finding END),
           CASE WHEN 13 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 13",
  COALESCE(MAX(CASE WHEN v.day = 14 THEN v.finding END),
           CASE WHEN 14 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 14",
  COALESCE(MAX(CASE WHEN v.day = 15 THEN v.finding END),
           CASE WHEN 15 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 15",
  COALESCE(MAX(CASE WHEN v.day = 16 THEN v.finding END),
           CASE WHEN 16 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 16",
  COALESCE(MAX(CASE WHEN v.day = 17 THEN v.finding END),
           CASE WHEN 17 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 17",
  COALESCE(MAX(CASE WHEN v.day = 18 THEN v.finding END),
           CASE WHEN 18 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 18",
  COALESCE(MAX(CASE WHEN v.day = 19 THEN v.finding END),
           CASE WHEN 19 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 19",
  COALESCE(MAX(CASE WHEN v.day = 20 THEN v.finding END),
           CASE WHEN 20 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 20",
  COALESCE(MAX(CASE WHEN v.day = 21 THEN v.finding END),
           CASE WHEN 21 <= c.days_expected AND c.status <> 'converted' THEN '✗ Missed' END) AS "Day 21",
  c.encounter_id, c.county_code, c.sub_county_code, c.facility_id, c.report_type, c.county_rls, c.subcounty_rls
FROM contacts c
LEFT JOIN cells v ON v.contact_encounter_id = c.encounter_id
GROUP BY c.encounter_id, c.contact_id, c.source_case, c.relationship, c.contact_date, c.last_day, c.status,
         c.days_followed_up, c.days_expected, c.county_name, c.sub_county_name, c.county_code, c.sub_county_code,
         c.facility_id, c.report_type, c.county_rls, c.subcounty_rls

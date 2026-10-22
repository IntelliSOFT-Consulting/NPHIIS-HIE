-- "vhf_contacts" on Postgres: one row per VHF contact with its 21-day follow up.
-- Port of ../datasets/vhf_contacts.sql (Spark). A contact is a VHF case record with a
-- "Contact Link to Case" answer (vhf-source-case-epid); answers are appended, so the latest
-- per question counts. The rules follow hie-auth (src/lib/vhf-contact-status.ts): day N =
-- follow-up date minus date of contact; lost = the last 3 days up to yesterday all missed.
-- A contact linked again by a newer case moves to it: the latest link (by issued time) is the
-- source case, its date of contact restarts the 21 days, and visits before it no longer count.
--
-- Area columns:
--   county_rls / subcounty_rls  upper-case names, matched by the Superset RLS rules
--   county_code / sub_county_code / facility_id / report_type
--                               the guest-token clauses of embedded dashboards
--                               (nphiis-admin src/lib/superset-rls.ts)
-- The area is the contact's residence; without one, the reporting facility's sub-county and
-- county (as the mobile importer does for the EPID).
WITH answers AS (
  SELECT o.encounter_id,
         o.code AS link_id,
         NULLIF(o.value_string, '') AS value,
         -- Ties on lastUpdated are common (a record re-saved at once): issued decides.
         -- Links get focus set later (lastUpdated moves), so the link captured last wins by issued.
         ROW_NUMBER() OVER (PARTITION BY o.encounter_id, o.code
                            ORDER BY CASE WHEN o.code = 'vhf-source-case-epid' THEN NULLIF(o.issued, '')::timestamptz END DESC NULLS LAST,
                                     COALESCE(NULLIF(o.last_updated, ''), NULLIF(o.issued, ''))::timestamptz DESC NULLS LAST,
                                     NULLIF(o.issued, '')::timestamptz DESC NULLS LAST, o.id COLLATE "C") AS rn
  FROM public.observation_flat_pg o
  WHERE o.code IN ('vhf-case-type', 'vhf-source-case-epid', 'vhf-contact-date', 'vhf-relationship',
                   'vhf-follow-up-day', 'vhf-follow-up-date', 'vhf-follow-up-symptomatic')
    AND o.encounter_id <> ''
),
latest AS (
  SELECT encounter_id,
         MAX(CASE WHEN link_id = 'vhf-case-type' THEN value END) AS case_type,
         MAX(CASE WHEN link_id = 'vhf-source-case-epid' THEN split_part(btrim(value), ' ', 1) END) AS source_case,
         MAX(CASE WHEN link_id = 'vhf-contact-date' THEN nphiis.to_date_safe(substr(value, 1, 10)) END) AS contact_date,
         MAX(CASE WHEN link_id = 'vhf-relationship' THEN value END) AS relationship,
         MAX(CASE WHEN link_id = 'vhf-follow-up-day' THEN nphiis.to_int_safe(value) END) AS entered_day,
         MAX(CASE WHEN link_id = 'vhf-follow-up-date' THEN nphiis.to_date_safe(substr(value, 1, 10)) END) AS follow_up_date,
         BOOL_OR(CASE WHEN link_id = 'vhf-follow-up-symptomatic' THEN lower(value) = 'yes' END) AS symptomatic
  FROM answers
  WHERE rn = 1
  GROUP BY encounter_id
),
places AS (
  SELECT l.id, upper(btrim(NULLIF(l.name, ''))) AS name, NULLIF(l.part_of_id, '') AS parent_id,
         MAX(NULLIF(t.code, '') COLLATE "C") AS type_code
  FROM public.location_flat_pg l
  LEFT JOIN public.location_type_pg t ON t.id = l.id
  GROUP BY l.id, l.name, l.part_of_id
),
contacts AS (
  SELECT l.encounter_id, l.case_type, l.source_case, l.contact_date, l.relationship,
         NULLIF(e.patient_id, '') AS patient_id,
         NULLIF(e.epid, '') AS epid,
         -- A moved contact keeps its earlier Contact ID (use old): take the one made from the source case.
         (SELECT i.value FROM public.patient_identifier_pg i
           WHERE i.id = e.patient_id AND i.system = 'http://hie.org/identifiers/CONTACT_ID' AND NULLIF(i.value, '') IS NOT NULL
           ORDER BY left(i.value, length(l.source_case) + 2) = l.source_case || '-C' DESC, i.value COLLATE "C" DESC
           LIMIT 1) AS contact_id,
         NULLIF(regexp_replace(e.managing_location_id, '^Location/', ''), '') AS facility_id
  FROM latest l
  JOIN public.encounter_flat_pg e ON e.id = l.encounter_id
  WHERE l.source_case IS NOT NULL AND e.part_of_id = ''
),
visits AS (
  SELECT e.part_of_id AS contact_encounter_id,
         COALESCE(l.follow_up_date - c.contact_date, l.entered_day) AS day,
         l.follow_up_date,
         COALESCE(l.symptomatic, false) AS symptomatic
  FROM public.encounter_flat_pg e
  JOIN latest l ON l.encounter_id = e.id
  JOIN contacts c ON c.encounter_id = e.part_of_id
  WHERE l.entered_day IS NOT NULL OR l.follow_up_date IS NOT NULL
),
per_contact AS (
  SELECT contact_encounter_id,
         COUNT(DISTINCT CASE WHEN day BETWEEN 1 AND 21 THEN day END) AS days_followed_up,
         MAX(CASE WHEN day BETWEEN 1 AND 21 THEN day END) AS last_day_followed_up,
         MAX(follow_up_date) AS last_follow_up_date,
         -- Visits before day 0 (under an earlier case) do not count.
         BOOL_OR(symptomatic AND day >= 0) AS ever_symptomatic,
         MIN(CASE WHEN symptomatic AND day >= 0 THEN day END) AS first_symptomatic_day
  FROM visits
  GROUP BY contact_encounter_id
),
located AS (
  SELECT c.*, NULLIF(p.gender, '') AS gender,
         upper(btrim(NULLIF(p.address_city, ''))) AS res_county,
         upper(btrim(NULLIF(p.address_state, ''))) AS res_subcounty
  FROM contacts c
  LEFT JOIN public.patient_flat_pg p ON p.id = c.patient_id
),
area_all AS (
  SELECT x.*,
         -- Residence: the sub-county Location (a county named as sub-county counts as the county).
         rs.id AS res_sub_id, COALESCE(rs.parent_id, rc.id) AS res_county_id,
         -- Reporting facility, walked up to its sub-county and county (facility < ward < sub-county < county).
         CASE WHEN f1.type_code = 'SUB-COUNTY' THEN f1.id WHEN f2.type_code = 'SUB-COUNTY' THEN f2.id END AS fac_sub_id,
         CASE WHEN f2.type_code = 'COUNTY' THEN f2.id WHEN f3.type_code = 'COUNTY' THEN f3.id END AS fac_county_id,
         -- One row per contact when a sub-county name is used in several counties.
         ROW_NUMBER() OVER (PARTITION BY x.encounter_id ORDER BY rs.id COLLATE "C" NULLS FIRST) AS rn
  FROM located x
  LEFT JOIN places cty ON cty.type_code = 'COUNTY' AND cty.name = x.res_county
  LEFT JOIN places rs ON rs.type_code = 'SUB-COUNTY' AND rs.name = x.res_subcounty
       AND (cty.id IS NULL OR rs.parent_id = cty.id)
  LEFT JOIN places rc ON rc.type_code = 'COUNTY' AND rs.id IS NULL
       AND rc.name = COALESCE(x.res_county, x.res_subcounty)
  LEFT JOIN places fac ON fac.id = x.facility_id
  LEFT JOIN places f1 ON f1.id = fac.parent_id
  LEFT JOIN places f2 ON f2.id = f1.parent_id
  LEFT JOIN places f3 ON f3.id = f2.parent_id
),
area AS (SELECT * FROM area_all WHERE rn = 1),
coded AS (
  SELECT a.*,
         CASE WHEN a.res_sub_id IS NOT NULL OR a.res_county_id IS NOT NULL THEN a.res_sub_id ELSE a.fac_sub_id END AS sub_county_code,
         CASE WHEN a.res_sub_id IS NOT NULL OR a.res_county_id IS NOT NULL THEN a.res_county_id ELSE a.fac_county_id END AS county_code,
         a.res_sub_id IS NULL AND a.res_county_id IS NULL AS area_from_facility
  FROM area a
)
SELECT c.encounter_id,
       c.contact_id,
       c.epid AS contact_epid,
       c.source_case,
       c.relationship,
       c.contact_date,
       c.contact_date + 21 AS last_day,
       c.county_code,
       c.sub_county_code,
       c.facility_id,
       'VHF_CONTACT' AS report_type,
       pc.name AS county_name,
       ps.name AS sub_county_name,
       TRIM(REGEXP_REPLACE(UPPER(COALESCE(pc.name, '')), '\s+', ' ', 'g')) AS county_rls,
       TRIM(REGEXP_REPLACE(UPPER(COALESCE(ps.name, '')), '\s+', ' ', 'g')) AS subcounty_rls,
       c.area_from_facility,
       c.gender,
       COALESCE(f.days_followed_up, 0) AS days_followed_up,
       -- Days 1-21 that have passed (today excluded), as hie-auth counts them.
       GREATEST(LEAST(CURRENT_DATE - c.contact_date - 1, 21), 0) AS days_expected,
       f.last_follow_up_date,
       COALESCE(f.last_follow_up_date >= CURRENT_DATE - 1, false) AS followed_up_last_24h,
       f.first_symptomatic_day,
       CASE
         WHEN lower(c.case_type) <> 'contact' THEN 'converted'
         WHEN COALESCE(f.ever_symptomatic, false) THEN 'flagged'
         WHEN CURRENT_DATE - c.contact_date > 21 THEN 'completed'
         -- Trailing missed days up to yesterday, as hie-auth counts them.
         WHEN LEAST(CURRENT_DATE - c.contact_date - 1, 21) - COALESCE(f.last_day_followed_up, 0) >= 3 THEN 'lost'
         ELSE 'active'
       END AS status,
       lower(c.case_type) <> 'contact' AS became_case
FROM coded c
LEFT JOIN per_contact f ON f.contact_encounter_id = c.encounter_id
LEFT JOIN places pc ON pc.id = c.county_code
LEFT JOIN places ps ON ps.id = c.sub_county_code

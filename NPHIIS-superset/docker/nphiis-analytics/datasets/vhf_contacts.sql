-- "vhf_contacts": one row per VHF contact with its 21-day follow up. refresh_tables.py builds it
-- into the Spark table nphiis_vhf_contacts (hourly); the Superset dataset reads that table.
-- Spark SQL over the fhir-data-pipes warehouse (observation, encounter, patient, location).
-- A contact is a VHF case record with a "Contact Link to Case" answer (vhf-source-case-epid);
-- answers are appended, so the latest per question counts. The rules follow hie-auth
-- (src/lib/vhf-contact-status.ts): day N = follow-up date minus date of contact; lost = the
-- last 3 days up to yesterday all missed.
--
-- Area columns:
--   county_rls / subcounty_rls  upper-case names, matched by the Superset RLS rules
--                               "VHF contacts - county / sub-county officers see own area"
--   county_code / sub_county_code / facility_id / report_type
--                               the guest-token clauses of embedded dashboards
--                               (nphiis-admin src/lib/superset-rls.ts)
-- The area is the contact's residence; without one, the reporting facility's sub-county and
-- county (as the mobile importer does for the EPID).
WITH answers AS (
  SELECT o.encounter.encounterId AS encounter_id,
         c.code AS link_id,
         o.value.string AS value,
         ROW_NUMBER() OVER (PARTITION BY o.encounter.encounterId, c.code
                            ORDER BY COALESCE(o.meta.lastUpdated, o.issued) DESC) AS rn
  FROM observation o LATERAL VIEW explode(o.code.coding) t AS c
  WHERE c.code IN ('vhf-case-type', 'vhf-source-case-epid', 'vhf-contact-date', 'vhf-relationship',
                   'vhf-follow-up-day', 'vhf-follow-up-date', 'vhf-follow-up-symptomatic')
),
latest AS (
  SELECT encounter_id,
         MAX(CASE WHEN link_id = 'vhf-case-type' THEN value END) AS case_type,
         MAX(CASE WHEN link_id = 'vhf-source-case-epid' THEN split(trim(value), ' ')[0] END) AS source_case,
         MAX(CASE WHEN link_id = 'vhf-contact-date' THEN to_date(substr(value, 1, 10)) END) AS contact_date,
         MAX(CASE WHEN link_id = 'vhf-relationship' THEN value END) AS relationship,
         MAX(CASE WHEN link_id = 'vhf-follow-up-day' THEN CAST(value AS INT) END) AS entered_day,
         MAX(CASE WHEN link_id = 'vhf-follow-up-date' THEN to_date(substr(value, 1, 10)) END) AS follow_up_date,
         MAX(CASE WHEN link_id = 'vhf-follow-up-symptomatic' THEN lower(value) = 'yes' END) AS symptomatic
  FROM answers
  WHERE rn = 1
  GROUP BY encounter_id
),
places AS (
  SELECT l.id, upper(trim(l.name)) AS name, l.partOf.locationId AS parent_id, MAX(t.code) AS type_code
  FROM location l LATERAL VIEW OUTER explode(l.type) x AS ty LATERAL VIEW OUTER explode(ty.coding) y AS t
  GROUP BY l.id, l.name, l.partOf.locationId
),
contacts AS (
  SELECT l.encounter_id, l.case_type, l.source_case, l.contact_date, l.relationship,
         e.subject.patientId AS patient_id,
         MAX(CASE WHEN i.system = 'http://hie.org/identifiers/EPID' THEN i.value END) AS epid,
         MAX(CASE WHEN tg.system LIKE '%encounter-managingLocation' THEN regexp_replace(tg.code, '^Location/', '') END) AS facility_id
  FROM latest l
  JOIN encounter e ON e.id = l.encounter_id
  LATERAL VIEW OUTER explode(e.identifier) t AS i
  LATERAL VIEW OUTER explode(e.meta.tag) g AS tg
  WHERE l.source_case IS NOT NULL AND e.partOf IS NULL
  GROUP BY l.encounter_id, l.case_type, l.source_case, l.contact_date, l.relationship, e.subject.patientId
),
visits AS (
  SELECT e.partOf.encounterId AS contact_encounter_id,
         COALESCE(datediff(l.follow_up_date, c.contact_date), l.entered_day) AS day,
         l.follow_up_date,
         COALESCE(l.symptomatic, false) AS symptomatic
  FROM encounter e
  JOIN latest l ON l.encounter_id = e.id
  JOIN contacts c ON c.encounter_id = e.partOf.encounterId
  WHERE l.entered_day IS NOT NULL OR l.follow_up_date IS NOT NULL
),
per_contact AS (
  SELECT contact_encounter_id,
         COUNT(DISTINCT CASE WHEN day BETWEEN 1 AND 21 THEN day END) AS days_followed_up,
         MAX(CASE WHEN day BETWEEN 1 AND 21 THEN day END) AS last_day_followed_up,
         MAX(follow_up_date) AS last_follow_up_date,
         MAX(symptomatic) AS ever_symptomatic,
         MIN(CASE WHEN symptomatic THEN day END) AS first_symptomatic_day
  FROM visits
  GROUP BY contact_encounter_id
),
located AS (
  SELECT c.*, p.gender,
         upper(trim(p.address[0].city)) AS res_county,
         upper(trim(p.address[0].state)) AS res_subcounty
  FROM contacts c
  LEFT JOIN patient p ON p.id = c.patient_id
),
area_all AS (
  SELECT x.*,
         -- Residence: the sub-county Location (a county named as sub-county counts as the county).
         rs.id AS res_sub_id, COALESCE(rs.parent_id, rc.id) AS res_county_id,
         -- Reporting facility, walked up to its sub-county and county (facility < ward < sub-county < county).
         CASE WHEN f1.type_code = 'SUB-COUNTY' THEN f1.id WHEN f2.type_code = 'SUB-COUNTY' THEN f2.id END AS fac_sub_id,
         CASE WHEN f2.type_code = 'COUNTY' THEN f2.id WHEN f3.type_code = 'COUNTY' THEN f3.id END AS fac_county_id,
         -- One row per contact when a sub-county name is used in several counties.
         ROW_NUMBER() OVER (PARTITION BY x.encounter_id ORDER BY rs.id) AS rn
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
       c.epid AS contact_epid,
       c.source_case,
       c.relationship,
       c.contact_date,
       date_add(c.contact_date, 21) AS last_day,
       c.county_code,
       c.sub_county_code,
       c.facility_id,
       'VHF_CONTACT' AS report_type,
       pc.name AS county_name,
       ps.name AS sub_county_name,
       TRIM(REGEXP_REPLACE(UPPER(COALESCE(pc.name, '')), '\\s+', ' ')) AS county_rls,
       TRIM(REGEXP_REPLACE(UPPER(COALESCE(ps.name, '')), '\\s+', ' ')) AS subcounty_rls,
       c.area_from_facility,
       c.gender,
       COALESCE(f.days_followed_up, 0) AS days_followed_up,
       -- Days 1-21 that have passed (today excluded), as hie-auth counts them.
       GREATEST(LEAST(datediff(current_date(), c.contact_date) - 1, 21), 0) AS days_expected,
       f.last_follow_up_date,
       COALESCE(f.last_follow_up_date >= date_sub(current_date(), 1), false) AS followed_up_last_24h,
       f.first_symptomatic_day,
       CASE
         WHEN lower(c.case_type) <> 'contact' THEN 'converted'
         WHEN COALESCE(f.ever_symptomatic, false) THEN 'flagged'
         WHEN datediff(current_date(), c.contact_date) > 21 THEN 'completed'
         -- Trailing missed days up to yesterday, as hie-auth counts them.
         WHEN LEAST(datediff(current_date(), c.contact_date) - 1, 21) - COALESCE(f.last_day_followed_up, 0) >= 3 THEN 'lost'
         ELSE 'active'
       END AS status,
       lower(c.case_type) <> 'contact' AS became_case
FROM coded c
LEFT JOIN per_contact f ON f.contact_encounter_id = c.encounter_id
LEFT JOIN places pc ON pc.id = c.county_code
LEFT JOIN places ps ON ps.id = c.sub_county_code

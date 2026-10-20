-- VHF transmission network: one row per record in a contact chain, for the
-- "VHF Transmission Tree" Graph chart (edge `Network Source` -> `Network Target`,
-- coloured by `Source Node Type`/`Node Type`), plus the columns behind the
-- "contacts who became cases" charts.
--
-- Reads the precomputed line list (nphiis_vhf_line_list, from vhf_line_list.sql).
-- Precomputed itself into nphiis_vhf_transmission_tree by refresh_tables.py.
--
-- A record's source is the EPID at the start of its latest "Contact Link to
-- Case" answer (mobile stores "<EPID>  <name>"), else its most recent
-- Patient.link (mobile appends a link to the source case's Patient each time
-- the source is set). EPIDs are matched only when complete and unique:
-- unassigned ones ("KEN-...-VHF-") repeat.
--
-- A contact that became a case is a record now reported as a case that was
-- once typed Contact (mobile writes each change of "Type of case" as a new
-- Observation) or whose monitoring status is "Became a suspected case".
--
-- Index cases have no source ("Network Source" is NULL); the chart filters those rows out.
-- This dataset has none of the dashboard filter columns, so the chart always shows all chains.
WITH ll AS (
  SELECT * FROM default.nphiis_vhf_line_list
),
last_link AS (
  SELECT patient_id, linked_pid FROM (
    SELECT lk.patient_id, lk.linked_pid,
           ROW_NUMBER() OVER (PARTITION BY lk.patient_id ORDER BY lk.pos DESC) AS rn
    FROM (
      SELECT p.id AS patient_id, lnk.other.patientId AS linked_pid, pos
      FROM patient p
      LATERAL VIEW POSEXPLODE(p.link) link_table AS pos, lnk
      WHERE p.id IN (SELECT patient_id FROM ll)
    ) lk
    JOIN ll src ON src.patient_id = lk.linked_pid
    WHERE lk.linked_pid <> lk.patient_id
  ) x WHERE rn = 1
),
epid_lookup AS (
  SELECT `EPID` AS epid, MIN(patient_id) AS patient_id
  FROM ll
  WHERE `EPID` RLIKE '[0-9]$'
  GROUP BY `EPID`
  HAVING COUNT(*) = 1
),
parents AS (
  SELECT ll.patient_id, COALESCE(e.patient_id, ln.linked_pid) AS parent_pid
  FROM ll
  LEFT JOIN last_link ln ON ln.patient_id = ll.patient_id
  LEFT JOIN epid_lookup e
    ON e.epid = REGEXP_EXTRACT(ll.`Source EPID`, '^(\\S+)', 1)
   AND e.patient_id <> ll.patient_id
),
was_contact AS (
  SELECT DISTINCT o.subject.patientId AS patient_id
  FROM Observation o
  WHERE o.code.coding[0].code = 'vhf-case-type'
    AND LOWER(COALESCE(o.value.string, o.value.codeableConcept.text,
                       o.value.codeableConcept.coding[0].display)) = 'contact'
    AND o.subject.patientId IN (SELECT patient_id FROM ll)
),
nodes AS (
  SELECT ll.*, pa.parent_pid,
    CASE
      WHEN ll.`Record Type` = 'Contact' THEN 'Contact'
      WHEN wc.patient_id IS NOT NULL
        OR LOWER(COALESCE(ll.`Monitoring Status`, '')) LIKE 'became%' THEN 'Contact became case'
      WHEN pa.parent_pid IS NOT NULL THEN 'Secondary case'
      ELSE 'Index case'
    END AS node_type
  FROM ll
  JOIN parents pa ON pa.patient_id = ll.patient_id
  LEFT JOIN was_contact wc ON wc.patient_id = ll.patient_id
),
chain_nodes AS (
  SELECT n.*,
    CONCAT_WS(' · ', COALESCE(NULLIF(n.`Patient Name`, ''), 'Unnamed'), n.`EPID`) AS person_label
  FROM nodes n
  WHERE n.parent_pid IS NOT NULL
     OR n.node_type = 'Contact became case'
     OR n.patient_id IN (SELECT parent_pid FROM parents WHERE parent_pid IS NOT NULL)
),
-- Network chart node names: the Graph chart merges nodes by name, so repeated names get a #n.
labelled AS (
  SELECT c.*,
    CASE WHEN COUNT(*) OVER (PARTITION BY c.person_label) > 1
         THEN CONCAT(c.person_label, ' #', CAST(ROW_NUMBER() OVER (PARTITION BY c.person_label ORDER BY c.patient_id) AS STRING))
         ELSE c.person_label END AS graph_label
  FROM chain_nodes c
)
SELECT c.patient_id AS node_id,
       c.node_type AS `Node Type`,
       COALESCE(NULLIF(c.`Patient Name`, ''), 'Unnamed') AS `Person`,
       c.`EPID` AS `Person EPID`,
       CASE WHEN c.node_type = 'Contact' THEN COALESCE(c.`Monitoring Status`, 'Contact')
            ELSE c.`Classification` END AS `Latest Status`,
       src.person_label AS `Source Case`,
       DATE_FORMAT(c.`Date Reported`, 'dd/MM/yyyy') AS `Reported Date`,
       src.graph_label AS `Network Source`,
       c.graph_label AS `Network Target`,
       src.node_type AS `Source Node Type`
FROM labelled c
LEFT JOIN labelled src ON src.patient_id = c.parent_pid

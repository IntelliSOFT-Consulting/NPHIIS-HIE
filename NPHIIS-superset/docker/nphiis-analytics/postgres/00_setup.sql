-- The fhir_analytics database (analytics-postgres container). public.*_pg are written by the
-- data pipeline (fhir-data-pipes/docker/config/view-definitions); missing text values arrive
-- as '' rather than NULL. Schema nphiis holds the helpers the dataset SQL uses. Idempotent:
-- re-apply after a new database or a --recreateSinkTables load (indexes, grants).
CREATE SCHEMA IF NOT EXISTS nphiis;

-- Dashboard queries over small data: JIT compilation costs seconds and saves nothing, and
-- the line-list sorts spill to disk at the default 4MB. New sessions pick these up.
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET jit = off', current_database());
  EXECUTE format('ALTER DATABASE %I SET work_mem = %L', current_database(), '32MB');
END $$;

-- Spark's to_date(): a 'yyyy', 'yyyy-MM' or 'yyyy-MM-dd' prefix (optionally followed by
-- 'T' or a space and a time) becomes a date; anything else, or an impossible date, is NULL.
-- to_date_safe handles the usual 'yyyy-MM-dd...' as one inlinable expression; other shapes
-- go to to_date_slow. Neither uses an EXCEPTION handler (a subtransaction per call).
CREATE OR REPLACE FUNCTION nphiis.to_date_slow(v text) RETURNS date
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE m text[]; y int; mo int; d int;
BEGIN
  m := regexp_match(btrim(v), '^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:[T ].*)?$');
  IF m IS NULL THEN RETURN NULL; END IF;
  y := m[1]::int; mo := COALESCE(m[2], '1')::int; d := COALESCE(m[3], '1')::int;
  IF y = 0 OR mo NOT BETWEEN 1 AND 12 OR d < 1
     OR d > EXTRACT(DAY FROM make_date(y, mo, 1) + interval '1 month - 1 day') THEN
    RETURN NULL;
  END IF;
  RETURN make_date(y, mo, d);
END $$;

CREATE OR REPLACE FUNCTION nphiis.to_date_safe(v text) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN v ~ '^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|1\d|2[0-8])([T ]|$)' THEN substr(v, 1, 10)::date
    WHEN v IS NULL OR v = '' THEN NULL
    ELSE nphiis.to_date_slow(v)
  END
$$;

-- Spark's CAST(string AS INT): digits with an optional fraction (dropped); else NULL.
CREATE OR REPLACE FUNCTION nphiis.to_int_safe(v text) RETURNS int
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN btrim(v) ~ '^[+-]?\d{1,9}(\.\d*)?$' THEN trunc(btrim(v)::numeric)::int END
$$;

-- Spark's months_between(a, b): whole months plus the day difference over 31, except when
-- both days are equal or both are month ends. Used for ages, so they round as Spark did.
CREATE OR REPLACE FUNCTION nphiis.months_between(a date, b date) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT (EXTRACT(YEAR FROM a) - EXTRACT(YEAR FROM b)) * 12
       + (EXTRACT(MONTH FROM a) - EXTRACT(MONTH FROM b))
       + CASE WHEN EXTRACT(DAY FROM a) = EXTRACT(DAY FROM b)
               OR (a = (date_trunc('month', a) + interval '1 month - 1 day')::date
                   AND b = (date_trunc('month', b) + interval '1 month - 1 day')::date) THEN 0
              ELSE (EXTRACT(DAY FROM a) - EXTRACT(DAY FROM b)) / 31.0 END
$$;

-- Indexes the queries rely on (the pipeline only indexes id). IF NOT EXISTS: safe on every run.
CREATE INDEX IF NOT EXISTS observation_flat_pg_patient_idx ON public.observation_flat_pg (patient_id);
CREATE INDEX IF NOT EXISTS observation_flat_pg_encounter_idx ON public.observation_flat_pg (encounter_id);
CREATE INDEX IF NOT EXISTS observation_flat_pg_code_idx ON public.observation_flat_pg (code);
CREATE INDEX IF NOT EXISTS encounter_flat_pg_part_of_idx ON public.encounter_flat_pg (part_of_id);
CREATE INDEX IF NOT EXISTS patient_identifier_pg_system_idx ON public.patient_identifier_pg (system);
CREATE INDEX IF NOT EXISTS questionnaire_response_answer_pg_link_idx ON public.questionnaire_response_answer_pg (link_id);
CREATE INDEX IF NOT EXISTS list_entry_pg_item_idx ON public.list_entry_pg (item_encounter_id);

-- Read-only login for Superset (created with its password by vhf_postgres_setup.py's caller;
-- see docs/deployment.md). It reads the pipeline tables and the helpers, nothing else.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'superset_ro') THEN
    GRANT CONNECT ON DATABASE fhir_analytics TO superset_ro;
    GRANT USAGE ON SCHEMA public, nphiis TO superset_ro;
    GRANT SELECT ON ALL TABLES IN SCHEMA public, nphiis TO superset_ro;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nphiis TO superset_ro;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO superset_ro;
    ALTER ROLE superset_ro SET search_path = public;
  END IF;
END $$;

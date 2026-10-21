-- Measles Cases by Month on Postgres. Port of "Measles Cases by Month" (id 116).
-- Counts distinct measles encounters by month of submission.
-- In the flat tables, encounters matching measles cases are the patient submissions,
-- approximated by the earliest observation timestamp per patient.
SELECT
  TO_CHAR(DATE_TRUNC('month', submitted), 'Month')        AS month_name,
  TO_CHAR(DATE_TRUNC('month', submitted), 'YYYY-MM')      AS year_month,
  EXTRACT(YEAR  FROM submitted)::int                      AS year,
  EXTRACT(MONTH FROM submitted)::int                      AS month,
  COUNT(DISTINCT patient_id)                              AS case_count
FROM (
  SELECT
    o.patient_id,
    MIN(NULLIF(o.last_updated,'')::timestamptz) AS submitted
  FROM public.observation_flat_pg o
  WHERE o.patient_id IN (
    SELECT DISTINCT p.id FROM public.patient_flat_pg p
    JOIN public.patient_identifier_pg i ON i.id = p.id
    WHERE p.active IS DISTINCT FROM false AND i.system LIKE 'measles-%'
  )
  GROUP BY o.patient_id
) subq
WHERE submitted IS NOT NULL
GROUP BY
  TO_CHAR(DATE_TRUNC('month', submitted), 'Month'),
  TO_CHAR(DATE_TRUNC('month', submitted), 'YYYY-MM'),
  EXTRACT(YEAR FROM submitted),
  EXTRACT(MONTH FROM submitted)
ORDER BY year, month

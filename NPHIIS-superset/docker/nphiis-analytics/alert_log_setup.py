"""The Alert Log line list dataset on the analytics Postgres.

    sudo docker exec superset_app python /app/docker/nphiis-analytics/alert_log_setup.py

Creates or updates one dataset, "Alert Log Line List", on the "NPHIIS Analytics (Postgres)"
database from postgres/alert_log_line_list.sql (one row per alert from the mobile Alert Log
form). The SQL reads the pipeline's sink tables directly, so there is nothing to refresh.
Safe to re-run; it touches no other dataset. The database is created by vhf_postgres_setup.py.

Build charts and a dashboard from it in Superset (alert_log_dashboard_setup.py). Row-level
security: every Superset rule that covers "vhf_contacts (Postgres)" also covers this dataset, and
embedded dashboards filter it on county_rls / subcounty_rls (the person's county and sub-county
of residence); the "County" and "Sub County" columns are the same area.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "postgres"))
from render import render  # noqa: E402

DATABASE_NAME = "NPHIIS Analytics (Postgres)"
DATASET_NAME = "Alert Log Line List"
RLS_LIKE = "vhf_contacts (Postgres)"  # its row-level security rules cover this dataset too
SQL_FILE = "alert_log_line_list.sql"
DATE_COLUMNS = ("Date Alerted", "Epi Week", "Onset Date", "True Onset", "Specimen Date", "Investigated")
METRICS = [
    ("count_alerts", "Alerts", "COUNT(*)"),
    ("meets_definition", "Meet case definition", "COUNT(*) FILTER (WHERE LOWER(\"Meets Definition\") = 'yes')"),
    ("samples_taken", "Samples taken", "COUNT(*) FILTER (WHERE LOWER(\"Sample Taken\") = 'yes')"),
    ("deceased", "Deceased", "COUNT(*) FILTER (WHERE LOWER(\"Vital Status\") = 'deceased')"),
    ("avg_days_to_visit", "Average days to visit", 'AVG("Days To Visit")'),
]


def main():
    from superset.app import create_app

    with create_app().app_context():
        from superset.connectors.sqla.models import RowLevelSecurityFilter, SqlaTable, SqlMetric
        from superset.extensions import db
        from superset.models.core import Database

        pg = db.session.query(Database).filter_by(database_name=DATABASE_NAME).one_or_none()
        if pg is None:
            print(f"SKIP: no database {DATABASE_NAME!r}; run vhf_postgres_setup.py first")
            return
        ds = db.session.query(SqlaTable).filter_by(table_name=DATASET_NAME, database_id=pg.id).one_or_none()
        if ds is None:
            ds = SqlaTable(table_name=DATASET_NAME, database_id=pg.id, schema="public")
            db.session.add(ds)
        ds.sql = render(SQL_FILE)
        ds.description = f"One row per alert (mobile Alert Log form), from NPHIIS-superset/docker/nphiis-analytics/postgres/{SQL_FILE}."
        ds.main_dttm_col = "Date Alerted"
        db.session.commit()
        ds.fetch_metadata()
        for col in ds.columns:
            col.filterable = True
            col.groupby = True
            col.is_dttm = col.column_name in DATE_COLUMNS
        for name, verbose, expression in METRICS:
            m = next((m for m in ds.metrics if m.metric_name == name), None)
            if m is None:
                m = SqlMetric(metric_name=name)
                ds.metrics.append(m)
            m.verbose_name, m.expression = verbose, expression
        # The same row-level security as the VHF datasets (county_rls / subcounty_rls columns).
        contacts = db.session.query(SqlaTable).filter_by(table_name=RLS_LIKE, database_id=pg.id).one_or_none()
        if contacts is not None:
            for rule in db.session.query(RowLevelSecurityFilter).all():
                if contacts in rule.tables and ds not in rule.tables:
                    rule.tables.append(ds)
        db.session.commit()
        print("dataset", ds.id, ds.table_name, "columns", len(ds.columns), "metrics", len(ds.metrics))


if __name__ == "__main__":
    main()

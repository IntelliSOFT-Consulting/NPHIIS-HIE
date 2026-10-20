"""Precomputes the heavy VHF datasets as Spark tables, so Superset charts read a small table
instead of re-pivoting every Observation per chart.

Each entry of TABLES is built from datasets/<file> into a new table <name>__<UTC stamp>; the
view <name> is then pointed at it. Charts never see a half-built table, and the build before
it is kept for queries still reading it; older builds are dropped. Built in order, so a later
SQL can read an earlier view (the transmission tree reads nphiis_vhf_line_list).

Runs hourly at :10 from Superset's Celery beat (task nphiis.refresh_analytics_tables in
docker/pythonpath_dev/nphiis_tasks.py), shortly after the data pipeline's 2-hourly run; also
at the start of vhf_contacts_setup.py. By hand:

    sudo docker exec superset_app python /app/docker/nphiis-analytics/refresh_tables.py

Columns that depend on today's date (contact status, "Seen Recently", days expected) are
fixed at build time, so they can lag by up to an hour after midnight.
"""
import os
import re
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DATABASE_NAME = "Apache Hive"
SCHEMA = "default"
TABLES = [
    ("nphiis_vhf_line_list", "vhf_line_list.sql"),
    ("nphiis_vhf_transmission_tree", "vhf_transmission_tree.sql"),
    ("nphiis_vhf_contacts", "vhf_contacts.sql"),
]


def read_sql(file):
    with open(os.path.join(HERE, "datasets", file)) as f:
        return f.read().strip().rstrip(";")


def refresh(cursor, log=print):
    """Builds every table in TABLES; raises after trying them all if any failed."""
    stamp = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    failed = []
    for name, file in TABLES:
        build = f"{name}__{stamp}"
        started = time.time()
        try:
            cursor.execute(f"CREATE TABLE {SCHEMA}.{build} USING PARQUET AS\n{read_sql(file)}")
            cursor.execute(f"CREATE OR REPLACE VIEW {SCHEMA}.{name} AS SELECT * FROM {SCHEMA}.{build}")
        except Exception as e:  # keep the view on the previous build
            log(f"FAILED {name}: {e}")
            failed.append(name)
            try:
                cursor.execute(f"DROP TABLE IF EXISTS {SCHEMA}.{build}")
            except Exception:
                pass
            continue
        cursor.execute(f"SHOW TABLES IN {SCHEMA} LIKE '{name}__*'")
        builds = sorted(r[1] for r in cursor.fetchall() if re.fullmatch(rf"{name}__\d{{14}}", r[1]))
        for old in builds[:-2]:
            cursor.execute(f"DROP TABLE IF EXISTS {SCHEMA}.{old}")
        log(f"{name}: {build} in {time.time() - started:.1f}s, dropped {len(builds[:-2])} old build(s)")
    if failed:
        raise RuntimeError(f"could not build {', '.join(failed)}")


def refresh_with_superset(log=print):
    """Runs refresh() on Superset's warehouse connection. Needs a Superset app context."""
    from superset.extensions import db
    from superset.models.core import Database

    database = db.session.query(Database).filter_by(database_name=DATABASE_NAME).one_or_none()
    if database is None:
        raise RuntimeError(f"no Superset database named {DATABASE_NAME!r}")
    with database.get_raw_connection() as conn:
        cursor = conn.cursor()
        try:
            refresh(cursor, log)
        finally:
            cursor.close()


if __name__ == "__main__":
    from superset.app import create_app

    with create_app().app_context():
        refresh_with_superset()

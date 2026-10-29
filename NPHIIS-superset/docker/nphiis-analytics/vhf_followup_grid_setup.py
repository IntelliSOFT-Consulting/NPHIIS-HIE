"""The VHF contact 21-day follow-up grid: dataset, table chart and dashboard.

    sudo docker exec superset_app python /app/docker/nphiis-analytics/vhf_followup_grid_setup.py

One row per contact, Day 1 to Day 21 as columns, each cell the finding of that day's visit
(see postgres/vhf_followup_grid.sql). Creates or updates the dataset "VHF Contact Follow-up
Grid" on the "NPHIIS Analytics (Postgres)" database, the chart "VHF contacts - 21-day grid" and
the dashboard "VHF Contact Follow-up Grid". Row-level security: every rule that covers the
"vhf_contacts (Postgres)" dataset also covers the grid, which carries the same area columns.
Safe to re-run; touches nothing else. Needs vhf_postgres_setup.py to have run.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "postgres"))
from render import render  # noqa: E402

DATABASE_NAME = "NPHIIS Analytics (Postgres)"
DATASET_NAME = "VHF Contact Follow-up Grid"
CONTACTS_DATASET = "vhf_contacts (Postgres)"
SQL_FILE = "vhf_followup_grid.sql"
CHART = "VHF contacts - 21-day grid"
DASHBOARD = "VHF Contact Follow-up Grid"
SLUG = "vhf-followup-grid"
DATE_COLUMNS = ("Contact Date", "Last Day")
COLUMNS = ["Contact ID", "Source Case", "Status", "Contact Date", "Days Seen", "Days Due", "County", "Sub County"] + [
    f"Day {d}" for d in range(1, 22)
]


def main():
    from superset.app import create_app

    with create_app().app_context():
        from superset.connectors.sqla.models import RowLevelSecurityFilter, SqlaTable
        from superset.extensions import db
        from superset.models.core import Database
        from superset.models.dashboard import Dashboard
        from superset.models.slice import Slice

        pg = db.session.query(Database).filter_by(database_name=DATABASE_NAME).one_or_none()
        if pg is None:
            print(f"SKIP: no database {DATABASE_NAME!r}; run vhf_postgres_setup.py first")
            return
        contacts = db.session.query(SqlaTable).filter_by(table_name=CONTACTS_DATASET, database_id=pg.id).one_or_none()
        ds = db.session.query(SqlaTable).filter_by(table_name=DATASET_NAME, database_id=pg.id).one_or_none()
        if ds is None:
            ds = SqlaTable(table_name=DATASET_NAME, database_id=pg.id, schema="public")
            ds.owners = list(contacts.owners) if contacts else []
            db.session.add(ds)
        ds.sql = render(SQL_FILE)
        ds.description = f"One row per VHF contact, Day 1-21 findings (NPHIIS-superset/docker/nphiis-analytics/postgres/{SQL_FILE})."
        ds.main_dttm_col = "Contact Date"
        db.session.commit()
        ds.fetch_metadata()
        for col in ds.columns:
            col.filterable = True
            col.groupby = True
            col.is_dttm = col.column_name in DATE_COLUMNS
        # The same row-level security as the contacts dataset.
        if contacts is not None:
            for rule in db.session.query(RowLevelSecurityFilter).all():
                if contacts in rule.tables and ds not in rule.tables:
                    rule.tables.append(ds)
        db.session.commit()
        print("dataset", ds.id, ds.table_name, "columns", len(ds.columns))

        params = {
            "viz_type": "table",
            "query_mode": "raw",
            "adhoc_filters": [],
            "all_columns": COLUMNS,
            "order_by_cols": [json.dumps(["Contact Date", False])],
            "row_limit": 5000,
            "table_timestamp_format": "smart_date",
            "include_search": True,
            "page_length": 25,
            "datasource": f"{ds.id}__table",
        }
        s = db.session.query(Slice).filter_by(slice_name=CHART).one_or_none()
        if s is None:
            s = Slice(slice_name=CHART)
            s.owners = list(ds.owners)
            db.session.add(s)
        s.viz_type = "table"
        s.datasource_type = "table"
        s.datasource_id = ds.id
        s.params = json.dumps(params)
        s.query_context = None
        db.session.commit()

        position = {
            "DASHBOARD_VERSION_KEY": "v2",
            "ROOT_ID": {"children": ["GRID_ID"], "id": "ROOT_ID", "type": "ROOT"},
            "HEADER_ID": {"id": "HEADER_ID", "meta": {"text": DASHBOARD}, "type": "HEADER"},
            "GRID_ID": {"children": ["ROW-fugrid-0"], "id": "GRID_ID", "parents": ["ROOT_ID"], "type": "GRID"},
            "ROW-fugrid-0": {
                "children": ["CHART-fugrid-0"], "id": "ROW-fugrid-0", "type": "ROW",
                "meta": {"background": "BACKGROUND_TRANSPARENT"}, "parents": ["ROOT_ID", "GRID_ID"],
            },
            "CHART-fugrid-0": {
                "children": [], "id": "CHART-fugrid-0", "type": "CHART",
                "meta": {"chartId": s.id, "sliceName": s.slice_name, "width": 12, "height": 90, "uuid": str(s.uuid)},
                "parents": ["ROOT_ID", "GRID_ID", "ROW-fugrid-0"],
            },
        }
        dash = db.session.query(Dashboard).filter_by(dashboard_title=DASHBOARD).one_or_none()
        if dash is None:
            dash = Dashboard(dashboard_title=DASHBOARD, slug=SLUG)
            dash.owners = list(ds.owners)
            db.session.add(dash)
        dash.slices = [s]
        dash.position_json = json.dumps(position)
        dash.json_metadata = json.dumps({"color_scheme": "supersetColors", "refresh_frequency": 0, "cross_filters_enabled": True})
        dash.published = True
        db.session.commit()
        print("dashboard", dash.id, dash.dashboard_title, "charts", len(dash.slices))


if __name__ == "__main__":
    main()

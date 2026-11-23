"""The EVD Daily Snapshot dataset and dashboard.

    sudo docker exec superset_app python /app/docker/nphiis-analytics/evd_snapshot_setup.py

Creates or updates the dataset "EVD Daily Snapshot" on the "NPHIIS Analytics (Postgres)" database
(postgres/evd_snapshot.sql: one row per sub-county per reporting date, from the returns saved by
the admin portal's Outbreak Response > EVD Daily Snapshot), the charts named "EVD Snapshot - ...",
the dashboard "EVD Daily Snapshot", and its embedding for the portal (fixed embed id below, the one
nphiis-admin src/components/outbreak-response/EvdSnapshotView.tsx defaults to). Safe to re-run; it
touches no other dataset, chart or dashboard. The database is created by vhf_postgres_setup.py.

Row-level security: every Superset rule that covers "vhf_contacts (Postgres)" also covers this
dataset, and embedded dashboards filter it on county_rls / subcounty_rls, so county and sub-county
officers see only their own area's returns.
"""
import json
import os
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "postgres"))
from render import render  # noqa: E402

DATABASE_NAME = "NPHIIS Analytics (Postgres)"
DATASET_NAME = "EVD Daily Snapshot"
DASHBOARD = "EVD Daily Snapshot"
SLUG = "evd-daily-snapshot"
RLS_LIKE = "vhf_contacts (Postgres)"  # its row-level security rules cover this dataset too
SQL_FILE = "evd_snapshot.sql"
DATE_COLUMNS = ("Reporting Date", "Period Covered", "Epi Week")
# uuid5(NAMESPACE_URL, "nphiis:superset:dashboard:EVD Daily Snapshot")
EMBED_UUID = "d3088997-6780-5c10-b116-1520fcbfaa63"
assert str(uuid.uuid5(uuid.NAMESPACE_URL, f"nphiis:superset:dashboard:{DASHBOARD}")) == EMBED_UUID


def total(column, label):
    return {"expressionType": "SQL", "sqlExpression": f'SUM("{column}")', "label": label, "hasCustomLabel": True}


def metric(sql, label):
    return {"expressionType": "SQL", "sqlExpression": sql, "label": label, "hasCustomLabel": True}


RETURNS = metric("COUNT(*)", "Returns")
ON_TIME = metric("COUNT(*) FILTER (WHERE \"On Time\" = 'Yes')", "On time")

METRICS = [
    ("returns", "Returns", "COUNT(*)"),
    ("returns_on_time", "Returns on time (by 09:00 EAT)", "COUNT(*) FILTER (WHERE \"On Time\" = 'Yes')"),
    ("alerts_received", "Alerts received", 'SUM("Alerts Received")'),
    ("suspected_cases", "Suspected cases", 'SUM("Suspected Cases")'),
    ("lab_positive", "Lab positive", 'SUM("Lab Positive")'),
    ("lab_pending", "Lab pending", 'SUM("Lab Pending")'),
    ("contacts_lost", "Contacts lost to follow-up", 'SUM("Contacts Lost")'),
]


def big_number(sql, label, subheader):
    return {
        "viz_type": "big_number_total",
        "adhoc_filters": [],
        "metric": metric(sql, label),
        "subheader": subheader,
        "y_axis_format": ",d",
        "header_font_size": 0.4,
        "subheader_font_size": 0.15,
    }


def by_day(metrics, groupby=None, kind="echarts_timeseries_line", stacked=False):
    params = {
        "viz_type": kind,
        "x_axis": "Reporting Date",
        "time_grain_sqla": "P1D",
        "metrics": metrics,
        "groupby": groupby or [],
        "adhoc_filters": [],
        "row_limit": 10000,
        "color_scheme": "supersetColors",
        "show_legend": True,
        "y_axis_format": ",d",
    }
    if kind == "echarts_timeseries_bar":
        params.update({"orientation": "vertical", "stack": "Stack" if stacked else None})
    return params


LIST_COLUMNS = [
    "Reporting Date", "County", "Sub County", "Focal Person", "Phone", "Alerts Received",
    "Suspected Cases", "Alerts Verified", "Cases Investigated", "Cases Isolated", "Specimens Shipped",
    "Lab Positive", "Lab Negative", "Lab Pending", "New Contacts", "Contacts Due", "Contacts Followed Up",
    "Contacts Lost", "Contacts Symptomatic", "Contacts Completed 21d", "Travellers Screened",
    "Travellers Referred", "On Time", "Submitted At", "Challenges",
]

# (name, params, width)
CHARTS = [
    ("EVD Snapshot - returns", big_number("COUNT(*)", "Returns", "Sub-county returns received"), 3),
    ("EVD Snapshot - suspected cases", big_number('SUM("Suspected Cases")', "Suspected cases", "New suspected cases reported"), 3),
    ("EVD Snapshot - lab positive", big_number('SUM("Lab Positive")', "Lab positive", "Positive lab results reported"), 3),
    ("EVD Snapshot - contacts symptomatic", big_number('SUM("Contacts Symptomatic")', "Symptomatic contacts", "Contacts who developed symptoms"), 3),
    (
        "EVD Snapshot - returns per day",
        by_day([RETURNS], ["On Time"], "echarts_timeseries_bar", stacked=True),
        6,
    ),
    (
        "EVD Snapshot - detection per day",
        by_day([total("Alerts Received", "Alerts"), total("Suspected Cases", "Suspected cases"), total("Lab Positive", "Lab positive")]),
        6,
    ),
    (
        "EVD Snapshot - follow-up per day",
        by_day([total("Contacts Due", "Due"), total("Contacts Followed Up", "Followed up"), total("Contacts Lost", "Lost")]),
        6,
    ),
    (
        "EVD Snapshot - by county",
        {
            "viz_type": "table",
            "query_mode": "aggregate",
            "adhoc_filters": [],
            "groupby": ["County"],
            "metrics": [RETURNS, ON_TIME, total("Suspected Cases", "Suspected cases"), total("Lab Positive", "Lab positive"),
                        total("Contacts Lost", "Contacts lost")],
            "timeseries_limit_metric": RETURNS,
            "order_desc": True,
            "row_limit": 100,
            "show_cell_bars": True,
        },
        6,
    ),
    (
        "EVD Snapshot - submissions",
        {
            "viz_type": "table",
            "query_mode": "raw",
            "adhoc_filters": [],
            "all_columns": LIST_COLUMNS,
            "order_by_cols": [json.dumps(["Reporting Date", False])],
            "row_limit": 1000,
            "table_timestamp_format": "smart_date",
            "include_search": True,
            "page_length": 25,
        },
        12,
    ),
]
ROWS = [[0, 1, 2, 3], [4, 5], [6, 7], [8]]


def main():
    from superset.app import create_app

    with create_app().app_context():
        from superset.connectors.sqla.models import RowLevelSecurityFilter, SqlaTable, SqlMetric
        from superset.extensions import db
        from superset.models.core import Database
        from superset.models.dashboard import Dashboard
        from superset.models.embedded_dashboard import EmbeddedDashboard
        from superset.models.slice import Slice

        pg = db.session.query(Database).filter_by(database_name=DATABASE_NAME).one_or_none()
        if pg is None:
            print(f"SKIP: no database {DATABASE_NAME!r}; run vhf_postgres_setup.py first")
            return
        ds = db.session.query(SqlaTable).filter_by(table_name=DATASET_NAME, database_id=pg.id).one_or_none()
        if ds is None:
            ds = SqlaTable(table_name=DATASET_NAME, database_id=pg.id, schema="public")
            db.session.add(ds)
        ds.sql = render(SQL_FILE)
        ds.description = f"One row per sub-county per reporting date (portal EVD Daily Snapshot), from NPHIIS-superset/docker/nphiis-analytics/postgres/{SQL_FILE}."
        ds.main_dttm_col = "Reporting Date"
        db.session.commit()
        ds.fetch_metadata()
        for col in ds.columns:
            col.filterable = True
            col.groupby = True
            col.is_dttm = col.column_name in DATE_COLUMNS
            if col.is_dttm:
                col.python_date_format = "%Y-%m-%d"  # dates only, no 00:00:00 time part
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
        owners = list(ds.owners)

        slices = []
        for name, params, _width in CHARTS:
            params = {**params, "datasource": f"{ds.id}__table"}
            s = db.session.query(Slice).filter_by(slice_name=name).one_or_none()
            if s is None:
                s = Slice(slice_name=name)
                s.owners = owners
                db.session.add(s)
            s.viz_type = params["viz_type"]
            s.datasource_type = "table"
            s.datasource_id = ds.id
            s.params = json.dumps(params)
            s.query_context = None
            slices.append(s)
        db.session.commit()

        position = {
            "DASHBOARD_VERSION_KEY": "v2",
            "ROOT_ID": {"children": ["GRID_ID"], "id": "ROOT_ID", "type": "ROOT"},
            "HEADER_ID": {"id": "HEADER_ID", "meta": {"text": DASHBOARD}, "type": "HEADER"},
            "GRID_ID": {"children": [], "id": "GRID_ID", "parents": ["ROOT_ID"], "type": "GRID"},
        }
        for r, row in enumerate(ROWS):
            row_id = f"ROW-evds-{r}"
            position["GRID_ID"]["children"].append(row_id)
            position[row_id] = {
                "children": [], "id": row_id, "type": "ROW",
                "meta": {"background": "BACKGROUND_TRANSPARENT"}, "parents": ["ROOT_ID", "GRID_ID"],
            }
            for i in row:
                s, width = slices[i], CHARTS[i][2]
                chart_id = f"CHART-evds-{r}-{i}"
                position[row_id]["children"].append(chart_id)
                position[chart_id] = {
                    "children": [], "id": chart_id, "type": "CHART",
                    "meta": {"chartId": s.id, "sliceName": s.slice_name, "width": width,
                             "height": 30 if r == 0 else 60, "uuid": str(s.uuid)},
                    "parents": ["ROOT_ID", "GRID_ID", row_id],
                }
        dash = db.session.query(Dashboard).filter_by(dashboard_title=DASHBOARD).one_or_none()
        if dash is None:
            dash = Dashboard(dashboard_title=DASHBOARD, slug=SLUG)
            dash.owners = owners
            db.session.add(dash)
        dash.slices = slices
        dash.position_json = json.dumps(position)
        dash.json_metadata = json.dumps({
            "color_scheme": "supersetColors",
            "refresh_frequency": 0,
            "cross_filters_enabled": True,
        })
        dash.published = True
        db.session.commit()
        print("dashboard", dash.id, dash.dashboard_title, "charts", len(dash.slices))

        # Embedding for the admin portal: same allowed origins as the other embedded dashboards.
        embed_env = os.environ.get("EMBED_DOMAINS") or os.environ.get("EMBEDDED_ALLOWED_ORIGINS", "")
        domains = {d.strip() for d in embed_env.split(",") if d.strip()}
        for e in db.session.query(EmbeddedDashboard).all():
            domains.update(e.allowed_domains or [])
        domains = {d for d in domains if "://" in d}  # same_origin needs scheme + host
        e = db.session.query(EmbeddedDashboard).filter_by(dashboard_id=dash.id).one_or_none()
        if e is None:
            e = EmbeddedDashboard(dashboard_id=dash.id)
            db.session.add(e)
        if str(e.uuid) != EMBED_UUID:
            e.uuid = uuid.UUID(EMBED_UUID)
        e.allow_domain_list = ",".join(sorted(domains))
        db.session.commit()
        print("embed", DASHBOARD, e.uuid, "domains", len(e.allowed_domains))


if __name__ == "__main__":
    main()

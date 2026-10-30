"""The Alert Log dashboard, built on the "Alert Log Line List" dataset.

    sudo docker exec superset_app python /app/docker/nphiis-analytics/alert_log_dashboard_setup.py

Run alert_log_setup.py first (it creates the dataset). Creates or updates the charts named
"Alert Log - ..." and the dashboard "Alert Log". Safe to re-run; it touches nothing else.

The line list is also placed at the bottom of the "VHF / Ebola Surveillance" dashboard. Row-level
security comes from the dataset (alert_log_setup.py): county and sub-county officers see only
alerts from their own area.
"""
import json

DATASET_NAME = "Alert Log Line List"
DASHBOARD = "Alert Log"
SLUG = "alert-log"
VHF_DASHBOARD = "VHF / Ebola Surveillance"
LINE_LIST_CHART = "Alert Log - line list"


def metric(sql, label):
    return {"expressionType": "SQL", "sqlExpression": sql, "label": label, "hasCustomLabel": True}


ALERTS = metric("COUNT(*)", "Alerts")


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


def counts_table(groupby, order_label):
    return {
        "viz_type": "table",
        "query_mode": "aggregate",
        "adhoc_filters": [],
        "groupby": groupby,
        "metrics": [ALERTS],
        "timeseries_limit_metric": ALERTS,
        "order_desc": True,
        "row_limit": 200,
        "show_cell_bars": True,
    }


LIST_COLUMNS = [
    "Date Alerted", "Alert ID", "Source", "Reported By", "Patient Name", "Sex", "Age", "County",
    "Sub County", "Symptoms", "Travelled", "Meets Definition", "Sample Taken", "Vital Status",
    "Investigated", "Visit Lag",
]

# (name, params, width)
CHARTS = [
    ("Alert Log - alerts", big_number("COUNT(*)", "Alerts", "Alerts logged"), 3),
    ("Alert Log - meet definition", big_number("COUNT(*) FILTER (WHERE LOWER(\"Meets Definition\") = 'yes')", "Meet definition", "Meet the suspected case definition"), 3),
    ("Alert Log - samples taken", big_number("COUNT(*) FILTER (WHERE LOWER(\"Sample Taken\") = 'yes')", "Samples", "Samples collected"), 3),
    ("Alert Log - deceased", big_number("COUNT(*) FILTER (WHERE LOWER(\"Vital Status\") = 'deceased')", "Deceased", "Deceased at the time of alert"), 3),
    (
        "Alert Log - alerts per week",
        {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "Epi Week",
            "time_grain_sqla": "P1W",
            "metrics": [ALERTS],
            "groupby": [],
            "adhoc_filters": [],
            "row_limit": 10000,
            "orientation": "vertical",
            "color_scheme": "supersetColors",
            "show_legend": False,
            "y_axis_format": ",d",
        },
        6,
    ),
    (
        "Alert Log - by source",
        {
            "viz_type": "pie",
            "adhoc_filters": [],
            "groupby": ["Source"],
            "metric": ALERTS,
            "row_limit": 20,
            "color_scheme": "supersetColors",
            "show_legend": True,
            "label_type": "key_value",
            "donut": True,
            "show_labels": True,
            "sort_by_metric": True,
        },
        6,
    ),
    ("Alert Log - by county", counts_table(["County"], "Alerts"), 6),
    ("Alert Log - by symptom count", counts_table(["Symptom Count"], "Alerts"), 6),
    (
        "Alert Log - line list",
        {
            "viz_type": "table",
            "query_mode": "raw",
            "adhoc_filters": [],
            "all_columns": LIST_COLUMNS,
            "order_by_cols": [json.dumps(["Date Alerted", False])],
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
        from superset.connectors.sqla.models import SqlaTable
        from superset.extensions import db
        from superset.models.dashboard import Dashboard
        from superset.models.slice import Slice

        ds = db.session.query(SqlaTable).filter_by(table_name=DATASET_NAME).one_or_none()
        if ds is None:
            print(f"SKIP: no dataset {DATASET_NAME!r}; run alert_log_setup.py first")
            return
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
            row_id = f"ROW-alog-{r}"
            position["GRID_ID"]["children"].append(row_id)
            position[row_id] = {
                "children": [], "id": row_id, "type": "ROW",
                "meta": {"background": "BACKGROUND_TRANSPARENT"}, "parents": ["ROOT_ID", "GRID_ID"],
            }
            for i in row:
                s, width = slices[i], CHARTS[i][2]
                chart_id = f"CHART-alog-{r}-{i}"
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

        add_to_vhf_dashboard(db, Dashboard, next(s for s in slices if s.slice_name == LINE_LIST_CHART))


def add_to_vhf_dashboard(db, Dashboard, chart):
    """Appends the line list as the last row of the VHF / Ebola Surveillance dashboard (once)."""
    vhf = db.session.query(Dashboard).filter_by(dashboard_title=VHF_DASHBOARD).one_or_none()
    if vhf is None:
        print(f"SKIP: no dashboard {VHF_DASHBOARD!r}")
        return
    position = json.loads(vhf.position_json or "{}")
    if any(v.get("meta", {}).get("chartId") == chart.id for v in position.values() if isinstance(v, dict)):
        print("line list already on", VHF_DASHBOARD)
        return
    row_id, chart_id = "ROW-alertlog-vhf", "CHART-alertlog-vhf"
    position[row_id] = {
        "children": [chart_id], "id": row_id, "type": "ROW",
        "meta": {"background": "BACKGROUND_TRANSPARENT"}, "parents": ["ROOT_ID", "GRID_ID"],
    }
    position[chart_id] = {
        "children": [], "id": chart_id, "type": "CHART",
        "meta": {"chartId": chart.id, "sliceName": chart.slice_name, "width": 12, "height": 90, "uuid": str(chart.uuid)},
        "parents": ["ROOT_ID", "GRID_ID", row_id],
    }
    position["GRID_ID"]["children"] = [c for c in position["GRID_ID"]["children"] if c != row_id] + [row_id]
    vhf.position_json = json.dumps(position)
    if chart not in vhf.slices:
        vhf.slices = list(vhf.slices) + [chart]
    db.session.commit()
    print("line list added to the bottom of", VHF_DASHBOARD, "charts", len(vhf.slices))


if __name__ == "__main__":
    main()

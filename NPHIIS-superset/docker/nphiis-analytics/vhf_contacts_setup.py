"""Creates or updates the VHF analytics in Superset. Safe to re-run: objects are matched by
name and updated.

1. Builds the precomputed VHF tables (refresh_tables.py; Celery refreshes them hourly).
2. Points the VHF datasets at them: "VHF Line List", "VHF Transmission Tree" and the new
   vhf_contacts read their table; "VHF County Map" (datasets/vhf_county_map.sql) joins the
   line-list table to the county boundaries.
3. vhf_contacts' row-level security rules, metrics, charts and the "VHF Contact Tracing"
   dashboard, and the embed ids the admin portal uses.
4. Draws the "VHF Transmission Tree" chart (on "VHF / Ebola Surveillance") as a network graph:
   cases are labelled hubs sized by their contacts, contacts are small dots around them.

Runs as step 4 of docker/docker-init.sh (the superset-init container) on every deployment;
NPHIIS_ANALYTICS_SETUP=no skips it. By hand, against a running Superset:

    sudo docker exec superset_app python /app/docker/nphiis-analytics/vhf_contacts_setup.py

It never fails the init: without the warehouse connection ("Apache Hive") it skips, so a
fresh Superset still starts; deploy again once the connection exists. If the tables cannot be
built, the datasets are left as they are.
"""
import json
import os
import sys

from superset.app import create_app

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
DATABASE_NAME = "Apache Hive"
DATASET = "vhf_contacts"
DASHBOARD = "VHF Contact Tracing"
OWNER_FROM_DATASET = "VHF Line List"  # the new objects get the same owners
# Existing datasets switched to the precomputed tables: name -> SQL (file in datasets/ or inline).
PRECOMPUTED_DATASETS = {
    "VHF Line List": "SELECT * FROM default.nphiis_vhf_line_list",
    "VHF Transmission Tree": "SELECT * FROM default.nphiis_vhf_transmission_tree",
    "VHF County Map": "vhf_county_map.sql",
}

# Area rules, in the form of the existing RLS rules (county_rls / subcounty_rls are upper-case,
# single-spaced names). A user with no area assigned sees nothing.
_COUNTY = (
    '{% set u = user_location_info() %} {% set county = (u.get("countyName") or u.get("county") or "") | trim %} '
    "{% set county_esc = county | replace(\"'\", \"''\") %} "
    "'{{ county_esc }}' <> '' AND county_rls = TRIM(REGEXP_REPLACE(UPPER('{{ county_esc }}'), '\\\\s+', ' '))"
)
_SUBCOUNTY = (
    '{% set u = user_location_info() %} {% set county = (u.get("countyName") or u.get("county") or "") | trim %} '
    '{% set subcounty = (u.get("subCountyName") or u.get("subCounty") or u.get("subcounty") or "") | trim %} '
    "{% set county_esc = county | replace(\"'\", \"''\") %} {% set subcounty_esc = subcounty | replace(\"'\", \"''\") %} "
    "'{{ county_esc }}' <> '' AND '{{ subcounty_esc }}' <> '' "
    "AND county_rls = TRIM(REGEXP_REPLACE(UPPER('{{ county_esc }}'), '\\\\s+', ' ')) "
    "AND subcounty_rls = TRIM(REGEXP_REPLACE(UPPER('{{ subcounty_esc }}'), '\\\\s+', ' '))"
)
_FACILITY = (
    '{% set u = user_location_info() %} {% set facility = (u.get("facility") or "") | trim %} '
    "{% set facility_esc = facility | replace(\"'\", \"''\") %} "
    "'{{ facility_esc }}' <> '' AND facility_id = '{{ facility_esc }}'"
)
RLS_RULES = [
    ("VHF contacts - county officers see own county", "COUNTY_DISEASE_SURVEILLANCE_OFFICER", _COUNTY),
    ("VHF contacts - sub-county officers see own sub-county", "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER", _SUBCOUNTY),
    ("VHF contacts - facility focal persons see own facility", "FACILITY_SURVEILLANCE_FOCAL_PERSON", _FACILITY),
    ("VHF contacts - vaccinators see none", "VACCINATOR", "1 = 0"),
]

# Dashboards the admin portal embeds, with fixed embed ids so the portal can default to them
# (nphiis-admin src/components/dashboard/ReportsSection.tsx). Allowed domains: the admin portal
# origins already allowed on the other embedded dashboards, plus EMBED_DOMAINS (comma-separated).
EMBEDS = {
    "VHF / Ebola Surveillance": "f7c7ba20-bbfb-57f8-ab96-a7e44eb07da7",
    DASHBOARD: "5f9bceb6-0753-5dd0-8217-7f78abdad7a1",
}

OPEN = "status IN ('active', 'lost')"  # still being followed up (not symptomatic, completed or a case)
METRICS = {
    "contacts": ("COUNT(*)", "Contacts listed", ",d"),
    "under_follow_up": (f"SUM(CASE WHEN {OPEN} THEN 1 ELSE 0 END)", "Contacts under follow up", ",d"),
    "followed_up_24h_pct": (
        f"SUM(CASE WHEN {OPEN} AND followed_up_last_24h THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN {OPEN} THEN 1 ELSE 0 END), 0)",
        "Share of contacts under follow up seen in the last 24 hours",
        ".0%",
    ),
    "lost": ("SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END)", "Last 3 days up to yesterday all missed", ",d"),
    "symptomatic": ("SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END)", "Symptomatic, not yet converted to a case", ",d"),
    "became_cases": ("SUM(CASE WHEN became_case THEN 1 ELSE 0 END)", "Contacts whose type of case is no longer Contact", ",d"),
    "completeness": (
        "SUM(days_followed_up) / NULLIF(SUM(days_expected), 0)",
        "Follow-up days recorded out of days due so far",
        ".0%",
    ),
}


def metric(name, label=None):
    return {"expressionType": "SQL", "sqlExpression": METRICS[name][0], "label": label or name, "hasCustomLabel": True}


def big_number(name, label, subheader, fmt):
    return {
        "viz_type": "big_number_total",
        "adhoc_filters": [],
        "metric": metric(name, label),
        "subheader": subheader,
        "y_axis_format": fmt,
        "header_font_size": 0.4,
        "subheader_font_size": 0.15,
    }


def table(groupby, metric_names, labels):
    return {
        "viz_type": "table",
        "query_mode": "aggregate",
        "adhoc_filters": [],
        "groupby": groupby,
        "metrics": [metric(n, l) for n, l in zip(metric_names, labels)],
        "timeseries_limit_metric": metric(metric_names[0], labels[0]),
        "order_desc": True,
        "row_limit": 1000,
        "table_timestamp_format": "smart_date",
        "show_cell_bars": True,
        "column_config": {
            l: {"d3NumberFormat": ".0%"} for n, l in zip(metric_names, labels) if METRICS[n][2] == ".0%"
        },
    }


CHARTS = [
    ("VHF contacts - listed", big_number("contacts", "Contacts", "Contacts listed", ",d"), 2),
    ("VHF contacts - under follow up", big_number("under_follow_up", "Under follow up", "Under 21-day follow up", ",d"), 2),
    ("VHF contacts - seen in last 24h", big_number("followed_up_24h_pct", "Seen", "Of contacts under follow up, seen in the last 24 h", ".0%"), 3),
    ("VHF contacts - lost to follow up", big_number("lost", "Lost", "Lost to follow up (3+ days missed)", ",d"), 2),
    ("VHF contacts - became cases", big_number("became_cases", "Became cases", "Contacts converted to cases", ",d"), 3),
    (
        "VHF contacts - by status",
        {
            "viz_type": "pie",
            "adhoc_filters": [],
            "groupby": ["status"],
            "metric": metric("contacts", "Contacts"),
            "row_limit": 20,
            "color_scheme": "supersetColors",
            "show_legend": True,
            "label_type": "key_value",
            "donut": True,
            "show_labels": True,
            "sort_by_metric": True,
        },
        4,
    ),
    (
        "VHF contacts - per case",
        table(
            ["source_case"],
            ["contacts", "under_follow_up", "lost", "symptomatic", "became_cases", "completeness"],
            ["Contacts", "Under follow up", "Lost", "Symptomatic", "Became cases", "Days followed up"],
        ),
        8,
    ),
    (
        "VHF contacts - follow up by sub-county",
        table(
            ["county_name", "sub_county_name"],
            ["contacts", "under_follow_up", "followed_up_24h_pct", "completeness", "lost", "became_cases"],
            ["Contacts", "Under follow up", "Seen in last 24 h", "Days followed up", "Lost", "Became cases"],
        ),
        12,
    ),
]
ROWS = [[0, 1, 2, 3, 4], [5, 6], [7]]


def main():
    app = create_app()
    with app.app_context():
        from superset.connectors.sqla.models import RowLevelSecurityFilter, SqlaTable, SqlMetric
        from superset.extensions import db, security_manager
        from superset.models.core import Database
        from superset.models.dashboard import Dashboard
        from superset.models.slice import Slice

        database = db.session.query(Database).filter_by(database_name=DATABASE_NAME).one_or_none()
        if database is None:
            print(f"SKIP: no Superset database named {DATABASE_NAME!r}; add the warehouse connection and deploy again")
            return
        # Precomputed tables, then the datasets that read them
        from refresh_tables import refresh_with_superset

        try:
            refresh_with_superset()
        except Exception as e:
            db.session.rollback()
            print(f"SKIP: could not build the precomputed VHF tables ({e}); deploy again once the warehouse is up")
            return
        for name, source in PRECOMPUTED_DATASETS.items():
            existing = db.session.query(SqlaTable).filter_by(table_name=name, database_id=database.id).one_or_none()
            if existing is None:
                print(f"SKIP dataset {name!r}: not in Superset")
                continue
            existing.sql = open(os.path.join(HERE, "datasets", source)).read() if source.endswith(".sql") else source
            db.session.commit()
            try:
                existing.fetch_metadata()  # pick up columns added to the table
            except Exception as e:
                db.session.rollback()
                print(f"could not refresh the columns of {name!r}: {e}")
            print("dataset", existing.id, name, "-> precomputed")
        db.session.commit()

        ref = db.session.query(SqlaTable).filter_by(table_name=OWNER_FROM_DATASET).one_or_none()
        admin = security_manager.find_user(username="admin")
        owners = list(ref.owners) if ref and ref.owners else ([admin] if admin else [])
        schema = ref.schema if ref else "default"

        # Dataset
        sql = "SELECT * FROM default.nphiis_vhf_contacts"  # built from datasets/vhf_contacts.sql
        ds = db.session.query(SqlaTable).filter_by(table_name=DATASET, database_id=database.id).one_or_none()
        if ds is None:
            ds = SqlaTable(table_name=DATASET, database_id=database.id, schema=schema)
            ds.owners = owners
            db.session.add(ds)
        ds.sql = sql
        ds.description = "One row per VHF contact with its 21-day follow up. Precomputed hourly from NPHIIS-superset/docker/nphiis-analytics/datasets/vhf_contacts.sql."
        db.session.commit()
        try:
            ds.fetch_metadata()
        except Exception as e:  # warehouse down or tables not built yet
            db.session.rollback()
            print(f"SKIP: could not read the dataset's columns from the warehouse ({e}); deploy again once it is up")
            return
        for name, (expr, desc, fmt) in METRICS.items():
            m = next((m for m in ds.metrics if m.metric_name == name), None)
            if m is None:
                m = SqlMetric(metric_name=name)
                ds.metrics.append(m)
            m.expression, m.description, m.d3format, m.verbose_name = expr, desc, fmt, desc
        db.session.commit()
        print("dataset", ds.id, "columns", len(ds.columns), "metrics", len(ds.metrics))

        # Row-level security
        for name, role_name, clause in RLS_RULES:
            # Create the officer roles if missing, so a rule never ends up without its role.
            role = security_manager.find_role(role_name) or security_manager.add_role(role_name)
            rule = db.session.query(RowLevelSecurityFilter).filter_by(name=name).one_or_none()
            if rule is None:
                rule = RowLevelSecurityFilter(name=name, filter_type="Regular")
                db.session.add(rule)
            rule.clause = clause
            rule.description = "VHF contact tracing: area filter (NPHIIS-superset/docker/nphiis-analytics/vhf_contacts_setup.py)."
            rule.roles = [role] if role else []
            rule.tables = [ds]
            print("rls", name, "role", role_name)
        db.session.commit()

        # Charts
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

        # Dashboard
        position = {
            "DASHBOARD_VERSION_KEY": "v2",
            "ROOT_ID": {"children": ["GRID_ID"], "id": "ROOT_ID", "type": "ROOT"},
            "HEADER_ID": {"id": "HEADER_ID", "meta": {"text": DASHBOARD}, "type": "HEADER"},
            "GRID_ID": {"children": [], "id": "GRID_ID", "parents": ["ROOT_ID"], "type": "GRID"},
        }
        for r, row in enumerate(ROWS):
            row_id = f"ROW-vhfc-{r}"
            position["GRID_ID"]["children"].append(row_id)
            position[row_id] = {
                "children": [], "id": row_id, "type": "ROW",
                "meta": {"background": "BACKGROUND_TRANSPARENT"}, "parents": ["ROOT_ID", "GRID_ID"],
            }
            for i in row:
                s, width = slices[i], CHARTS[i][2]
                chart_id = f"CHART-vhfc-{r}-{i}"
                position[row_id]["children"].append(chart_id)
                position[chart_id] = {
                    "children": [], "id": chart_id, "type": "CHART",
                    "meta": {"chartId": s.id, "sliceName": s.slice_name, "width": width,
                             "height": 30 if r == 0 else 60, "uuid": str(s.uuid)},
                    "parents": ["ROOT_ID", "GRID_ID", row_id],
                }
        dash = db.session.query(Dashboard).filter_by(dashboard_title=DASHBOARD).one_or_none()
        if dash is None:
            dash = Dashboard(dashboard_title=DASHBOARD, slug="vhf-contact-tracing")
            dash.owners = owners
            db.session.add(dash)
        dash.slices = slices
        dash.position_json = json.dumps(position)
        dash.json_metadata = json.dumps({
            "color_scheme": "supersetColors",
            "label_colors": {"active": "#1565C0", "lost": "#EF6C00", "flagged": "#C62828",
                             "converted": "#6A1B9A", "completed": "#2E7D32"},
            "refresh_frequency": 0,
            "cross_filters_enabled": True,
        })
        dash.published = True
        db.session.commit()
        print("dashboard", dash.id, dash.dashboard_title, "charts", len(dash.slices))

        transmission_network(db, Slice, Dashboard)

        # Embedding for the admin portal
        from superset.models.embedded_dashboard import EmbeddedDashboard

        domains = set(d.strip() for d in os.environ.get("EMBED_DOMAINS", "").split(",") if d.strip())
        for e in db.session.query(EmbeddedDashboard).all():
            domains.update(e.allowed_domains or [])
        for title, embed_uuid in EMBEDS.items():
            d = db.session.query(Dashboard).filter_by(dashboard_title=title).one_or_none()
            if d is None:
                print(f"SKIP embed: no dashboard {title!r}")
                continue
            e = db.session.query(EmbeddedDashboard).filter_by(dashboard_id=d.id).one_or_none()
            if e is None:
                e = EmbeddedDashboard(dashboard_id=d.id)
                db.session.add(e)
            if str(e.uuid) != embed_uuid:
                import uuid as _uuid
                e.uuid = _uuid.UUID(embed_uuid)
            e.allow_domain_list = ",".join(sorted(domains))
            db.session.commit()
            print("embed", title, e.uuid, "domains", len(e.allowed_domains))


# The transmission chains as a force-directed network: one edge per (source case -> record), node
# names from the dataset's "Network Source"/"Network Target" columns (unique per record), colours
# by node type. Node size grows with the number of edges and only nodes with more than one edge
# (cases, contacts who became cases) are labelled, so the hundreds of contacts stay quiet dots.
TREE_CHART = "VHF Transmission Tree"
TREE_DASHBOARD = "VHF / Ebola Surveillance"
NODE_COLORS = {
    "Index case": "#C62828",
    "Secondary case": "#EF6C00",
    "Contact became case": "#6A1B9A",
    "Contact": "#1E88E5",
}
NETWORK_PARAMS = {
    "viz_type": "graph_chart",
    "source": "Network Source",
    "target": "Network Target",
    "source_category": "Source Node Type",
    "target_category": "Node Type",
    "metric": {"expressionType": "SQL", "sqlExpression": "COUNT(*)", "label": "Links", "hasCustomLabel": True},
    "adhoc_filters": [{
        "expressionType": "SIMPLE", "subject": "Network Source", "operator": "IS NOT NULL",
        "comparator": None, "clause": "WHERE", "isExtra": False,
    }],
    "row_limit": 10000,
    "color_scheme": "supersetColors",
    "show_legend": True,
    "legendType": "scroll",
    "legendOrientation": "top",
    "layout": "force",
    "edgeSymbol": "none,arrow",
    "draggable": True,
    "roam": True,
    "selectedMode": "single",
    "showSymbolThreshold": 1,
    "baseNodeSize": 18,
    "baseEdgeWidth": 1,
    "edgeLength": 70,
    "repulsion": 140,
    "gravity": 0.12,
    "friction": 0.15,
    "annotation_layers": [],
}


def transmission_network(db, Slice, Dashboard):
    s = db.session.query(Slice).filter_by(slice_name=TREE_CHART).one_or_none()
    if s is None:
        print(f"SKIP network: no chart {TREE_CHART!r}")
        return
    # Keep the chart's dataset: the Spark one or its Postgres twin (vhf_postgres_setup.py --switch).
    s.viz_type = NETWORK_PARAMS["viz_type"]
    s.params = json.dumps({**NETWORK_PARAMS, "datasource": f"{s.datasource_id}__table"})
    s.query_context = None
    dash = db.session.query(Dashboard).filter_by(dashboard_title=TREE_DASHBOARD).one_or_none()
    if dash is not None:
        meta = json.loads(dash.json_metadata or "{}")
        meta["label_colors"] = {**meta.get("label_colors", {}), **NODE_COLORS}
        dash.json_metadata = json.dumps(meta)
    db.session.commit()
    print("chart", s.id, TREE_CHART, "-> network graph")


if __name__ == "__main__":
    main()

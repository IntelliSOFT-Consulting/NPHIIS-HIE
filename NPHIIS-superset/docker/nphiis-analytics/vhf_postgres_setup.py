"""The VHF dashboards on the analytics Postgres (pilot of moving Superset off Spark).

    python vhf_postgres_setup.py            create or update the Postgres side (safe, additive)
    python vhf_postgres_setup.py --check    also run every VHF chart's metrics and filters on Postgres
    python vhf_postgres_setup.py --compare  run each VHF chart on Spark and on Postgres and compare the numbers
    python vhf_postgres_setup.py --switch   point the VHF charts and dashboard filters at Postgres
    python vhf_postgres_setup.py --revert   point them back at the Spark datasets

Run inside the Superset container, e.g.
    sudo docker exec superset_app python /app/docker/nphiis-analytics/vhf_postgres_setup.py --check

The Postgres side: the database "NPHIIS Analytics (Postgres)" (ANALYTICS_DB_URI, the read-only
superset_ro login) and one dataset per Spark VHF dataset, named "<Spark name> (Postgres)", from
postgres/*.sql. Each copies its Spark twin's column settings and metrics (translated) and is
added to the same row-level security rules. The SQL reads the pipeline's sink tables directly,
so the dashboards follow every pipeline run; there is nothing to refresh.

--switch moves each chart of the Spark VHF datasets to its Postgres twin, translating the SQL in
its metrics and filters (backticks, DATEDIFF, YEAR, integer division), and retargets the
dashboards' native filters. The charts' Spark settings are saved first (BACKUP); --revert
restores them. Deploys (docker-init.sh step 5) re-apply --switch when NPHIIS_VHF_SOURCE=postgres,
because vhf_contacts_setup.py rewrites the contact-tracing charts for Spark on every deploy.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "postgres"))
from render import render  # noqa: E402

DATABASE_NAME = "NPHIIS Analytics (Postgres)"
SPARK_DATABASE = "Apache Hive"
SUFFIX = " (Postgres)"
# Spark dataset -> Postgres SQL file
DATASETS = {
    "VHF Line List": "vhf_line_list.sql",
    "VHF Transmission Tree": "vhf_transmission_tree.sql",
    "VHF County Map": "vhf_county_map.sql",
    "vhf_contacts": "vhf_contacts.sql",
}
BACKUP = "/app/superset_home/nphiis_vhf_spark_charts.json"
COLUMN_ATTRS = ("is_dttm", "verbose_name", "description", "filterable", "groupby", "python_date_format")
SQL_KEYS = ("sqlExpression", "where", "having")


def _call_args(sql, start):
    """Splits the arguments of the call whose '(' is at sql[start]; returns (args, end)."""
    depth, args, cur, i = 0, [], "", start
    while i < len(sql):
        ch = sql[i]
        if ch == "(":
            depth += 1
            if depth > 1:
                cur += ch
        elif ch == ")":
            depth -= 1
            if depth == 0:
                args.append(cur.strip())
                return args, i + 1
            cur += ch
        elif ch == "," and depth == 1:
            args.append(cur.strip())
            cur = ""
        elif ch == "'":
            j = sql.index("'", i + 1)
            cur += sql[i:j + 1]
            i = j
        else:
            cur += ch
        i += 1
    raise ValueError(f"unbalanced parentheses in {sql!r}")


def _replace_calls(sql, name, build):
    out, i = "", 0
    pattern = re.compile(rf"\b{name}\s*\(", re.I)
    while True:
        m = pattern.search(sql, i)
        if not m:
            return out + sql[i:]
        args, end = _call_args(sql, m.end() - 1)
        out += sql[i:m.start()] + build([to_postgres(a) for a in args])
        i = end


def to_postgres(sql):
    """Spark SQL as written in the VHF charts -> Postgres."""
    sql = sql.replace("`", '"')
    sql = re.sub(r"\bCURRENT_DATE\s*\(\s*\)", "CURRENT_DATE", sql, flags=re.I)
    sql = _replace_calls(sql, "DATEDIFF", lambda a: f"(({a[0]}) - ({a[1]}))")
    sql = _replace_calls(sql, "YEAR", lambda a: f"EXTRACT(YEAR FROM {a[0]})")
    # Spark's / is always fractional; Postgres divides integers as integers.
    sql = re.sub(r"\)\s*/\s*NULLIF\s*\(", ")::numeric / NULLIF(", sql)
    return sql


def _translate(obj):
    if isinstance(obj, dict):
        return {k: (to_postgres(v) if k in SQL_KEYS and isinstance(v, str) else _translate(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_translate(v) for v in obj]
    return obj


def _sql_fragments(params):
    """(kind, sql) pairs of a chart's custom SQL: metrics and SQL filters."""
    found = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("expressionType") == "SQL" and isinstance(o.get("sqlExpression"), str):
                kind = "filter" if "clause" in o else "metric"
                found.append((kind, o["sqlExpression"]))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(params)
    return found


def _pg_type_to_superset(pg_oid):
    TEXT_OIDS  = {25, 1043, 19, 18, 1042, 2950}
    FLOAT_OIDS = {700, 701, 1700}
    INT_OIDS   = {20, 21, 23, 26}
    DATE_OIDS  = {1082, 1114, 1184}
    if pg_oid in TEXT_OIDS:   return "TEXT"
    if pg_oid in FLOAT_OIDS:  return "FLOAT"
    if pg_oid in INT_OIDS:    return "BIGINT"
    if pg_oid in DATE_OIDS:   return "DATETIME"
    return "TEXT"


def _sync_columns_from_sql(pg_db, ds, sql_file):
    """Fallback column sync when fetch_metadata() fails (Jinja2 role-gated SQL)."""
    import psycopg2
    from superset.connectors.sqla.models import TableColumn
    from superset.extensions import db

    HERE_PG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "postgres")
    with open(os.path.join(HERE_PG, sql_file)) as f:
        raw = f.read()

    m = re.search(r"(SELECT\s.+?WHERE\s+1\s*=\s*0)", raw, re.DOTALL | re.IGNORECASE)
    if m:
        probe_sql = f"SELECT * FROM ({m.group(1)}) _probe LIMIT 0"
    else:
        stripped = re.sub(r"\{%[^%]*%\}", "", raw)
        stripped = re.sub(r"\{\{[^}]*\}\}", "NULL", stripped).strip()
        probe_sql = f"SELECT * FROM ({stripped}) _probe LIMIT 0"

    try:
        uri = pg_db.sqlalchemy_uri_decrypted
        m2 = re.match(r"postgresql\+psycopg2://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)", uri)
        if not m2:
            print(f"  schema probe: cannot parse URI"); return
        user, pwd, host, port, dbname = m2.groups()
        conn = psycopg2.connect(host=host, port=int(port or 5432), dbname=dbname, user=user, password=pwd)
        cur = conn.cursor()
        cur.execute(probe_sql)
        col_info = [(d[0], d[1]) for d in cur.description]
        cur.close(); conn.close()

        existing = {c.column_name for c in ds.columns}
        added = 0
        for cname, type_oid in col_info:
            if cname in existing:
                continue
            col_type = _pg_type_to_superset(type_oid)
            db.session.add(TableColumn(
                table_id=ds.id, column_name=cname, type=col_type,
                is_dttm=(col_type == "DATETIME"), filterable=True, groupby=True,
            ))
            added += 1
        db.session.commit()
        print(f"  schema probe: +{added} columns for {ds.table_name}")
    except Exception as e:
        print(f"  schema probe failed for {ds.table_name}: {e}")


def main(mode):
    from superset.app import create_app

    app = create_app()
    with app.app_context():
        from superset.connectors.sqla.models import RowLevelSecurityFilter, SqlaTable, SqlMetric
        from superset.extensions import db
        from superset.models.core import Database
        from superset.models.dashboard import Dashboard
        from superset.models.slice import Slice

        spark_db = db.session.query(Database).filter_by(database_name=SPARK_DATABASE).one_or_none()
        pg = db.session.query(Database).filter_by(database_name=DATABASE_NAME).one_or_none()
        uri = os.environ.get("ANALYTICS_DB_URI")
        if pg is None and not uri:
            print("SKIP: ANALYTICS_DB_URI is not set (NPHIIS-superset/docker/.env)")
            return
        if pg is None:
            pg = Database(database_name=DATABASE_NAME)
            db.session.add(pg)
        if uri:
            pg.set_sqlalchemy_uri(uri)
        pg.expose_in_sqllab = True
        pg.allow_run_async = False
        db.session.commit()

        # Datasets: Spark twin -> Postgres dataset
        twins = {}
        for name, file in DATASETS.items():
            spark = db.session.query(SqlaTable).filter_by(table_name=name, database_id=spark_db.id).one_or_none() if spark_db else None
            ds = db.session.query(SqlaTable).filter_by(table_name=name + SUFFIX, database_id=pg.id).one_or_none()
            if ds is None:
                ds = SqlaTable(table_name=name + SUFFIX, database_id=pg.id, schema="public")
                ds.owners = list(spark.owners) if spark else []
                db.session.add(ds)
            ds.sql = render(file)
            ds.description = f"{name} on the analytics Postgres (NPHIIS-superset/docker/nphiis-analytics/postgres/{file})."
            if spark:
                ds.main_dttm_col = spark.main_dttm_col
                ds.filter_select_enabled = spark.filter_select_enabled
                ds.extra = spark.extra
            db.session.commit()
            try:
                ds.fetch_metadata()
            except Exception as e:
                print(f"  (fetch_metadata failed: {str(e).splitlines()[0]}; probing schema)")
            if not ds.columns:
                _sync_columns_from_sql(pg, ds, file)
            if spark:
                by_name = {c.column_name: c for c in spark.columns}
                for col in ds.columns:
                    src = by_name.get(col.column_name)
                    if src is not None:
                        for attr in COLUMN_ATTRS:
                            setattr(col, attr, getattr(src, attr))
                for sm in spark.metrics:
                    m = next((m for m in ds.metrics if m.metric_name == sm.metric_name), None)
                    if m is None:
                        m = SqlMetric(metric_name=sm.metric_name)
                        ds.metrics.append(m)
                    m.expression = to_postgres(sm.expression)
                    m.verbose_name, m.description, m.d3format = sm.verbose_name, sm.description, sm.d3format
                for rule in db.session.query(RowLevelSecurityFilter).all():
                    if spark in rule.tables and ds not in rule.tables:
                        rule.tables.append(ds)
                twins[spark.id] = ds
            db.session.commit()
            print("dataset", ds.id, ds.table_name, "columns", len(ds.columns), "metrics", len(ds.metrics))

        charts = db.session.query(Slice).filter(
            Slice.datasource_type == "table", Slice.datasource_id.in_(list(twins) + [d.id for d in twins.values()])
        ).all()

        if mode == "check":
            failures = 0
            for s in charts:
                params = json.loads(s.params or "{}")
                ds = twins.get(s.datasource_id) or next(d for d in twins.values() if d.id == s.datasource_id)
                frags = _sql_fragments(params if s.datasource_id not in twins else _translate(params))
                inner = ds.get_template_processor().process_template(ds.sql)
                for kind, frag in frags:
                    sql = (f"SELECT {frag} FROM ({inner}) t" if kind == "metric"
                           else f"SELECT COUNT(*) FROM ({inner}) t WHERE {frag}")
                    try:  # a raw cursor without parameters, as Superset runs queries ('%' stays literal)
                        with pg.get_raw_connection() as conn:
                            cur = conn.cursor()
                            cur.execute(sql)
                            cur.fetchall()
                    except Exception as e:  # report every failure, not just the first
                        failures += 1
                        print(f"FAIL chart {s.id} {s.slice_name!r} {kind}: {frag}\n     {str(e).splitlines()[0]}")
            print(f"checked {len(charts)} charts: {failures} failing fragments")
            if failures:
                sys.exit(1)
            return

        if mode == "compare":
            spark_by_id = {i: db.session.get(SqlaTable, i) for i in twins}
            differ = 0
            for s in sorted(charts, key=lambda c: c.id):
                if s.datasource_id not in twins:
                    continue  # already switched: nothing on Spark to compare with
                params = json.loads(s.params or "{}")
                spark_rows = _chart_rows(spark_db, spark_by_id[s.datasource_id], params, spark=True)
                pg_rows = _chart_rows(pg, twins[s.datasource_id], _translate(params), spark=False)
                same = spark_rows == pg_rows
                differ += not same
                print(f"{'same ' if same else 'DIFF '} chart {s.id} {s.slice_name!r}: {len(pg_rows)} row(s)"
                      + ("" if same else f"\n      spark {sorted(spark_rows - pg_rows)[:5]}\n      pg    {sorted(pg_rows - spark_rows)[:5]}"))
            print(f"compared {len(charts)} charts: {differ} differ")
            return

        if mode == "switch":
            backup = json.load(open(BACKUP)) if os.path.exists(BACKUP) else {}
            moved = 0
            for s in charts:
                if s.datasource_id not in twins:
                    continue  # already on Postgres
                backup[str(s.id)] = {"datasource_id": s.datasource_id, "params": s.params, "query_context": s.query_context}
                ds = twins[s.datasource_id]
                params = _translate(json.loads(s.params or "{}"))
                params["datasource"] = f"{ds.id}__table"
                s.datasource_id, s.params, s.query_context = ds.id, json.dumps(params), None
                moved += 1
            with open(BACKUP, "w") as f:
                json.dump(backup, f)
            ids = {spark_id: ds.id for spark_id, ds in twins.items()}
            _retarget_filters(db, Dashboard, charts, ids)
            db.session.commit()
            print(f"switched {moved} charts to Postgres (Spark settings saved in {BACKUP})")
            return

        if mode == "revert":
            backup = json.load(open(BACKUP)) if os.path.exists(BACKUP) else {}
            back = 0
            for s in charts:
                saved = backup.get(str(s.id))
                if saved is None or s.datasource_id in twins:
                    continue
                s.datasource_id, s.params, s.query_context = saved["datasource_id"], saved["params"], saved["query_context"]
                back += 1
            ids = {ds.id: spark_id for spark_id, ds in twins.items()}
            _retarget_filters(db, Dashboard, charts, ids)
            db.session.commit()
            print(f"reverted {back} charts to Spark")


def _chart_rows(database, ds, params, spark):
    """What a chart shows, approximately: its metrics by its grouping columns under its SQL and
    simple filters, as a set of rounded tuples. Raw tables and the tree: their row count."""
    q = (lambda c: f"`{c}`") if spark else (lambda c: f'"{c}"')
    saved = {m.metric_name: m.expression for m in ds.metrics}
    metrics = params.get("metrics") or ([params["metric"]] if params.get("metric") else [])
    exprs = []
    for m in metrics:
        if isinstance(m, str):
            exprs.append(saved[m])
        elif m.get("expressionType") == "SQL":
            exprs.append(m["sqlExpression"])
        else:
            exprs.append(f"{m['aggregate']}({q(m['column']['column_name'])})")
    groups = list(params.get("groupby") or [])
    for key in ("x_axis", "line_column"):
        if isinstance(params.get(key), str):
            groups.append(params[key])
    where = []
    for f in params.get("adhoc_filters") or []:
        if f.get("expressionType") == "SQL" and f.get("clause") == "WHERE":
            where.append(f"({f['sqlExpression']})")
        elif f.get("expressionType") == "SIMPLE" and f.get("operator") == "IN":
            vals = ", ".join("'" + str(v).replace("'", "''") + "'" for v in f["comparator"])
            where.append(f"{q(f['subject'])} IN ({vals})")
    if params.get("query_mode") == "raw" or not exprs:
        exprs, groups = ["COUNT(*)"], []
    inner = ds.get_template_processor().process_template(ds.sql)
    sql = (f"SELECT {', '.join([q(g) for g in groups] + exprs)} FROM ({inner}) t"
           + (f" WHERE {' AND '.join(where)}" if where else "")
           + (f" GROUP BY {', '.join(q(g) for g in groups)}" if groups else ""))
    with database.get_raw_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql)
        rows = cur.fetchall()

    def norm(v):
        if v is None:
            return None
        try:
            return round(float(v), 6)
        except (TypeError, ValueError):
            return str(v)

    return {tuple(norm(v) for v in row) for row in rows}


def _retarget_filters(db, Dashboard, charts, ids):
    """Points the native filters of the dashboards holding [charts] at the mapped datasets."""
    chart_ids = {c.id for c in charts}
    for dash in db.session.query(Dashboard).all():
        if not chart_ids & {s.id for s in dash.slices}:
            continue
        meta = json.loads(dash.json_metadata or "{}")
        changed = 0
        for flt in meta.get("native_filter_configuration", []):
            for target in flt.get("targets", []):
                if target.get("datasetId") in ids:
                    target["datasetId"] = ids[target["datasetId"]]
                    changed += 1
        if changed:
            dash.json_metadata = json.dumps(meta)
            print("dashboard", dash.id, dash.dashboard_title, "filters retargeted", changed)


if __name__ == "__main__":
    flags = {"--check": "check", "--compare": "compare", "--switch": "switch", "--revert": "revert"}
    main(next((flags[a] for a in sys.argv[1:] if a in flags), "setup"))

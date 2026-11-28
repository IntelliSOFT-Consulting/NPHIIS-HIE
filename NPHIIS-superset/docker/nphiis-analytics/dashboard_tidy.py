"""Readability fixes for the embedded IDSR and AFP dashboards (same charts, same data).

    sudo docker exec superset_app python /app/docker/nphiis-analytics/dashboard_tidy.py

Runs on every deploy; the data shown stays the same:

- KPI tiles (big numbers) are at most KPI_HEIGHT tall: they were 256px for one number.
- Line lists (tables with many columns) are at most LIST_HEIGHT tall so a page fits a screen,
  show dates without "00:00:00", page 25 rows with search, keep each column once, and drop
  columns that hold the same value on every row (CountryCode is always "KEN").
- A line list built as an aggregate table without metrics (GROUP BY every column, i.e. distinct
  rows) becomes a raw-records table of the same columns. With names masked for non-admins
  (can_view_pii), distinct rows merged different patients: MOH 503 showed 211 of 318 records.

Filters and metrics are left as they are. Charts are found through their
dashboards by title, so the script works on any environment whatever the ids.
"""
import json

from guest_qc import apply_guest_query_context

DASHBOARDS = ("IDSR Case Based Surveillance", "AFP Surveillance Dashboard")
KPI_HEIGHT = 22
LIST_HEIGHT = 100
LIST_MIN_COLUMNS = 12
DROP_COLUMNS = {"CountryCode"}
LIST_PARAMS = {"table_timestamp_format": "%d/%m/%Y", "page_length": 25, "include_search": True}


def _dedupe(values):
    out = []
    for v in values:
        if v not in out and v not in DROP_COLUMNS:
            out.append(v)
    return out


def _is_list(params):
    cols = params.get("all_columns") if params.get("query_mode") == "raw" else params.get("groupby")
    return params.get("viz_type") == "table" and len(cols or []) >= LIST_MIN_COLUMNS


def tidy(dash):
    slices = {s.id: s for s in dash.slices}
    position = json.loads(dash.position_json or "{}")
    resized, tuned = 0, 0
    for node in position.values():
        if not isinstance(node, dict) or node.get("type") != "CHART":
            continue
        meta = node.get("meta", {})
        s = slices.get(meta.get("chartId"))
        if s is None:
            continue
        params = json.loads(s.params or "{}")
        limit = KPI_HEIGHT if s.viz_type == "big_number_total" else LIST_HEIGHT if _is_list(params) else None
        if limit and (meta.get("height") or 0) > limit:
            meta["height"] = limit
            resized += 1
    dash.position_json = json.dumps(position)

    for s in slices.values():
        params = json.loads(s.params or "{}")
        if not _is_list(params):
            continue
        new = {**params, **LIST_PARAMS}
        if new.get("query_mode") != "raw" and not new.get("metrics") and not new.get("percent_metrics"):
            cols = _dedupe(new.get("groupby") or [])
            # Raw mode reads all_columns and columns (and ignores groupby); reset both, as
            # all_columns may still hold names from an older version of the chart.
            new.update(query_mode="raw", all_columns=cols, columns=cols)
        for key in ("groupby", "all_columns", "columns"):
            if isinstance(new.get(key), list):
                new[key] = _dedupe(new[key])
        if new != params:
            apply_guest_query_context(s, new)
            tuned += 1
    print(f"{dash.dashboard_title!r}: resized {resized} tiles, tidied {tuned} line lists")


def main():
    from superset.app import create_app

    with create_app().app_context():
        from superset.extensions import db
        from superset.models.dashboard import Dashboard

        for title in DASHBOARDS:
            dash = db.session.query(Dashboard).filter_by(dashboard_title=title).one_or_none()
            if dash is None:
                print(f"SKIP: no dashboard {title!r}")
                continue
            tidy(dash)
        db.session.commit()


if __name__ == "__main__":
    main()

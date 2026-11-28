"""Tabbed layout for the "VHF / Ebola Surveillance" dashboard (same charts, easier to read).

    sudo docker exec superset_app python /app/docker/nphiis-analytics/vhf_dashboard_layout.py [--force]

The dashboard was one ~5,300px column (KPIs, maps, a scroll-trapping transmission tree and three
line lists), which is hard to read on Superset and worse inside the portal's embed. This puts
the same charts into tabs that each fit about one screen:

    Overview      case KPIs, response KPIs, epi curve + classification, cases by county + maps
    Contacts      contact KPIs, monitoring status + follow-up map, contacts who became cases
    Transmission  the transmission tree on its own (it zooms on scroll)
    Line lists    case / contact / alert line lists, one sub-tab each

and tidies chart settings that made them hard to read (horizontal county bars, map legends
out of the way, id columns that do not wrap one segment per line).

The layout is built once: a dashboard that already has tabs keeps its layout so later edits in
the Superset UI survive deploys (--force rebuilds it). The chart settings below are re-applied
on every run. Charts are matched by name, so it works on any
environment whatever the chart ids. A chart it does not know is kept, in an "Other" row of the
Overview tab, rather than dropped.
"""
import json
import sys

from guest_qc import apply_guest_query_context

DASHBOARD = "VHF / Ebola Surveillance"

# Tab -> rows -> (chart name, width, height). Grid: 12 columns; height units are 8px.
TABS = [
    ("overview", "Overview", [
        [("Suspected Cases", 3, 22), ("Probable Cases", 3, 22), ("Confirmed Cases", 3, 22), ("Deaths", 3, 22)],
        [("Case Fatality Rate", 3, 22), ("Days Since Last Confirmed Case", 3, 22),
         ("Lab Turnaround", 3, 22), ("Contacts Seen in Last 24h", 3, 22)],
        [("Epi Curve by Week of Onset", 8, 55), ("Cases by Classification", 4, 55)],
        [("Cases by County", 4, 60), ("Map of Cases", 4, 60), ("Map of Confirmed Cases", 4, 60)],
    ]),
    ("contacts", "Contacts", [
        [("Contacts Under Follow Up", 6, 22), ("Contacts Who Became Cases", 6, 22)],
        [("Contacts by Monitoring Status", 5, 60), ("Map of Contacts Under Follow Up", 7, 60)],
        [("Contacts Who Became Cases List", 12, 50)],
    ]),
    ("transmission", "Transmission", [
        [("VHF Transmission Tree", 12, 110)],
    ]),
]
LINE_LISTS = [
    ("cases", "Cases", "VHF Case Line List"),
    ("contacts", "Contacts", "VHF Contact Line List"),
    ("alerts", "Alerts", "Alert Log - line list"),
]
LINE_LIST_HEIGHT = 100

# Chart settings that read better; merged into each chart's params.
ID_COLUMN = {"columnWidth": 230, "horizontalAlign": "left"}
CHART_PARAMS = {
    # Vertical bars dropped county labels and hid which county the tallest bar was.
    # Horizontal bars list the first category at the bottom: ascending puts the biggest on top.
    "Cases by County": {"orientation": "horizontal", "x_axis_sort": "sum", "x_axis_sort_asc": True,
                        "x_axis_title": "", "y_axis_title": "Records", "legendType": "plain"},
    # Paged legends ("1/3") and cut labels ("Susp…") in narrow tiles: wrap instead.
    "Cases by Classification": {"legendType": "plain", "label_type": "value"},
    "Contacts by Monitoring Status": {"legendType": "plain", "label_type": "value"},
    "Epi Curve by Week of Onset": {"x_axis_time_format": "%d %b %Y"},
    "Map of Cases": {"legend_position": "tl"},
    "Map of Confirmed Cases": {"legend_position": "tl"},
    "Map of Contacts Under Follow Up": {"legend_position": "tl"},
    "VHF Case Line List": {"column_config": {"EPID": ID_COLUMN, "Source EPID": ID_COLUMN}},
    "VHF Contact Line List": {"column_config": {"Contact ID": ID_COLUMN, "Source EPID": ID_COLUMN}},
    "Contacts Who Became Cases List": {"column_config": {"Person EPID": ID_COLUMN}},
}


def _chart(pos, cid, slice_, width, height, parents):
    pos[cid] = {
        "children": [], "id": cid, "type": "CHART", "parents": parents,
        "meta": {"chartId": slice_.id, "sliceName": slice_.slice_name, "width": width,
                 "height": height, "uuid": str(slice_.uuid)},
    }


def _row(pos, rid, parents):
    pos[rid] = {"children": [], "id": rid, "type": "ROW", "parents": parents,
                "meta": {"background": "BACKGROUND_TRANSPARENT"}}
    return pos[rid]


def _tab(pos, tid, text, parents):
    pos[tid] = {"children": [], "id": tid, "type": "TAB", "parents": parents,
                "meta": {"text": text, "defaultText": "Tab title", "placeholder": "Tab title"}}
    return pos[tid]


def build_position(title, by_name):
    """position_json for the tabbed layout; by_name maps chart name -> Slice."""
    pos = {
        "DASHBOARD_VERSION_KEY": "v2",
        "ROOT_ID": {"children": ["GRID_ID"], "id": "ROOT_ID", "type": "ROOT"},
        "HEADER_ID": {"id": "HEADER_ID", "meta": {"text": title}, "type": "HEADER"},
        "GRID_ID": {"children": ["TABS-vhf"], "id": "GRID_ID", "parents": ["ROOT_ID"], "type": "GRID"},
        "TABS-vhf": {"children": [], "id": "TABS-vhf", "type": "TABS", "meta": {},
                     "parents": ["ROOT_ID", "GRID_ID"]},
    }
    top = ["ROOT_ID", "GRID_ID", "TABS-vhf"]
    placed = set()

    for key, text, rows in TABS:
        tid = f"TAB-vhf-{key}"
        pos["TABS-vhf"]["children"].append(tid)
        tab = _tab(pos, tid, text, top)
        for r, row in enumerate(rows):
            rid = f"ROW-vhf-{key}-{r}"
            row_node = None
            for c, (name, width, height) in enumerate(row):
                s = by_name.get(name)
                if s is None:
                    print(f"  missing chart {name!r}: left out")
                    continue
                if row_node is None:
                    tab["children"].append(rid)
                    row_node = _row(pos, rid, top + [tid])
                cid = f"CHART-vhf-{key}-{r}-{c}"
                row_node["children"].append(cid)
                _chart(pos, cid, s, width, height, top + [tid, rid])
                placed.add(name)

    # Line lists: one sub-tab each, so a table gets the whole screen.
    tid = "TAB-vhf-lists"
    pos["TABS-vhf"]["children"].append(tid)
    tab = _tab(pos, tid, "Line lists", top)
    tab["children"].append("TABS-vhf-lists")
    inner = top + [tid, "TABS-vhf-lists"]
    pos["TABS-vhf-lists"] = {"children": [], "id": "TABS-vhf-lists", "type": "TABS", "meta": {},
                             "parents": top + [tid]}
    for key, text, name in LINE_LISTS:
        s = by_name.get(name)
        if s is None:
            print(f"  missing chart {name!r}: left out")
            continue
        sub = f"TAB-vhf-list-{key}"
        pos["TABS-vhf-lists"]["children"].append(sub)
        sub_tab = _tab(pos, sub, text, inner)
        rid, cid = f"ROW-vhf-list-{key}", f"CHART-vhf-list-{key}"
        sub_tab["children"].append(rid)
        _row(pos, rid, inner + [sub])["children"].append(cid)
        _chart(pos, cid, s, 12, LINE_LIST_HEIGHT, inner + [sub, rid])
        placed.add(name)

    # Anything else already on the dashboard stays visible.
    others = [s for name, s in sorted(by_name.items()) if name not in placed]
    if others:
        ov = "TAB-vhf-overview"
        for i in range(0, len(others), 3):
            rid = f"ROW-vhf-other-{i // 3}"
            pos[ov]["children"].append(rid)
            row_node = _row(pos, rid, top + [ov])
            for j, s in enumerate(others[i:i + 3]):
                cid = f"CHART-vhf-other-{i + j}"
                row_node["children"].append(cid)
                _chart(pos, cid, s, 4, 50, top + [ov, rid])
                print(f"  kept unknown chart {s.slice_name!r} on Overview")
    return pos


def main(force):
    from superset.app import create_app

    with create_app().app_context():
        from superset.extensions import db
        from superset.models.dashboard import Dashboard

        dash = db.session.query(Dashboard).filter_by(dashboard_title=DASHBOARD).one_or_none()
        if dash is None:
            print(f"SKIP: no dashboard {DASHBOARD!r}")
            return
        by_name = {s.slice_name: s for s in dash.slices}
        old = json.loads(dash.position_json or "{}")
        if not force and any(isinstance(v, dict) and v.get("type") == "TABS" for v in old.values()):
            print(f"{DASHBOARD!r} already has tabs: layout kept (use --force to rebuild)")
            position = old
        else:
            position = build_position(dash.dashboard_title, by_name)
            # Native filters keep applying to every chart, now spread over tabs.
            meta = json.loads(dash.json_metadata or "{}")
            tab_ids = [k for k, v in position.items() if isinstance(v, dict) and v.get("type") == "TAB"]
            for f in meta.get("native_filter_configuration", []):
                if "tabsInScope" in f or f.get("scope"):
                    f["tabsInScope"] = tab_ids
            dash.json_metadata = json.dumps(meta)
            dash.position_json = json.dumps(position)
        tab_ids = [k for k, v in position.items() if isinstance(v, dict) and v.get("type") == "TAB"]

        for name, extra in CHART_PARAMS.items():
            s = by_name.get(name)
            if s is None:
                continue
            params = json.loads(s.params or "{}")
            for key, value in extra.items():
                if isinstance(value, dict) and isinstance(params.get(key), dict):
                    params[key] = {**params[key], **value}
                else:
                    params[key] = value
            apply_guest_query_context(s, params)
        db.session.commit()
        print(f"{DASHBOARD!r}: {len(tab_ids)} tabs, {len(by_name)} charts, tuned {len(CHART_PARAMS)} charts")


if __name__ == "__main__":
    main("--force" in sys.argv[1:])

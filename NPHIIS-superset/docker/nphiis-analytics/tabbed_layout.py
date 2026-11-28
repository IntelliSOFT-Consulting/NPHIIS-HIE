"""Put an existing dashboard's charts into tabs (shared by the dashboard layout scripts).

A layout is [(tab key, tab title, rows)], each row [(chart name, width, height)] on Superset's
12-column grid (height units are 8px). Charts are matched by name, so the same layout works on
every environment. A chart on the dashboard that the layout does not name is kept, in extra
rows on the first tab, rather than dropped.

apply_layout builds the tabs once: a dashboard that already has tabs keeps its layout so edits
made later in the Superset UI survive deploys, unless force=True.
"""
import json


def _chart(pos, cid, slice_, width, height, parents):
    pos[cid] = {
        "children": [], "id": cid, "type": "CHART", "parents": parents,
        "meta": {"chartId": slice_.id, "sliceName": slice_.slice_name, "width": width,
                 "height": height, "uuid": str(slice_.uuid)},
    }


def build_position(prefix, title, tabs, by_name):
    """position_json for `tabs`; by_name maps chart name -> Slice."""
    root_tabs = f"TABS-{prefix}"
    pos = {
        "DASHBOARD_VERSION_KEY": "v2",
        "ROOT_ID": {"children": ["GRID_ID"], "id": "ROOT_ID", "type": "ROOT"},
        "HEADER_ID": {"id": "HEADER_ID", "meta": {"text": title}, "type": "HEADER"},
        "GRID_ID": {"children": [root_tabs], "id": "GRID_ID", "parents": ["ROOT_ID"], "type": "GRID"},
        root_tabs: {"children": [], "id": root_tabs, "type": "TABS", "meta": {}, "parents": ["ROOT_ID", "GRID_ID"]},
    }
    top = ["ROOT_ID", "GRID_ID", root_tabs]
    placed = set()

    def add_row(tab_id, row_id, cells):
        row = None
        for c, (name, width, height) in enumerate(cells):
            s = by_name.get(name)
            if s is None:
                print(f"  missing chart {name!r}: left out")
                continue
            if row is None:
                pos[tab_id]["children"].append(row_id)
                row = pos[row_id] = {"children": [], "id": row_id, "type": "ROW",
                                     "parents": top + [tab_id], "meta": {"background": "BACKGROUND_TRANSPARENT"}}
            cid = f"CHART-{row_id[4:]}-{c}"
            row["children"].append(cid)
            _chart(pos, cid, s, width, height, top + [tab_id, row_id])
            placed.add(name)

    for key, text, rows in tabs:
        tab_id = f"TAB-{prefix}-{key}"
        pos[root_tabs]["children"].append(tab_id)
        pos[tab_id] = {"children": [], "id": tab_id, "type": "TAB", "parents": top,
                       "meta": {"text": text, "defaultText": "Tab title", "placeholder": "Tab title"}}
        for r, cells in enumerate(rows):
            add_row(tab_id, f"ROW-{prefix}-{key}-{r}", cells)

    others = [s for name, s in sorted(by_name.items()) if name not in placed]
    first = f"TAB-{prefix}-{tabs[0][0]}"
    for i in range(0, len(others), 3):
        add_row(first, f"ROW-{prefix}-other-{i // 3}", [(s.slice_name, 4, 50) for s in others[i:i + 3]])
        for s in others[i:i + 3]:
            print(f"  kept unknown chart {s.slice_name!r} on the first tab")
    return pos


def apply_layout(dash, prefix, tabs, force=False):
    """Give `dash` the tabbed layout (once unless force). Returns True when it changed."""
    old = json.loads(dash.position_json or "{}")
    if not force and any(isinstance(v, dict) and v.get("type") == "TABS" for v in old.values()):
        print(f"{dash.dashboard_title!r} already has tabs: layout kept (use --force to rebuild)")
        return False
    by_name = {s.slice_name: s for s in dash.slices}
    position = build_position(prefix, dash.dashboard_title, tabs, by_name)
    meta = json.loads(dash.json_metadata or "{}")
    tab_ids = [k for k, v in position.items() if isinstance(v, dict) and v.get("type") == "TAB"]
    for f in meta.get("native_filter_configuration", []):
        if "tabsInScope" in f or f.get("scope"):
            f["tabsInScope"] = tab_ids
    dash.json_metadata = json.dumps(meta)
    dash.position_json = json.dumps(position)
    print(f"{dash.dashboard_title!r}: {len(tab_ids)} tabs, {len(by_name)} charts")
    return True

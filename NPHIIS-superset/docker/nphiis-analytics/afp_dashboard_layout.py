"""Tabbed layout for the "AFP Surveillance Dashboard" (same 11 charts, easier to read).

    sudo docker exec superset_app python /app/docker/nphiis-analytics/afp_dashboard_layout.py [--force]

The dashboard was one ~4,200px column. Tabs that each fit about a screen:

    Overview                  epi-week curve, AFP and true-AFP maps, classification + performance pies
    Performance indicators    county indicator table, sub-county status bars, reporting sub-counties
    Immunization & stool      immunization profile and stool adequacy pivots

The layout is built once (see tabbed_layout.apply_layout); the chart settings below are
re-applied on every run.
"""
import json
import sys

from guest_qc import apply_guest_query_context
from tabbed_layout import apply_layout

DASHBOARD = "AFP Surveillance Dashboard"
TABS = [
    ("overview", "Overview", [
        [("AFP Cases by Epi-Week", 12, 55)],
        [("AFP Cases by County", 6, 60), ("True AFP Cases by County", 6, 60)],
        [("AFP Case Classification Status", 4, 50), ("County Surveillance Performance", 4, 50),
         ("Subcounty Surveillance Performance", 4, 50)],
    ]),
    ("performance", "Performance indicators", [
        [("AFP Surveillance Performance Indicators", 12, 80)],
        [("Status of Sub-county Surveillance Indicators by County", 12, 70)],
        [("Subcounties that have reported cases", 12, 80)],
    ]),
    ("immunization", "Immunization & stool", [
        [("Immunization Profile 6-59m by County", 6, 70), ("Stool Adequacy % by County & Year", 6, 70)],
    ]),
]
# Paged legends ("1/3") in narrow tiles: wrap them instead.
CHART_PARAMS = {
    "AFP Cases by Epi-Week": {"legendType": "plain"},
    "Status of Sub-county Surveillance Indicators by County": {"legendType": "plain"},
    "County Surveillance Performance": {"legendType": "plain"},
    "Subcounty Surveillance Performance": {"legendType": "plain"},
    "AFP Cases by County": {"legend_position": "tl"},
    "True AFP Cases by County": {"legend_position": "tl"},
}


def main(force):
    from superset.app import create_app

    with create_app().app_context():
        from superset.extensions import db
        from superset.models.dashboard import Dashboard

        dash = db.session.query(Dashboard).filter_by(dashboard_title=DASHBOARD).one_or_none()
        if dash is None:
            print(f"SKIP: no dashboard {DASHBOARD!r}")
            return
        apply_layout(dash, "afp", TABS, force)
        by_name = {s.slice_name: s for s in dash.slices}
        tuned = 0
        for name, extra in CHART_PARAMS.items():
            s = by_name.get(name)
            if s is None:
                continue
            params = json.loads(s.params or "{}")
            if all(params.get(k) == v for k, v in extra.items()):
                continue
            apply_guest_query_context(s, {**params, **extra})
            tuned += 1
        db.session.commit()
        print(f"{DASHBOARD!r}: tuned {tuned} charts")


if __name__ == "__main__":
    main("--force" in sys.argv[1:])

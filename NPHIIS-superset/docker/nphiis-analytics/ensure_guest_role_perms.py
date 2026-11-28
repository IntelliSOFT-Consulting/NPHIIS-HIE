"""Ensure the Superset guest/embed role can read datasources.

Embedded dashboards authenticate as GUEST_ROLE_NAME (often Public). Without
all_datasource_access / all_database_access every chart shows "Data error" /
filter "Network error" even when guest tokens succeed. Without can_csv the
embedded chart menu hides Download and CSV/Excel exports return 403.
"""
from __future__ import annotations

from superset.app import create_app

NEEDED = (
    ("all_datasource_access", "all_datasource_access"),
    ("all_database_access", "all_database_access"),
    # Chart menu "Download" (CSV / Excel) in the embedded dashboard, and the
    # result_format=csv|xlsx branch of /api/v1/chart/data, both check can_csv.
    ("can_csv", "Superset"),
)


def main() -> None:
    app = create_app()
    with app.app_context():
        from flask import current_app
        from superset.extensions import db

        sm = current_app.appbuilder.sm
        role_name = current_app.config.get("GUEST_ROLE_NAME") or "Public"
        role = sm.find_role(role_name)
        if role is None:
            print(f"SKIP: guest role {role_name!r} not found")
            return

        added = []
        for perm, view in NEEDED:
            pv = sm.find_permission_view_menu(perm, view)
            if pv is None:
                print(f"MISSING permission view {perm} on {view}")
                continue
            if pv not in (role.permissions or []):
                sm.add_permission_role(role, pv)
                added.append(f"{perm} on {view}")
        db.session.commit()
        print(f"guest role {role_name}: added {added or 'nothing (already present)'}")


if __name__ == "__main__":
    main()

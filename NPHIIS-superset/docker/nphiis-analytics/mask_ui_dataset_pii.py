"""Apply the PII policy to datasets that were built in the Superset UI (not from postgres/*.sql).

    sudo docker exec superset_app python /app/docker/nphiis-analytics/mask_ui_dataset_pii.py

Policy (same as postgres/*.sql): identifying columns are returned only when can_view_pii() is
true, i.e. for ADMINISTRATOR embeds; everyone else gets NULL and still sees the EPID.

"Epicurve-data" (Spark) feeds the IDSR "Line List (MOH 503)" and returned patient and reporter
names to every embedded user. Each listed column's select line

      `NamesOfPatient`,
  becomes
      CASE WHEN {{ can_view_pii() | tojson }} THEN `NamesOfPatient` END AS `NamesOfPatient`,

and the cache key gets the PII flag, so an admin's cached rows are never served to others.
Lines already masked are left alone, so it is safe on every deploy.
"""
import re

DATASETS = {
    "Epicurve-data": ["NamesOfPatient", "Reporter Name", "PatientsResidence"],
}
CACHE_KEY = "{% if cache_key_wrapper is defined %}{% set _ = cache_key_wrapper('pii:' ~ (can_view_pii()|string)) %}{% endif %}"


def mask(sql, columns):
    changed = []
    for col in columns:
        pattern = re.compile(r"^(\s*)`" + re.escape(col) + r"`(\s*,?)\s*$", re.M)
        new, n = pattern.subn(
            lambda m: f"{m.group(1)}CASE WHEN {{{{ can_view_pii() | tojson }}}} THEN `{col}` END AS `{col}`{m.group(2)}",
            sql, count=1,
        )
        if n:
            sql = new
            changed.append(col)
    if changed and "cache_key_wrapper('pii:'" not in sql:
        sql = CACHE_KEY + "\n" + sql
    return sql, changed


def main():
    from superset.app import create_app

    with create_app().app_context():
        from superset.connectors.sqla.models import SqlaTable
        from superset.extensions import db

        for name, columns in DATASETS.items():
            for ds in db.session.query(SqlaTable).filter_by(table_name=name).all():
                if not ds.sql:
                    print(f"SKIP {name!r} ({ds.id}): physical table")
                    continue
                sql, changed = mask(ds.sql, columns)
                if changed:
                    ds.sql = sql
                    print(f"{name!r} ({ds.id}): masked {changed}")
                else:
                    print(f"{name!r} ({ds.id}): already masked")
        db.session.commit()


if __name__ == "__main__":
    main()

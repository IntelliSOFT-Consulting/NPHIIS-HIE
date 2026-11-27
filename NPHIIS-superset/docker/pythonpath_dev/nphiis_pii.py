"""Analytics PII gate for Superset Jinja dataset SQL.

Only the Keycloak / HIE role ADMINISTRATOR may see patient identifiers.
Guest embeds pass a no-op RLS clause containing NPHIIS_CAN_VIEW_PII_MARKER when
the portal user is ADMINISTRATOR (see nphiis-admin guest-token route).
"""

from __future__ import annotations

NPHIIS_CAN_VIEW_PII_MARKER = "nphiis_can_view_pii"
# Guest-token RLS clause: no-op filter that also participates in the chart cache key.
NPHIIS_CAN_VIEW_PII_CLAUSE = f"TRUE /* {NPHIIS_CAN_VIEW_PII_MARKER} */"


def can_view_pii() -> bool:
    """True only for ADMINISTRATOR (native login or guest token with the PII marker)."""
    from flask import g, has_request_context

    if not has_request_context():
        return False
    user = getattr(g, "user", None)
    if user is None:
        return False

    if getattr(user, "is_guest_user", False):
        for rule in getattr(user, "rls", None) or []:
            clause = rule.get("clause") if isinstance(rule, dict) else getattr(rule, "clause", None)
            if clause and NPHIIS_CAN_VIEW_PII_MARKER in str(clause):
                return True
        return False

    roles = getattr(user, "roles", None) or []
    for role in roles:
        name = getattr(role, "name", None) or str(role)
        if name == "ADMINISTRATOR":
            return True
    return False

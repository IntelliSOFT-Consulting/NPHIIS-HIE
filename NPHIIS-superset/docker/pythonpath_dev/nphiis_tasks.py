"""NPHIIS Celery tasks, loaded by the Superset worker (CeleryConfig.imports in superset_config.py)."""
import logging
import sys

from superset.extensions import celery_app

sys.path.insert(0, "/app/docker/nphiis-analytics")

logger = logging.getLogger(__name__)


@celery_app.task(name="nphiis.refresh_analytics_tables", soft_time_limit=1800)
def refresh_analytics_tables():
    """Rebuilds the precomputed VHF tables (nphiis-analytics/refresh_tables.py)."""
    from refresh_tables import refresh_with_superset

    refresh_with_superset(log=logger.info)

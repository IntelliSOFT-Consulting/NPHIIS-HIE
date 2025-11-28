# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#
# This file is included in the final Docker image and SHOULD be overridden when
# deploying the image to prod. Settings configured here are intended for use in local
# development environments. Also note that superset_config_docker.py is imported
# as a final step as a means to override "defaults" configured here
#
import logging
import os
import sys

from celery.schedules import crontab
from flask_caching.backends.filesystemcache import FileSystemCache
from flask_appbuilder.security.manager import AUTH_OID

# Import Keycloak OIDC Security Manager (only if flask-oidc is available)
try:
    from keycloak_security_manager import OIDCSecurityManager
    OIDC_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Keycloak OIDC not available: {e}")
    logger.warning("Please rebuild the Docker image to install flask-oidc dependency.")
    OIDC_AVAILABLE = False
    OIDCSecurityManager = None

logger = logging.getLogger()

DATABASE_DIALECT = os.getenv("DATABASE_DIALECT")
DATABASE_USER = os.getenv("DATABASE_USER")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD")
DATABASE_HOST = os.getenv("DATABASE_HOST")
DATABASE_PORT = os.getenv("DATABASE_PORT")
DATABASE_DB = os.getenv("DATABASE_DB")

EXAMPLES_USER = os.getenv("EXAMPLES_USER")
EXAMPLES_PASSWORD = os.getenv("EXAMPLES_PASSWORD")
EXAMPLES_HOST = os.getenv("EXAMPLES_HOST")
EXAMPLES_PORT = os.getenv("EXAMPLES_PORT")
EXAMPLES_DB = os.getenv("EXAMPLES_DB")

# The SQLAlchemy connection string.
SQLALCHEMY_DATABASE_URI = (
    f"{DATABASE_DIALECT}://"
    f"{DATABASE_USER}:{DATABASE_PASSWORD}@"
    f"{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_DB}"
)

SQLALCHEMY_EXAMPLES_URI = (
    f"{DATABASE_DIALECT}://"
    f"{EXAMPLES_USER}:{EXAMPLES_PASSWORD}@"
    f"{EXAMPLES_HOST}:{EXAMPLES_PORT}/{EXAMPLES_DB}"
)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_CELERY_DB = os.getenv("REDIS_CELERY_DB", "0")
REDIS_RESULTS_DB = os.getenv("REDIS_RESULTS_DB", "1")

RESULTS_BACKEND = FileSystemCache("/app/superset_home/sqllab")

CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_HOST": REDIS_HOST,
    "CACHE_REDIS_PORT": REDIS_PORT,
    "CACHE_REDIS_DB": REDIS_RESULTS_DB,
}
DATA_CACHE_CONFIG = CACHE_CONFIG
THUMBNAIL_CACHE_CONFIG = CACHE_CONFIG
DASHBOARD_RBAC = True

# Enable proxy fix for proper URL construction when behind nginx/proxy
# This ensures redirect_uri is constructed correctly with https:// and proper domain
ENABLE_PROXY_FIX = True
PROXY_FIX_CONFIG = {
    "x_for": 1,
    "x_proto": 1,
    "x_host": 1,
    "x_port": 1,
    "x_prefix": 1
}

# Session cookie configuration for OAuth state management
# These settings ensure cookies are properly set and preserved through the proxy
SESSION_COOKIE_SECURE = True  # Required for HTTPS
SESSION_COOKIE_HTTPONLY = True  # Prevent XSS attacks
SESSION_COOKIE_SAMESITE = "Lax"  # Allow cookies in OAuth redirects

# Session protection to prevent redirect loops
# Use "basic" instead of "strong" to avoid issues with proxy/load balancer setups
SESSION_PROTECTION = "basic"

# ----------------------------------------------------
# Keycloak OIDC Authentication Configuration
# ----------------------------------------------------
# Only enable OIDC if flask-oidc is available (requires Docker image rebuild)
if OIDC_AVAILABLE:
    # Set authentication type to OpenID Connect
    AUTH_TYPE = AUTH_OID

    # Path to client_secret.json file (relative to this config file)
    OIDC_CLIENT_SECRETS = os.path.join(os.path.dirname(__file__), 'client_secret.json')

    # Keycloak realm (default: "master" - adjust if using a different realm)
    OIDC_OPENID_REALM = os.getenv("KEYCLOAK_REALM", "master")

    # Use secure cookies for HTTPS (set to False only for local development with HTTP)
    OIDC_ID_TOKEN_COOKIE_SECURE = True

    # Token introspection authentication method
    OIDC_INTROSPECTION_AUTH_METHOD = 'client_secret_post'
    
    # Request email scope to ensure email claim is included in token
    # Flask-OIDC will request these scopes during authentication
    OIDC_SCOPES = ['openid', 'email', 'profile']
    
    # Override Flask-OIDC's default scope request
    # This ensures email is always requested
    OIDC_ID_TOKEN_COOKIE_NAME = 'oidc_id_token'
    OIDC_USER_INFO_ENABLED = True

    # Use custom security manager for Keycloak OIDC
    CUSTOM_SECURITY_MANAGER = OIDCSecurityManager

    # Enable user self-registration (users will be auto-created on first login)
    AUTH_USER_REGISTRATION = True

    # Default role for newly registered users (fallback if role mapping fails)
    AUTH_USER_REGISTRATION_ROLE = "VACCINATOR"
    
    # Map HIE Auth Service roles to Superset roles (1-to-1 mapping)
    # Each HIE role maps directly to a Superset role with the same name
    AUTH_ROLES_MAPPING = {
        # HIE Auth Service roles -> Superset roles (1-to-1)
        'ADMINISTRATOR': ['Admin','ADMINISTRATOR'],
        'SUPERUSER': ['SUPERUSER'],
        'COUNTY_DISEASE_SURVEILLANCE_OFFICER': ['COUNTY_DISEASE_SURVEILLANCE_OFFICER'],
        'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER': ['SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER'],
        'FACILITY_SURVEILLANCE_FOCAL_PERSON': ['FACILITY_SURVEILLANCE_FOCAL_PERSON'],
        'SUPERVISORS': ['SUPERVISORS'],
        'VACCINATOR': ['VACCINATOR'],
        'LAB_TECHNICIAN': ['LAB_TECHNICIAN'],
    }
    
    # Sync roles from Keycloak on every login (recommended for role changes)
    AUTH_ROLES_SYNC_AT_LOGIN = True

    AUTH_SERVICE_URL = "http://hie-auth:3000"
else:
    # Fall back to database authentication if OIDC is not available
    logger.warning("Keycloak OIDC not available. Using default database authentication.")
    logger.warning("To enable Keycloak OIDC, rebuild the Docker image with: docker compose build")

class CeleryConfig:
    broker_url = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_CELERY_DB}"
    imports = (
        "superset.sql_lab",
        "superset.tasks.scheduler",
        "superset.tasks.thumbnails",
        "superset.tasks.cache",
    )
    result_backend = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_RESULTS_DB}"
    worker_prefetch_multiplier = 1
    task_acks_late = False
    beat_schedule = {
        "reports.scheduler": {
            "task": "reports.scheduler",
            "schedule": crontab(minute="*", hour="*"),
        },
        "reports.prune_log": {
            "task": "reports.prune_log",
            "schedule": crontab(minute=10, hour=0),
        },
    }


CELERY_CONFIG = CeleryConfig

FEATURE_FLAGS = {"ALERT_REPORTS": True, "DASHBOARD_RBAC": True}
ALERT_REPORTS_NOTIFICATION_DRY_RUN = True
WEBDRIVER_BASEURL = f"http://superset_app{os.environ.get('SUPERSET_APP_ROOT', '/')}/"  # When using docker compose baseurl should be http://superset_nginx{ENV{BASEPATH}}/  # noqa: E501
# The base URL for the email report hyperlinks.
WEBDRIVER_BASEURL_USER_FRIENDLY = (
    f"http://localhost:8888/{os.environ.get('SUPERSET_APP_ROOT', '/')}/"
)
SQLLAB_CTAS_NO_LIMIT = True

log_level_text = os.getenv("SUPERSET_LOG_LEVEL", "INFO")
LOG_LEVEL = getattr(logging, log_level_text.upper(), logging.INFO)

if os.getenv("CYPRESS_CONFIG") == "true":
    # When running the service as a cypress backend, we need to import the config
    # located @ tests/integration_tests/superset_test_config.py
    base_dir = os.path.dirname(__file__)
    module_folder = os.path.abspath(
        os.path.join(base_dir, "../../tests/integration_tests/")
    )
    sys.path.insert(0, module_folder)
    from superset_test_config import *  # noqa

    sys.path.pop(0)

#
# Optionally import superset_config_docker.py (which will have been included on
# the PYTHONPATH) in order to allow for local settings to be overridden
#
try:
    import superset_config_docker
    from superset_config_docker import *  # noqa

    logger.info(
        f"Loaded your Docker configuration at [{superset_config_docker.__file__}]"
    )
except ImportError:
    logger.info("Using default Docker config...")

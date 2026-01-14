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
from flask import session
from flask_caching.backends.filesystemcache import FileSystemCache
from flask_appbuilder.security.manager import AUTH_OAUTH
from functools import partial

# Import Keycloak OAuth2 Security Manager (uses Authlib - modern and maintained)
try:
    from oauth2_security_manager import KeycloakOAuth2SecurityManager
    OAUTH2_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Keycloak OAuth2 not available: {e}")
    OAUTH2_AVAILABLE = False
    KeycloakOAuth2SecurityManager = None

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
# Keycloak OAuth2 Authentication Configuration
# ----------------------------------------------------
# Using OAuth2 with Authlib (modern, maintained) instead of flask-oidc
if OAUTH2_AVAILABLE:
    # Set authentication type to OAuth2
    AUTH_TYPE = AUTH_OAUTH

    # Keycloak configuration from environment variables
    KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://dsrkeycloak.intellisoftkenya.com")
    KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "master")
    KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "chanjo-client-apis")
    KEYCLOAK_CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET", "lbOutYrbQFvcWWe0yKPZibcu6ibsEEPr")

    # OAuth2 provider configuration using Keycloak's OpenID Connect metadata
    OAUTH_PROVIDERS = [
        {
            'name': 'NPHIIS Auth',
            'token_key': 'access_token',
            'icon': 'fa-key',
            'remote_app': {
                'client_id': KEYCLOAK_CLIENT_ID,
                'client_secret': KEYCLOAK_CLIENT_SECRET,
                'client_kwargs': {
                    'scope': 'openid email profile'
                },
                # Use Keycloak's OpenID Connect discovery endpoint
                'server_metadata_url': f'{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/.well-known/openid-configuration'
            }
        }
    ]

    # Use custom security manager for Keycloak OAuth2
    CUSTOM_SECURITY_MANAGER = KeycloakOAuth2SecurityManager

    # Enable user self-registration (users will be auto-created on first login)
    AUTH_USER_REGISTRATION = True

    # Default role for newly registered users (fallback if role mapping fails)
    AUTH_USER_REGISTRATION_ROLE = "VACCINATOR"
    
    # Map HIE Auth Service roles to Superset roles
    # SUPERUSER and ADMINISTRATOR get Admin role for full Superset access
    AUTH_ROLES_MAPPING = {
        # HIE Auth Service roles -> Superset roles
        'ADMINISTRATOR': ['Admin', 'ADMINISTRATOR'],
        'SUPERUSER': ['Admin', 'SUPERUSER'],
        'COUNTY_DISEASE_SURVEILLANCE_OFFICER': ['COUNTY_DISEASE_SURVEILLANCE_OFFICER'],
        'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER': ['SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER'],
        'FACILITY_SURVEILLANCE_FOCAL_PERSON': ['FACILITY_SURVEILLANCE_FOCAL_PERSON'],
        'SUPERVISORS': ['SUPERVISORS'],
        'VACCINATOR': ['VACCINATOR'],
        'LAB_TECHNICIAN': ['LAB_TECHNICIAN'],
    }
    
    # Sync roles from Keycloak on every login (recommended for role changes)
    AUTH_ROLES_SYNC_AT_LOGIN = True

    AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://hie-auth:3000")
else:
    # Fall back to database authentication if OAuth2 is not available
    logger.warning("Keycloak OAuth2 not available. Using default database authentication.")


def get_user_location_info():
    """
    Get user location info from session for use in Jinja templates.
    Returns a dictionary with location fields (county, subCounty, etc.)
    or an empty dict if no location info is available.
    """
    from flask import has_request_context
    if has_request_context():
        try:
            return session.get('user_location_info', {})
        except Exception:
            return {}
    return {}


# Add location info function to Jinja context for use in SQL templates and RLS filters
# Note: Functions in JINJA_CONTEXT_ADDONS are called directly in templates
JINJA_CONTEXT_ADDONS = {
    'user_location_info': get_user_location_info,
}

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

FEATURE_FLAGS = {
    "ALERT_REPORTS": True,
    "DASHBOARD_RBAC": True,
    "ENABLE_TEMPLATE_PROCESSING": True,  # Enable Jinja template processing for SQL queries
}
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

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

logger = logging.getLogger()

# Import Keycloak OAuth2 Security Manager (uses Authlib - modern and maintained)
try:
    from oauth2_security_manager import KeycloakOAuth2SecurityManager
    OAUTH2_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Keycloak OAuth2 not available: {e}")
    OAUTH2_AVAILABLE = False
    KeycloakOAuth2SecurityManager = None

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
# Chart results. Every chart runs its dataset's SQL on the Spark thrift server, and a
# dashboard sends a dozen at once, so uncached loads take 15-30 s. The warehouse only
# changes on the pipeline's 2-hourly run, so an hour of caching costs little freshness.
# Cache keys include the RLS clause, so each area keeps its own entries.
DATA_CACHE_CONFIG = {
    **CACHE_CONFIG,
    "CACHE_DEFAULT_TIMEOUT": int(os.getenv("SUPERSET_DATA_CACHE_TIMEOUT", "3600")),
}
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

# When the external SSL terminator forwards plain HTTP to port 8088,
# set SUPERSET_WEBSERVER_ADDRESS (e.g. analytics-nphiis.health.go.ke) in .env-local
# to force Flask to use https:// when building OAuth callback URLs.
#
# NOTE: We intentionally do NOT set Flask's SERVER_NAME here.  SERVER_NAME causes
# Flask/Werkzeug to reject any request whose Host header doesn't match exactly,
# which breaks Docker health checks (they hit localhost:8088) and marks the
# container as unhealthy.  ProxyFix + X-Forwarded-Host is sufficient for correct
# external URL generation when requests arrive through Nginx.
#
# We also sanitize the "next" query parameter on login paths so it is stored as a
# relative path rather than a full https://host/path URL.  When next is an absolute
# URL, Keycloak rejects the OAuth authorization request (the URL ends up embedded in
# the Authlib state JWT, and Keycloak's authorization endpoint errors on it).
# Relative paths produce smaller state JWTs and Keycloak handles them correctly.
_SUPERSET_WEBSERVER_ADDRESS = os.getenv("SUPERSET_WEBSERVER_ADDRESS", "")
if _SUPERSET_WEBSERVER_ADDRESS:
    PREFERRED_URL_SCHEME = "https"

    def FLASK_APP_MUTATOR(app):
        _inner = app.wsgi_app

        def _fix_request(environ, start_response):
            # 1. Force wsgi.url_scheme so url_for(_external=True) returns https://
            #    even when Nginx forwards plain HTTP without X-Forwarded-Proto.
            environ["wsgi.url_scheme"] = "https"

            # 2. Rewrite "next=https://host/path" → "next=/path" on login endpoints.
            #    Flask-Login passes request.url (absolute) as next, which Keycloak
            #    rejects when embedded in the Authlib state JWT.
            from urllib.parse import parse_qs, urlencode, urlparse
            path = environ.get("PATH_INFO", "")
            qs = environ.get("QUERY_STRING", "")
            if path.startswith("/login") and qs and "next=" in qs:
                try:
                    params = parse_qs(qs, keep_blank_values=True)
                    if "next" in params:
                        sanitized = []
                        for v in params["next"]:
                            if v.startswith("http://") or v.startswith("https://"):
                                p = urlparse(v)
                                sanitized.append(p.path + ("?" + p.query if p.query else ""))
                            else:
                                sanitized.append(v)
                        params["next"] = sanitized
                        environ["QUERY_STRING"] = urlencode(params, doseq=True)
                except Exception:
                    pass

            return _inner(environ, start_response)

        app.wsgi_app = _fix_request

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
    KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://api.nphiis.health.go.ke")
    KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "master")
    KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "chanjo-client-apis")
    KEYCLOAK_CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET")
    if not KEYCLOAK_CLIENT_SECRET:
        logger.warning(
            "KEYCLOAK_CLIENT_SECRET not set; OAuth2 login will fail until configured "
            "(e.g. NPHIIS-superset/docker/.env from docker/.env.example).",
        )

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
        "nphiis_tasks",
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
        # Precomputed VHF tables, just after the data pipeline's 2-hourly run (:00).
        "nphiis.refresh_analytics_tables": {
            "task": "nphiis.refresh_analytics_tables",
            "schedule": crontab(minute=10, hour="*"),
        },
    }


CELERY_CONFIG = CeleryConfig

FEATURE_FLAGS = {
    "ALERT_REPORTS": True,
    "DASHBOARD_RBAC": True,
    "ENABLE_TEMPLATE_PROCESSING": True,  # Enable Jinja template processing for SQL queries
    # Lets the Next.js admin portal call /api/v1/security/guest_token/ and
    # mount dashboards via @superset-ui/embedded-sdk.
    "EMBEDDED_SUPERSET": True,
}

# ---------------------------------------------------------------------------
# Embedded dashboards / charts
# ---------------------------------------------------------------------------
# Origins allowed to call Superset from the browser (CORS) and to embed it in
# an <iframe> (frame-ancestors). Comma-separated env var so each environment
# can list its own admin host(s) without code changes; falls back to a sane
# dev-friendly default that includes localhost.
_DEFAULT_EMBED_ORIGINS = (
    "http://localhost:3000,"
    "http://localhost:3001,"
    "http://dsrfhir.intellisoftkenya.com:8080,"
    "https://dsrfhir.intellisoftkenya.com:8080,"
    "https://dsradmin.intellisoftkenya.com,"
    "https://dsrfhir.intellisoftkenya.com,"
    "https://analytics-nphiis.health.go.ke,"
    "https://nphiis.health.go.ke"
)
EMBEDDED_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("EMBEDDED_ALLOWED_ORIGINS", _DEFAULT_EMBED_ORIGINS).split(
        ","
    )
    if o.strip()
]

# Guest token (used by /api/v1/security/guest_token/). Falls back to the app
# SECRET_KEY when GUEST_TOKEN_JWT_SECRET isn't explicitly set.
GUEST_ROLE_NAME = os.environ.get("GUEST_ROLE_NAME", "Public")
GUEST_TOKEN_JWT_SECRET = os.environ.get(
    "GUEST_TOKEN_JWT_SECRET", os.environ.get("SUPERSET_SECRET_KEY", "change-me")
)
GUEST_TOKEN_JWT_ALGO = "HS256"
GUEST_TOKEN_JWT_EXP_SECONDS = int(
    os.environ.get("GUEST_TOKEN_JWT_EXP_SECONDS", "300")
)

# Browser → Superset CORS for the embedded SDK and for the admin's
# guest-token bootstrap fetch.
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": [
        "X-CSRFToken",
        "Content-Type",
        "Origin",
        "X-Requested-With",
        "Accept",
        "Authorization",
    ],
    "resources": ["/api/*", "/superset/*", "/embedded/*"],
    "origins": EMBEDDED_ALLOWED_ORIGINS,
}

# Talisman ships a Content Security Policy that disallows iframing by
# default. Loosen `frame-ancestors` (and a couple of related directives) so
# the configured origins can embed dashboards/charts. Everything else stays
# at Superset's secure defaults.
TALISMAN_ENABLED = True
TALISMAN_CONFIG = {
    "force_https": False,
    "force_https_permanent": False,
    "frame_options": None,  # rely on CSP frame-ancestors instead of X-Frame-Options
    "content_security_policy": {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "worker-src": ["'self'", "blob:"],
        "connect-src": [
            "'self'",
            "https://api.mapbox.com",
            "https://events.mapbox.com",
            *EMBEDDED_ALLOWED_ORIGINS,
        ],
        "object-src": "'none'",
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'", "'strict-dynamic'"],
        "frame-ancestors": ["'self'", *EMBEDDED_ALLOWED_ORIGINS],
    },
    "content_security_policy_nonce_in": ["script-src"],
}

# Superset's initialization picks TALISMAN_DEV_CONFIG when FLASK_DEBUG=true
# (see superset/initialization/__init__.py — the dev/prod selector uses
# `self.superset_app.debug or self.config["DEBUG"]`). Our staging deploy
# runs with FLASK_DEBUG=true, so without this override the dev defaults
# are used and the embed-friendly settings above are silently ignored.
# Mirror the prod config here, with the only deviation being a permissive
# `script-src` to satisfy React's dev-mode `eval` requirement.
TALISMAN_DEV_CONFIG = {
    **TALISMAN_CONFIG,
    "content_security_policy": {
        **TALISMAN_CONFIG["content_security_policy"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    },
}

# `X-Frame-Options: SAMEORIGIN` would still block iframes from other hosts
# even with frame-ancestors set, so unset it here.
HTTP_HEADERS = {}
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

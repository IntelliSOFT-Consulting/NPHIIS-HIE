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
# software distributed under this License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#
# Keycloak OIDC Security Manager for Superset
# Based on Superset documentation for Keycloak integration

from flask_appbuilder.security.manager import AUTH_OID
from superset.security import SupersetSecurityManager
from flask_appbuilder.security.views import AuthOIDView
from flask_login import login_user
from urllib.parse import quote
from flask_appbuilder.views import ModelView, SimpleFormView, expose
from flask import (
    redirect,
    request
)
import requests
import logging

logger = logging.getLogger(__name__)

# Try to import flask_oidc, but handle gracefully if not installed
try:
    from flask_oidc import OpenIDConnect
except ImportError:
    logger.warning("flask-oidc not installed. Keycloak OIDC authentication will not work.")
    logger.warning("Please rebuild the Docker image to install flask-oidc dependency.")
    OpenIDConnect = None


class OIDCSecurityManager(SupersetSecurityManager):
    """Custom security manager for Keycloak OIDC authentication"""

    def __init__(self, appbuilder):
        super(OIDCSecurityManager, self).__init__(appbuilder)
        if self.auth_type == AUTH_OID:
            if OpenIDConnect is None:
                raise ImportError(
                    "flask-oidc is not installed. "
                    "Please rebuild the Docker image to install the dependency."
                )
            self.oid = OpenIDConnect(self.appbuilder.get_app)
        self.authoidview = AuthOIDCView


class AuthOIDCView(AuthOIDView):
    """Custom OIDC authentication view for Keycloak"""

    @expose('/login/', methods=['GET', 'POST'])
    def login(self, flag=True):
        sm = self.appbuilder.sm
        oidc = sm.oid

        @self.appbuilder.sm.oid.require_login
        def handle_login():
            try:
                # Get all available user info from OIDC token
                # Try to get email from token first
                email = oidc.user_getfield('email')
                
                # Get full user info - request multiple possible fields including roles
                info = oidc.user_getinfo([
                    'sub',  # Subject identifier (always present)
                    'preferred_username',
                    'username',
                    'given_name',
                    'family_name',
                    'name',
                    'email',
                    'email_verified',
                    'realm_access',  # Keycloak realm roles
                    'resource_access'  # Keycloak client roles
                ])
                
                # Log what we received for debugging
                logger.info(f"OIDC user info received: {info}")
                
                # Try to get email from various sources
                email = email or info.get('email')
                
                # If still no email, try to use username or sub as fallback
                if not email:
                    # Try preferred_username first
                    username = info.get('preferred_username') or info.get('username')
                    if username and '@' in username:
                        # If username looks like an email, use it
                        email = username
                    else:
                        # Use sub (subject) as identifier, but we need an email for Superset
                        # Try to construct one or use sub as username
                        sub = info.get('sub', 'unknown')
                        logger.warning(f"No email found in OIDC claims. Available fields: {list(info.keys())}")
                        # For now, we'll use sub@keycloak.local as a fallback
                        # But this should be fixed in Keycloak configuration
                        email = f"{sub}@keycloak.local"
                        logger.warning(f"Using fallback email: {email}")
                
                # auth_user_oid can return None, False, or a User object
                # Check for both None and False (falsy values that aren't a User)
                user = None
                if email:
                    user = sm.auth_user_oid(email)
                    # auth_user_oid can return False on failure, not just None
                    if user is False or user is None:
                        user = None
                
                # If user doesn't exist, create a new one
                if not user:
                    if not email or email.endswith('@keycloak.local'):
                        # If we had to use fallback, log error but still try to proceed
                        logger.error(f"No email found in OIDC user info. Available info: {info}")
                        from flask import render_template_string
                        return render_template_string(
                            '<h1>Authentication Error</h1>'
                            '<p>No email found in OIDC user info. Please ensure your Keycloak user has an email address configured.</p>'
                            '<p>Contact your administrator to add an email to your Keycloak user profile.</p>'
                        ), 400
                    
                    username = info.get('preferred_username') or email.split('@')[0]
                    
                    # Get roles from HIE Auth Service (primary source) and Keycloak (fallback)
                    auth_service_role = self._get_roles_from_auth_service(sm, oidc.get_access_token())
                    keycloak_roles = self._extract_keycloak_roles(info)
                    
                    # Combine roles: auth service role takes priority
                    all_roles = []
                    if auth_service_role:
                        all_roles.append(auth_service_role)
                    all_roles.extend(keycloak_roles)
                    
                    superset_roles = self._map_keycloak_roles_to_superset(sm, all_roles)
                    
                    # Always include Gamma as base role
                    gamma_role = sm.find_role('Gamma')
                    if gamma_role and gamma_role not in superset_roles:
                        superset_roles.append(gamma_role)
                    
                    # Use the first mapped role (or Gamma) as default
                    default_role = superset_roles[0] if superset_roles else gamma_role
                    
                    try:
                        user = sm.add_user(
                            username,
                            info.get('given_name', ''),
                            info.get('family_name', ''),
                            email,
                            default_role
                        )
                        
                        # Add all roles (including Gamma) if user was created successfully
                        if user and len(superset_roles) > 1:
                            for role in superset_roles[1:]:
                                if role and role not in user.roles:
                                    user.roles.append(role)
                            sm.get_session.commit()
                            logger.info(f"New user {user.username} created with roles: {[r.name for r in user.roles]}")
                        
                        if not user:
                            # User creation returned None, try to find existing user
                            logger.warning(f"add_user returned None for email: {email}, trying to find existing user")
                            user = sm.find_user(email=email) or sm.find_user(username=username)
                    except Exception as e:
                        error_msg = str(e)
                        logger.warning(f"Error creating user (may already exist): {error_msg}")
                        
                        # If it's a duplicate key error, try to find the existing user
                        if 'duplicate key' in error_msg.lower() or 'unique constraint' in error_msg.lower():
                            # Try to find user by email first, then by username
                            user = sm.find_user(email=email)
                            if not user:
                                user = sm.find_user(username=username)
                            
                            if user:
                                logger.info(f"Found existing user: {user.username} (email: {user.email})")
                            else:
                                logger.error(f"User creation failed and could not find existing user for email: {email}, username: {username}")
                                from flask import render_template_string
                                return render_template_string(
                                    '<h1>Authentication Error</h1>'
                                    '<p>Unable to create or find user account. Please contact your administrator.</p>'
                                ), 400
                        else:
                            # Some other error occurred
                            logger.error(f"Unexpected error creating user: {error_msg}")
                            from flask import render_template_string
                            return render_template_string(
                                '<h1>Authentication Error</h1><p>Error creating user account. Please contact your administrator.</p>'
                            ), 400
                    
                    if not user:
                        logger.error(f"Failed to create or find user with email: {email}")
                        from flask import render_template_string
                        return render_template_string(
                            '<h1>Authentication Error</h1><p>Failed to create user account. Please contact your administrator.</p>'
                        ), 400
                
                # Sync roles for existing users (from both auth service and Keycloak)
                if user:
                    # Get roles from HIE Auth Service (primary source)
                    auth_service_role = self._get_roles_from_auth_service(sm, oidc.get_access_token())
                    keycloak_roles = self._extract_keycloak_roles(info)
                    
                    # Combine roles: auth service role takes priority
                    all_roles = []
                    if auth_service_role:
                        all_roles.append(auth_service_role)
                    all_roles.extend(keycloak_roles)
                    
                    logger.info(f"Combined roles for user {user.username}: auth_service={auth_service_role}, keycloak={keycloak_roles}")
                    
                    superset_roles = self._map_keycloak_roles_to_superset(sm, all_roles)
                    
                    # Always include Gamma as base role
                    gamma_role = sm.find_role('Gamma')
                    if gamma_role and gamma_role not in superset_roles:
                        superset_roles.append(gamma_role)
                    
                    # Update user roles: set to mapped roles + Gamma
                    if superset_roles:
                        mapped_role_names = {role.name for role in superset_roles if role}
                        
                        # Set user roles to all mapped roles (including Gamma)
                        user.roles = []
                        for role in superset_roles:
                            if role and role not in user.roles:
                                user.roles.append(role)
                        sm.get_session.commit()
                        logger.info(f"Updated roles for user {user.username}: {[r.name for r in user.roles]}")
                
                # Ensure user is active before logging in
                if hasattr(user, 'is_active') and not user.is_active:
                    logger.warning(f"User {user.username} is not active")
                    from flask import render_template_string
                    return render_template_string(
                        '<h1>Account Disabled</h1><p>Your account is not active. Please contact your administrator.</p>'
                    ), 403
                
                login_user(user, remember=False)
                return redirect(self.appbuilder.get_url_for_index)
            except Exception as e:
                logger.error(f"Error in OIDC login handler: {str(e)}", exc_info=True)
                from flask import render_template_string
                return render_template_string(
                    '<h1>Authentication Error</h1><p>An error occurred during authentication. Please try again or contact your administrator.</p>'
                ), 500

        return handle_login()
    
    def _extract_keycloak_roles(self, user_info):
        """Extract roles from Keycloak user info"""
        roles = []
        
        # Extract realm roles
        realm_access = user_info.get('realm_access', {})
        if isinstance(realm_access, dict):
            realm_roles = realm_access.get('roles', [])
            roles.extend(realm_roles)
        
        # Extract client roles (for the specific client)
        resource_access = user_info.get('resource_access', {})
        if isinstance(resource_access, dict):
            # Check for roles in the client (chanjo-client-apis)
            client_roles = resource_access.get('chanjo-client-apis', {})
            if isinstance(client_roles, dict):
                roles.extend(client_roles.get('roles', []))
            
            # Also check for account roles (common in Keycloak)
            account_roles = resource_access.get('account', {})
            if isinstance(account_roles, dict):
                roles.extend(account_roles.get('roles', []))
        
        logger.info(f"Extracted Keycloak roles: {roles}")
        return roles
    

    def _get_roles_from_auth_service(self, sm, token: str):
        try:
            auth_service_url = sm.appbuilder.get_app.config.get('AUTH_SERVICE_URL')
            logger.info(f"Fetching roles from auth service: {auth_service_url}/provider/me")
            
            response = requests.get(
                f"{auth_service_url}/provider/me", 
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            
            logger.info(f"Auth service response status: {response.status_code}")
            
            if response.status_code != 200:
                logger.warning(f"Auth service returned non-200 status: {response.status_code}, body: {response.text[:500]}")
                return None
            
            data = response.json()
            logger.info(f"Auth service response data: {data}")
            
            role = data.get('user', {}).get('role', None)
            logger.info(f"Extracted role from auth service: {role}")
            return role
        except Exception as e:
            logger.error(f"Error getting roles from auth service: {str(e)}")
            return None

    def _map_keycloak_roles_to_superset(self, sm, keycloak_roles):
        """Map Keycloak roles to Superset roles using AUTH_ROLES_MAPPING"""
        superset_roles = []
        roles_mapping = sm.appbuilder.get_app.config.get('AUTH_ROLES_MAPPING', {})
        
        # Get all available Superset roles
        all_superset_roles = {role.name: role for role in sm.get_all_roles()}
        
        # Map each Keycloak role to Superset roles
        for keycloak_role in keycloak_roles:
            if keycloak_role in roles_mapping:
                mapped_role_names = roles_mapping[keycloak_role]
                if not isinstance(mapped_role_names, list):
                    mapped_role_names = [mapped_role_names]
                
                for role_name in mapped_role_names:
                    if role_name in all_superset_roles:
                        role = all_superset_roles[role_name]
                        if role not in superset_roles:
                            superset_roles.append(role)
                    else:
                        # Role doesn't exist in Superset, create it
                        logger.info(f"Creating new Superset role: {role_name}")
                        try:
                            role = sm.add_role(role_name)
                            if role:
                                all_superset_roles[role_name] = role  # Cache for future lookups
                                if role not in superset_roles:
                                    superset_roles.append(role)
                                logger.info(f"Successfully created role: {role_name}")
                            else:
                                logger.warning(f"Failed to create role: {role_name}")
                        except Exception as e:
                            logger.error(f"Error creating role {role_name}: {str(e)}")
        
        # Sort roles by priority: Admin > Alpha > Gamma > others
        role_priority = {'Admin': 0, 'Alpha': 1, 'Gamma': 2}
        superset_roles.sort(key=lambda r: role_priority.get(r.name, 99))
        
        logger.info(f"Mapped Keycloak roles {keycloak_roles} to Superset roles: {[r.name for r in superset_roles]}")
        return superset_roles

    @expose('/logout/', methods=['GET', 'POST'])
    def logout(self):
        oidc = self.appbuilder.sm.oid
        
        # Get the ID token before logging out (needed for Keycloak redirect)
        id_token = None
        try:
            id_token = oidc.get_cookie_id_token()
        except Exception:
            pass
        
        # Perform local logout
        oidc.logout()
        super(AuthOIDCView, self).logout()
        
        # Build the redirect URL to the login page
        redirect_url = request.url_root.strip('/') + self.appbuilder.get_url_for_login
        logger.info(f"Logout redirect URL: {redirect_url}")
        
        # Build Keycloak logout URL
        # For Keycloak 18+, use post_logout_redirect_uri and id_token_hint
        # For older versions, use redirect_uri
        issuer = oidc.client_secrets.get('issuer')
        logout_url = f"{issuer}/protocol/openid-connect/logout"
        
        # Try newer Keycloak format first (18+)
        if id_token:
            logout_url += f"?id_token_hint={id_token}&post_logout_redirect_uri={quote(redirect_url)}"
        else:
            # Fallback for older Keycloak or if no id_token
            logout_url += f"?post_logout_redirect_uri={quote(redirect_url)}&client_id={oidc.client_secrets.get('client_id', 'superset')}"
        
        logger.info(f"Keycloak logout URL: {logout_url}")
        
        return redirect(logout_url)


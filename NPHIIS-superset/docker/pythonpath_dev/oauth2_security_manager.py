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
# Keycloak OAuth2 Security Manager for Superset
# Uses Authlib (modern, maintained) instead of flask-oidc

import logging
import requests
from superset.security import SupersetSecurityManager

logger = logging.getLogger(__name__)


class KeycloakOAuth2SecurityManager(SupersetSecurityManager):
    """Custom security manager for Keycloak OAuth2 authentication using Authlib"""

    def oauth_user_info(self, provider, response=None):
        """
        Override oauth_user_info to handle Keycloak user information
        and map roles from both HIE Auth Service and Keycloak.
        """
        logger.debug(f"OAuth2 provider: {provider}")
        
        # Handle any provider (since we only have one configured)
        try:
            # Get remote app for this provider
            remote_app = self.appbuilder.sm.oauth_remotes[provider]
            
            # Get access token from response (set by Flask-AppBuilder after OAuth callback)
            access_token = None
            if response:
                access_token = response.get('access_token')
            if not access_token:
                # Try to get from the remote app's token storage
                try:
                    access_token = remote_app.token.get('access_token')
                except Exception:
                    pass
            
            # Get user info from Keycloak
            # With OpenID Connect, we can get user info from the ID token in the response
            # OpenID Connect ID tokens contain user information
            me = None
            
            if response and 'id_token' in response:
                # Parse the ID token (JWT format: header.payload.signature)
                import base64
                import json
                try:
                    id_token = response['id_token']
                    # Decode the payload (second part of JWT)
                    parts = id_token.split('.')
                    if len(parts) >= 2:
                        payload_part = parts[1]
                        # Add padding if needed for base64 decoding
                        padding = 4 - len(payload_part) % 4
                        if padding != 4:
                            payload_part += '=' * padding
                        decoded = base64.urlsafe_b64decode(payload_part)
                        me = json.loads(decoded)
                        logger.info("Extracted user info from ID token")
                except Exception as e:
                    logger.warning(f"Failed to parse ID token: {e}")
            
            # If ID token parsing failed, try to use userinfo endpoint
            if not me:
                try:
                    # For OpenID Connect with server_metadata_url, Authlib should discover the userinfo endpoint
                    # Flask-AppBuilder should set the token before calling oauth_user_info
                    me = remote_app.get('userinfo').json()
                    logger.info("Retrieved user info from userinfo endpoint")
                except Exception as e:
                    logger.error(f"Failed to get userinfo from endpoint: {e}")
                    raise
            
            logger.debug(f"Keycloak user_data: {me}")
            
            # Extract user information
            email = me.get('email') or me.get('preferred_username')
            if not email:
                # Fallback to sub
                sub = me.get('sub', '')
                email = f"{sub}@keycloak.local" if sub else None
            
            # Get roles from HIE Auth Service and Keycloak
            auth_service_role = None
            auth_service_data = None
            if access_token:
                auth_service_role, auth_service_data = self._get_roles_from_auth_service(access_token)
            
            keycloak_roles = self._extract_keycloak_roles(me)
            
            # Store roles and location info in session for later use
            from flask import session
            all_roles = []
            if auth_service_role:
                all_roles.append(auth_service_role)
            all_roles.extend(keycloak_roles)
            session['_oauth_roles'] = all_roles
            session['_auth_service_data'] = auth_service_data
            
            # Extract and store location info if available
            if auth_service_data:
                location_info = self._extract_location_info(auth_service_data)
                if location_info:
                    session['user_location_info'] = location_info
                    logger.info(f"Stored location info in session: {location_info}")
            
            return {
                'name': me.get('name', ''),
                'email': email,
                'id': me.get('sub'),
                'username': me.get('preferred_username') or email.split('@')[0] if email else '',
                'first_name': me.get('given_name', ''),
                'last_name': me.get('family_name', '')
            }
        except Exception as e:
            logger.error(f"Error in oauth_user_info for provider {provider}: {str(e)}", exc_info=True)
            raise
        
        return {}

    def _extract_location_info(self, auth_service_data):
        """
        Extract location information from auth service response.
        Returns a dictionary with location fields if present.
        """
        if not auth_service_data:
            return {}
        
        user_data = auth_service_data.get('user', {})
        location_info = user_data.get('locationInfo', {})
        
        if not location_info:
            logger.debug("No locationInfo found in auth service response")
            return {}
        
        # Extract only the fields we need, skipping missing ones
        location_fields = {}
        field_mapping = {
            'subCounty': 'subCounty',
            'subCountyName': 'subCountyName',
            'county': 'county',
            'countyName': 'countyName',
            'country': 'country',
            'countryName': 'countryName'
        }
        
        for key, value in field_mapping.items():
            if key in location_info and location_info[key] is not None:
                location_fields[value] = location_info[key]
        
        if location_fields:
            logger.info(f"Extracted location info: {location_fields}")
        else:
            logger.debug("No location fields found in locationInfo")
        
        return location_fields

    def _get_roles_from_auth_service(self, access_token):
        """
        Get role and full user data from HIE Auth Service using the access token.
        Returns (role_name, full_data_dict) or (None, None) on error
        """
        try:
            from flask import current_app
            auth_service_url = current_app.config.get('AUTH_SERVICE_URL', 'http://hie-auth:3000')
            logger.info(f"Fetching roles from auth service: {auth_service_url}/provider/me")
            
            response = requests.get(
                f"{auth_service_url}/provider/me",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10
            )
            
            logger.info(f"Auth service response status: {response.status_code}")
            
            if response.status_code != 200:
                logger.warning(f"Auth service returned non-200 status: {response.status_code}, body: {response.text[:500]}")
                return None, None
            
            data = response.json()
            logger.info(f"Auth service response data: {data}")
            
            role = data.get('user', {}).get('role', None)
            logger.info(f"Extracted role from auth service: {role}")
            return role, data
        except Exception as e:
            logger.error(f"Error getting roles from auth service: {str(e)}")
            return None, None

    def _extract_keycloak_roles(self, user_info):
        """Extract roles from Keycloak user info (from token claims)"""
        roles = []
        
        # Extract realm roles
        realm_access = user_info.get('realm_access', {})
        if isinstance(realm_access, dict):
            realm_roles = realm_access.get('roles', [])
            roles.extend(realm_roles)
        
        # Extract client roles (check resource_access)
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

    def auth_user_oauth(self, userinfo):
        """
        Override auth_user_oauth to handle role mapping from both
        HIE Auth Service and Keycloak.
        """
        user = super().auth_user_oauth(userinfo)
        
        if user:
            from flask import session, g
            all_roles = session.get('_oauth_roles', [])
            auth_service_data = session.get('_auth_service_data')
            
            if all_roles:
                # Map roles to Superset roles
                superset_roles = self._map_keycloak_roles_to_superset(all_roles)
                
                # Always include Gamma as base role
                gamma_role = self.find_role('Gamma')
                if gamma_role and gamma_role not in superset_roles:
                    superset_roles.append(gamma_role)
                
                # Update user roles
                user.roles = []
                for role in superset_roles:
                    if role and role not in user.roles:
                        user.roles.append(role)
                
                self.get_session.commit()
                logger.info(f"Updated user {user.username} with roles: {[r.name for r in user.roles]}")
            
            # Store location info in Flask's g object for use in RLS filters
            if auth_service_data:
                location_info = self._extract_location_info(auth_service_data)
                if location_info:
                    g.user_location_info = location_info
                    logger.info(f"Stored location info in g object for user {user.username}: {location_info}")
        
        return user

    def _map_keycloak_roles_to_superset(self, keycloak_roles):
        """
        Map Keycloak roles to Superset roles using AUTH_ROLES_MAPPING from config
        """
        from flask import current_app
        roles_mapping = current_app.config.get('AUTH_ROLES_MAPPING', {})
        
        superset_roles = []
        
        # Get all available Superset roles
        all_superset_roles = {role.name: role for role in self.get_all_roles()}
        
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
                            role = self.add_role(role_name)
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

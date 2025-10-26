/*
 * Copyright 2021-2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.google.fhir.gateway.plugin;

import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Resolves the access scope (which levels of the location hierarchy a user can access) based on
 * their role. Implements role hierarchy where higher-level roles have access to lower-level data.
 */
public class RoleBasedAccessScopeResolver {

  private static final Logger logger = LoggerFactory.getLogger(RoleBasedAccessScopeResolver.class);

  /**
   * Access level representing the hierarchical levels in the location structure. These correspond
   * to FHIR Location.type.code values used in the location hierarchy.
   */
  public enum AccessLevel {
    FACILITY("FACILITY"),
    WARD("WARD"),
    SUB_COUNTY("SUB-COUNTY"),
    COUNTY("COUNTY"),
    COUNTRY("COUNTRY");

    private final String locationTypeCode;

    AccessLevel(String locationTypeCode) {
      this.locationTypeCode = locationTypeCode;
    }

    /**
     * Gets the FHIR Location.type.code corresponding to this access level.
     *
     * @return the location type code
     */
    public String getLocationTypeCode() {
      return locationTypeCode;
    }

    /**
     * Gets the AccessLevel from a location type code.
     *
     * @param typeCode the location type code
     * @return the corresponding AccessLevel, or null if not found
     */
    public static AccessLevel fromTypeCode(String typeCode) {
      for (AccessLevel level : AccessLevel.values()) {
        if (level.locationTypeCode.equals(typeCode)) {
          return level;
        }
      }
      return null;
    }
  }

  private final LocationAccessConfig config;

  public RoleBasedAccessScopeResolver(LocationAccessConfig config) {
    Preconditions.checkNotNull(config, "LocationAccessConfig cannot be null");
    this.config = config;
  }

  /**
   * Determines the access level for a given role. The access level corresponds to a FHIR
   * Location.type.code value that will be used to identify which level of the hierarchy the user
   * operates at.
   *
   * @param role the user's role
   * @return the access level corresponding to the role
   * @throws IllegalArgumentException if the role is not configured
   */
  public AccessLevel resolveAccessLevel(String role) {
    Preconditions.checkNotNull(role, "Role cannot be null");
    String locationTypeCode = config.getRoleHierarchy().get(role);
    if (locationTypeCode == null) {
      logger.warn(
          "Role '{}' not found in configuration. Available roles: {}",
          role,
          config.getRoleHierarchy().keySet());
      throw new IllegalArgumentException("Role not configured: " + role);
    }

    AccessLevel level = AccessLevel.fromTypeCode(locationTypeCode);
    if (level == null) {
      logger.error("Invalid location type code '{}' for role '{}'", locationTypeCode, role);
      throw new IllegalArgumentException(
          "Invalid location type code '" + locationTypeCode + "' for role '" + role + "'");
    }
    return level;
  }

  /**
   * Checks if the given role exists in the configuration.
   *
   * @param role the role to check
   * @return true if the role is configured
   */
  public boolean isRoleConfigured(String role) {
    return config.getRoleHierarchy().containsKey(role);
  }

  /**
   * Gets all configured roles.
   *
   * @return set of all role names
   */
  @VisibleForTesting
  Set<String> getConfiguredRoles() {
    return config.getRoleHierarchy().keySet();
  }
}

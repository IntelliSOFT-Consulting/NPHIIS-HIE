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
import com.google.gson.Gson;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Configuration class for location-based access control. Loads role hierarchy and extension URLs
 * from a JSON configuration file.
 */
public class LocationAccessConfig {

  private static final Logger logger = LoggerFactory.getLogger(LocationAccessConfig.class);
  private static final String DEFAULT_CONFIG_PATH = "/location-access-config.json";

  private Map<String, String> roleHierarchy;
  private String locationTagSystem;
  private String practitionerClaimName;
  private String locationExtensionUrl;
  private String roleExtensionUrl;

  private LocationAccessConfig() {
    // Private constructor for GSON
  }

  /**
   * Loads the configuration from the default configuration file.
   *
   * @return the loaded configuration
   * @throws IOException if the configuration cannot be loaded
   */
  public static LocationAccessConfig loadDefault() throws IOException {
    return loadFromPath(DEFAULT_CONFIG_PATH);
  }

  /**
   * Loads the configuration from a specified path in the classpath.
   *
   * @param configPath the path to the configuration file
   * @return the loaded configuration
   * @throws IOException if the configuration cannot be loaded
   */
  @VisibleForTesting
  static LocationAccessConfig loadFromPath(String configPath) throws IOException {
    try (InputStream inputStream = LocationAccessConfig.class.getResourceAsStream(configPath)) {
      if (inputStream == null) {
        throw new IOException("Configuration file not found: " + configPath);
      }
      Gson gson = new Gson();
      LocationAccessConfig config =
          gson.fromJson(
              new InputStreamReader(inputStream, StandardCharsets.UTF_8),
              LocationAccessConfig.class);
      config.validate();
      logger.info("Successfully loaded location access configuration from {}", configPath);
      return config;
    }
  }

  /** Validates that all required configuration fields are present. */
  private void validate() throws IOException {
    if (roleHierarchy == null || roleHierarchy.isEmpty()) {
      throw new IOException("roleHierarchy is required in configuration");
    }
    if (locationTagSystem == null || locationTagSystem.isEmpty()) {
      throw new IOException("locationTagSystem is required in configuration");
    }
    if (practitionerClaimName == null || practitionerClaimName.isEmpty()) {
      throw new IOException("practitionerClaimName is required in configuration");
    }
    if (locationExtensionUrl == null || locationExtensionUrl.isEmpty()) {
      throw new IOException("locationExtensionUrl is required in configuration");
    }
    if (roleExtensionUrl == null || roleExtensionUrl.isEmpty()) {
      throw new IOException("roleExtensionUrl is required in configuration");
    }
  }

  /**
   * Gets the role hierarchy mapping from role names to access levels.
   *
   * @return the role hierarchy map
   */
  public Map<String, String> getRoleHierarchy() {
    return roleHierarchy;
  }

  /**
   * Gets the system URL used for location tags.
   *
   * @return the location tag system URL
   */
  public String getLocationTagSystem() {
    return locationTagSystem;
  }

  /**
   * Gets the JWT claim name that contains the Practitioner ID.
   *
   * @return the practitioner claim name
   */
  public String getPractitionerClaimName() {
    return practitionerClaimName;
  }

  /**
   * Gets the extension URL used to store location references in Practitioner resources.
   *
   * @return the location extension URL
   */
  public String getLocationExtensionUrl() {
    return locationExtensionUrl;
  }

  /**
   * Gets the extension URL used to store role information in Practitioner resources.
   *
   * @return the role extension URL
   */
  public String getRoleExtensionUrl() {
    return roleExtensionUrl;
  }
}

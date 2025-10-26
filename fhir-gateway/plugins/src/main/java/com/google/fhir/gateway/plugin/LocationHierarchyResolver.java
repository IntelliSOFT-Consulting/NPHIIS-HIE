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

import ca.uhn.fhir.context.FhirContext;
import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;
import com.google.common.escape.Escaper;
import com.google.common.net.UrlEscapers;
import com.google.fhir.gateway.HttpFhirClient;
import com.google.fhir.gateway.HttpUtil;
import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.apache.http.HttpResponse;
import org.hl7.fhir.r4.model.Extension;
import org.hl7.fhir.r4.model.Location;
import org.hl7.fhir.r4.model.Practitioner;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.StringType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Resolves the location hierarchy for a practitioner. Fetches the practitioner's assigned location
 * from their FHIR resource and recursively resolves parent locations via the partOf attribute.
 */
public class LocationHierarchyResolver {

  private static final Logger logger = LoggerFactory.getLogger(LocationHierarchyResolver.class);
  private static final int MAX_HIERARCHY_DEPTH = 20; // Prevent infinite loops
  private final Escaper PARAM_ESCAPER = UrlEscapers.urlFormParameterEscaper();

  private final HttpFhirClient httpFhirClient;
  private final FhirContext fhirContext;
  private final LocationAccessConfig config;
  private final RoleBasedAccessScopeResolver scopeResolver;

  // Cache for the current request
  private final Set<String> cachedLocationIds = new HashSet<>();

  public LocationHierarchyResolver(
      HttpFhirClient httpFhirClient,
      FhirContext fhirContext,
      LocationAccessConfig config,
      RoleBasedAccessScopeResolver scopeResolver) {
    Preconditions.checkNotNull(httpFhirClient, "HttpFhirClient cannot be null");
    Preconditions.checkNotNull(fhirContext, "FhirContext cannot be null");
    Preconditions.checkNotNull(config, "LocationAccessConfig cannot be null");
    Preconditions.checkNotNull(scopeResolver, "RoleBasedAccessScopeResolver cannot be null");
    this.httpFhirClient = httpFhirClient;
    this.fhirContext = fhirContext;
    this.config = config;
    this.scopeResolver = scopeResolver;
  }

  /** Container for practitioner context including their role and primary location. */
  public static class PractitionerContext {
    private final String role;
    private final String primaryLocationId;

    public PractitionerContext(String role, String primaryLocationId) {
      this.role = role;
      this.primaryLocationId = primaryLocationId;
    }

    public String getRole() {
      return role;
    }

    public String getPrimaryLocationId() {
      return primaryLocationId;
    }
  }

  /**
   * Fetches and parses practitioner information from the FHIR server.
   *
   * @param practitionerId the ID of the practitioner
   * @return PractitionerContext containing role and location information
   * @throws IOException if the practitioner cannot be fetched or parsed
   */
  public PractitionerContext getPractitionerContext(String practitionerId) throws IOException {
    Preconditions.checkNotNull(practitionerId, "Practitioner ID cannot be null");
    Preconditions.checkArgument(!practitionerId.isEmpty(), "Practitioner ID cannot be empty");

    logger.debug("Fetching practitioner with ID: {}", practitionerId);
    String practitionerPath =
        String.format("/Practitioner/%s", PARAM_ESCAPER.escape(practitionerId));
    HttpResponse response = httpFhirClient.getResource(practitionerPath);
    HttpUtil.validateResponseEntityOrFail(response, practitionerPath);

    Practitioner practitioner =
        (Practitioner) fhirContext.newJsonParser().parseResource(response.getEntity().getContent());

    // Extract role from extension
    String role = extractRoleFromPractitioner(practitioner);
    if (role == null || role.isEmpty()) {
      throw new IOException(
          "No role found for practitioner "
              + practitionerId
              + " in extension "
              + config.getRoleExtensionUrl());
    }

    // Extract location reference from extension
    String locationId = extractLocationFromPractitioner(practitioner);
    if (locationId == null || locationId.isEmpty()) {
      throw new IOException(
          "No location found for practitioner "
              + practitionerId
              + " in extension "
              + config.getLocationExtensionUrl());
    }

    logger.info(
        "Practitioner {} has role '{}' and primary location '{}'",
        practitionerId,
        role,
        locationId);
    return new PractitionerContext(role, locationId);
  }

  /**
   * Extracts the role from a Practitioner resource.
   *
   * @param practitioner the practitioner resource
   * @return the role string, or null if not found
   */
  @VisibleForTesting
  String extractRoleFromPractitioner(Practitioner practitioner) {
    List<Extension> extensions = practitioner.getExtensionsByUrl(config.getRoleExtensionUrl());
    if (extensions.isEmpty()) {
      logger.warn("No role extension found at URL: {}", config.getRoleExtensionUrl());
      return null;
    }
    Extension roleExtension = extensions.get(0);
    if (roleExtension.getValue() instanceof StringType) {
      return ((StringType) roleExtension.getValue()).getValue();
    }
    logger.warn("Role extension value is not a StringType");
    return null;
  }

  /**
   * Extracts the location ID from a Practitioner resource.
   *
   * @param practitioner the practitioner resource
   * @return the location ID (without "Location/" prefix), or null if not found
   */
  @VisibleForTesting
  String extractLocationFromPractitioner(Practitioner practitioner) {
    List<Extension> extensions = practitioner.getExtensionsByUrl(config.getLocationExtensionUrl());
    if (extensions.isEmpty()) {
      logger.warn("No location extension found at URL: {}", config.getLocationExtensionUrl());
      return null;
    }
    Extension locationExtension = extensions.get(0);
    if (locationExtension.getValue() instanceof Reference) {
      Reference locationRef = (Reference) locationExtension.getValue();
      String reference = locationRef.getReference();
      if (reference != null && reference.startsWith("Location/")) {
        return reference.substring("Location/".length());
      }
      logger.warn("Location reference does not start with 'Location/': {}", reference);
      return reference; // Return as-is if it doesn't have prefix
    }
    logger.warn("Location extension value is not a Reference");
    return null;
  }


  /**
   * Traverses the location hierarchy upward from a starting location, following partOf references.
   *
   * @param startLocationId the starting location ID
   * @return set of all parent location IDs
   * @throws IOException if locations cannot be fetched
   */
  @VisibleForTesting
  Set<String> traverseLocationHierarchyUpward(String startLocationId) throws IOException {
    Set<String> hierarchyIds = new HashSet<>();
    String currentLocationId = startLocationId;
    int depth = 0;

    while (currentLocationId != null && depth < MAX_HIERARCHY_DEPTH) {
      if (cachedLocationIds.contains(currentLocationId)) {
        // Already processed this location in the hierarchy
        break;
      }

      Location location = fetchLocation(currentLocationId);
      cachedLocationIds.add(currentLocationId);

      // Check if this location has a parent (partOf)
      if (location.hasPartOf() && location.getPartOf().hasReference()) {
        String partOfReference = location.getPartOf().getReference();
        if (partOfReference.startsWith("Location/")) {
          currentLocationId = partOfReference.substring("Location/".length());
          hierarchyIds.add(currentLocationId);
        } else {
          // Reference doesn't follow expected format
          logger.warn("Unexpected partOf reference format: {}", partOfReference);
          currentLocationId = null;
        }
      } else {
        // Reached the top of the hierarchy
        currentLocationId = null;
      }
      depth++;
    }

    if (depth >= MAX_HIERARCHY_DEPTH) {
      logger.warn("Maximum hierarchy depth reached, possible circular reference");
    }

    return hierarchyIds;
  }

  /**
   * Finds the location at a specific level in the hierarchy by traversing upward from a facility
   * and checking each Location's type.code. This is used to check if a user has access to a
   * resource tagged with a facility.
   *
   * @param facilityId the facility location ID (from resource tag)
   * @param targetLevel the target access level (determines which type.code to look for)
   * @return the location ID at that level, or null if not found
   * @throws IOException if locations cannot be fetched
   */
  public String findLocationAtLevel(
      String facilityId, RoleBasedAccessScopeResolver.AccessLevel targetLevel) throws IOException {
    String targetTypeCode = targetLevel.getLocationTypeCode();
    logger.debug(
        "Finding location with type '{}' in hierarchy starting from facility {}",
        targetTypeCode,
        facilityId);

    String currentId = facilityId;
    Set<String> visited = new HashSet<>();

    while (currentId != null && visited.size() < MAX_HIERARCHY_DEPTH) {
      if (visited.contains(currentId)) {
        logger.warn("Circular reference detected in location hierarchy");
        return null;
      }
      visited.add(currentId);

      Location location = fetchLocation(currentId);

      // Check if this location's type matches the target level
      if (location.hasType() && !location.getType().isEmpty()) {
        for (org.hl7.fhir.r4.model.CodeableConcept typeCodeable : location.getType()) {
          if (typeCodeable.hasCoding()) {
            for (org.hl7.fhir.r4.model.Coding coding : typeCodeable.getCoding()) {
              String foundCode = coding.getCode();
              logger.debug(
                  "Location {} has type.code '{}', looking for '{}'",
                  currentId,
                  foundCode,
                  targetTypeCode);
              if (targetTypeCode.equals(foundCode)) {
                logger.info("✓ MATCH! Found location {} with type '{}'", currentId, targetTypeCode);
                return currentId;
              }
            }
          }
        }
      } else {
        logger.warn("Location {} has NO type.code defined!", currentId);
      }

      // Move to parent location
      if (location.hasPartOf() && location.getPartOf().hasReference()) {
        String partOfRef = location.getPartOf().getReference();
        if (partOfRef.startsWith("Location/")) {
          currentId = partOfRef.substring("Location/".length());
        } else {
          logger.warn("Unexpected partOf reference format: {}", partOfRef);
          break;
        }
      } else {
        // Reached top of hierarchy without finding target level
        logger.debug(
            "Reached top of hierarchy without finding type '{}' starting from facility {}",
            targetTypeCode,
            facilityId);
        break;
      }
    }

    if (visited.size() >= MAX_HIERARCHY_DEPTH) {
      logger.warn("Maximum hierarchy depth reached while searching for type '{}'", targetTypeCode);
    }

    logger.debug(
        "Could not find location with type '{}' in hierarchy starting from {}",
        targetTypeCode,
        facilityId);
    return null;
  }

  /**
   * Fetches a Location resource from the FHIR server.
   *
   * @param locationId the location ID
   * @return the Location resource
   * @throws IOException if the location cannot be fetched
   */
  @VisibleForTesting
  Location fetchLocation(String locationId) throws IOException {
    String locationPath = String.format("/Location/%s", PARAM_ESCAPER.escape(locationId));
    logger.debug("Fetching location: {}", locationPath);
    HttpResponse response = httpFhirClient.getResource(locationPath);
    HttpUtil.validateResponseEntityOrFail(response, locationPath);
    return (Location) fhirContext.newJsonParser().parseResource(response.getEntity().getContent());
  }
}

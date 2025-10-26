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
import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;
import org.hl7.fhir.r4.model.Coding;
import org.hl7.fhir.r4.model.Meta;
import org.hl7.fhir.r4.model.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Utility class for injecting and validating location tags in FHIR resource metadata. Tags are used
 * to mark resources with their associated locations for access control purposes.
 */
public class LocationTagMutator {

  private static final Logger logger = LoggerFactory.getLogger(LocationTagMutator.class);

  private final LocationAccessConfig config;
  private final String primaryLocationId;
  private final String userAssignedLocationId;
  private final RoleBasedAccessScopeResolver.AccessLevel userAccessLevel;
  private final LocationHierarchyResolver hierarchyResolver;

  public LocationTagMutator(
      LocationAccessConfig config,
      String primaryLocationId,
      String userAssignedLocationId,
      RoleBasedAccessScopeResolver.AccessLevel userAccessLevel,
      LocationHierarchyResolver hierarchyResolver) {
    Preconditions.checkNotNull(config, "LocationAccessConfig cannot be null");
    Preconditions.checkNotNull(primaryLocationId, "Primary location ID cannot be null");
    Preconditions.checkNotNull(userAssignedLocationId, "User assigned location ID cannot be null");
    Preconditions.checkNotNull(userAccessLevel, "User access level cannot be null");
    Preconditions.checkNotNull(hierarchyResolver, "LocationHierarchyResolver cannot be null");
    this.config = config;
    this.primaryLocationId = primaryLocationId;
    this.userAssignedLocationId = userAssignedLocationId;
    this.userAccessLevel = userAccessLevel;
    this.hierarchyResolver = hierarchyResolver;
  }

  /**
   * Injects or validates location tags for a resource. If the resource has no location tags,
   * injects the user's primary location. If tags exist, validates that at least one matches the
   * user's accessible locations.
   *
   * @param resource the FHIR resource to process
   * @return true if the resource has valid location tags or tags were successfully injected
   */
  public boolean injectOrValidateLocationTags(Resource resource) {
    Preconditions.checkNotNull(resource, "Resource cannot be null");

    if (!resource.hasMeta()) {
      resource.setMeta(new Meta());
    }

    Meta meta = resource.getMeta();
    List<Coding> existingLocationTags = getLocationTags(meta);

    if (existingLocationTags.isEmpty()) {
      // No location tags exist, inject the primary location
      logger.debug(
          "No location tags found on {} resource, injecting primary location {}",
          resource.getResourceType(),
          primaryLocationId);
      injectPrimaryLocationTag(meta);
      return true;
    } else {
      // Tags exist, validate at least one matches accessible locations
      boolean hasValidTag = validateLocationTags(existingLocationTags);
      if (!hasValidTag) {
        logger.warn(
            "Resource {} has location tags but none match accessible locations",
            resource.getIdElement().getValue());
      }
      return hasValidTag;
    }
  }

  /**
   * Validates that a resource has location tags matching the user's accessible locations.
   *
   * @param resource the resource to validate
   * @return true if the resource has at least one valid location tag
   */
  public boolean hasValidLocationTags(Resource resource) {
    Preconditions.checkNotNull(resource, "Resource cannot be null");

    if (!resource.hasMeta()) {
      logger.debug("Resource has no metadata, no location tags to validate");
      return false;
    }

    List<Coding> locationTags = getLocationTags(resource.getMeta());
    if (locationTags.isEmpty()) {
      logger.debug("Resource has no location tags");
      return false;
    }

    return validateLocationTags(locationTags);
  }

  /**
   * Injects the primary location tag into the resource metadata. IMPORTANT: Only injects FACILITY
   * level tags. If the user is assigned to a higher level (Ward, SubCounty, County, National), we
   * cannot automatically tag the resource as we don't know which specific facility it belongs to.
   * In such cases, the resource must already have a facility tag.
   *
   * @param meta the resource metadata
   */
  @VisibleForTesting
  void injectPrimaryLocationTag(Meta meta) {
    Coding locationTag = new Coding();
    locationTag.setSystem(config.getLocationTagSystem());
    locationTag.setCode("Location/" + primaryLocationId);
    // Optionally set display name if available
    meta.addTag(locationTag);
    logger.debug("Injected location tag: {}", locationTag.getCode());
  }

  /**
   * Retrieves all location tags from resource metadata.
   *
   * @param meta the resource metadata
   * @return list of location tag codings
   */
  @VisibleForTesting
  List<Coding> getLocationTags(Meta meta) {
    return meta.getTag().stream()
        .filter(tag -> config.getLocationTagSystem().equals(tag.getSystem()))
        .collect(Collectors.toList());
  }

  /**
   * Validates that at least one location tag matches the user's accessible location. Resources are
   * tagged with FACILITY-level locations only. The validation algorithm:
   *
   * <p>1. Extract facility ID from resource tag 2. Traverse UPWARD from facility to find location
   * at user's role level (e.g., SUBCOUNTY) 3. Compare: does that location == user's assigned
   * location?
   *
   * <p>Example: - User: SUBCOUNTY officer assigned to SubCounty2 - Resource: tagged with Facility5
   * - Traverse: Facility5 → Ward3 → SubCounty2 → County1 - Extract at SUBCOUNTY level: SubCounty2 -
   * Compare: SubCounty2 == SubCounty2? YES → Access granted
   *
   * @param locationTags the list of location tags from the resource (should be facility IDs)
   * @return true if the facility's location at user's role level matches user's assigned location
   */
  @VisibleForTesting
  boolean validateLocationTags(List<Coding> locationTags) {
    for (Coding tag : locationTags) {
      String code = tag.getCode();
      if (code != null) {
        // Extract location ID from code (format: "Location/123")
        String facilityId = extractLocationIdFromCode(code);

        try {
          // Find the location at the user's role level in the facility's hierarchy
          String locationAtUserLevel =
              hierarchyResolver.findLocationAtLevel(facilityId, userAccessLevel);

          if (locationAtUserLevel != null && locationAtUserLevel.equals(userAssignedLocationId)) {
            logger.debug(
                "Access granted: Facility {}'s {} level location ({}) matches user's assigned"
                    + " location ({})",
                facilityId,
                userAccessLevel,
                locationAtUserLevel,
                userAssignedLocationId);
            return true;
          } else {
            logger.debug(
                "Access denied: Facility {}'s {} level location ({}) does NOT match user's"
                    + " assigned location ({})",
                facilityId,
                userAccessLevel,
                locationAtUserLevel,
                userAssignedLocationId);
          }
        } catch (IOException e) {
          logger.error("Failed to traverse hierarchy for facility {}", facilityId, e);
          // Continue checking other tags
        }
      }
    }
    logger.debug(
        "No location tags grant access. Resource tags: {}, User: {} at {}",
        locationTags.stream().map(Coding::getCode).collect(Collectors.toList()),
        userAccessLevel,
        userAssignedLocationId);
    return false;
  }

  /**
   * Extracts the location ID from a tag code.
   *
   * @param code the tag code (e.g., "Location/123")
   * @return the location ID (e.g., "123")
   */
  @VisibleForTesting
  String extractLocationIdFromCode(String code) {
    if (code.startsWith("Location/")) {
      return code.substring("Location/".length());
    }
    // If code doesn't have prefix, return as-is
    return code;
  }

  /**
   * Creates a location tag coding for a given location ID.
   *
   * @param locationId the location ID
   * @return the Coding object representing the location tag
   */
  public Coding createLocationTag(String locationId) {
    Coding tag = new Coding();
    tag.setSystem(config.getLocationTagSystem());
    tag.setCode("Location/" + locationId);
    return tag;
  }
}

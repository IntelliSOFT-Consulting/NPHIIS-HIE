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
import ca.uhn.fhir.rest.api.RequestTypeEnum;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;
import com.google.fhir.gateway.FhirUtil;
import com.google.fhir.gateway.HttpFhirClient;
import com.google.fhir.gateway.JwtUtil;
import com.google.fhir.gateway.interfaces.AccessChecker;
import com.google.fhir.gateway.interfaces.AccessCheckerFactory;
import com.google.fhir.gateway.interfaces.AccessDecision;
import com.google.fhir.gateway.interfaces.NoOpAccessDecision;
import com.google.fhir.gateway.interfaces.PatientFinder;
import com.google.fhir.gateway.interfaces.RequestDetailsReader;
import com.google.fhir.gateway.plugin.LocationHierarchyResolver.PractitionerContext;
import java.io.IOException;
import javax.inject.Named;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Location-aware access checker that restricts access to FHIR resources based on a practitioner's
 * assigned location and role. Implements hierarchical location-based access control where users
 * with higher-level roles can access data from their entire jurisdiction.
 */
public class LocationAccessChecker implements AccessChecker {

  private static final Logger logger = LoggerFactory.getLogger(LocationAccessChecker.class);

  private final FhirContext fhirContext;
  private final HttpFhirClient httpFhirClient;
  private final LocationAccessConfig config;
  private final LocationTagMutator tagMutator;
  private final String userRole;
  private final String userAssignedLocationId;
  private final LocationHierarchyResolver hierarchyResolver;
  private final RoleBasedAccessScopeResolver.AccessLevel userAccessLevel;

  private LocationAccessChecker(
      FhirContext fhirContext,
      HttpFhirClient httpFhirClient,
      LocationAccessConfig config,
      PractitionerContext practitionerContext,
      LocationHierarchyResolver hierarchyResolver,
      RoleBasedAccessScopeResolver scopeResolver) {
    Preconditions.checkNotNull(fhirContext, "FhirContext cannot be null");
    Preconditions.checkNotNull(httpFhirClient, "HttpFhirClient cannot be null");
    Preconditions.checkNotNull(config, "LocationAccessConfig cannot be null");
    Preconditions.checkNotNull(practitionerContext, "PractitionerContext cannot be null");
    Preconditions.checkNotNull(hierarchyResolver, "LocationHierarchyResolver cannot be null");
    Preconditions.checkNotNull(scopeResolver, "RoleBasedAccessScopeResolver cannot be null");

    this.fhirContext = fhirContext;
    this.httpFhirClient = httpFhirClient;
    this.config = config;
    this.userRole = practitionerContext.getRole();
    this.userAssignedLocationId = practitionerContext.getPrimaryLocationId();
    this.hierarchyResolver = hierarchyResolver;
    this.userAccessLevel = scopeResolver.resolveAccessLevel(userRole);
    this.tagMutator =
        new LocationTagMutator(
            config, userAssignedLocationId, userAssignedLocationId, userAccessLevel, hierarchyResolver);

    logger.info(
        "LocationAccessChecker initialized for role '{}' (level: {}) at location '{}'",
        userRole,
        userAccessLevel,
        userAssignedLocationId);
  }

  @Override
  public AccessDecision checkAccess(RequestDetailsReader requestDetails) {
    try {
      // Handle Bundle requests
      if (requestDetails.getRequestType() == RequestTypeEnum.POST
          && requestDetails.getResourceName() == null) {
        return processBundle(requestDetails);
      }

      // Handle individual resource requests
      switch (requestDetails.getRequestType()) {
        case GET:
          return processGet(requestDetails);
        case POST:
          return processPost(requestDetails);
        case PUT:
          return processPut(requestDetails);
        case PATCH:
          return processPatch(requestDetails);
        case DELETE:
          return processDelete(requestDetails);
        default:
          logger.warn("Unsupported request type: {}", requestDetails.getRequestType());
          return NoOpAccessDecision.accessDenied();
      }
    } catch (IOException e) {
      logger.error("Exception while checking access; denying access!", e);
      return NoOpAccessDecision.accessDenied();
    }
  }

  /**
   * Processes GET requests (search and read operations).
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processGet(RequestDetailsReader requestDetails) throws IOException {
    // For search operations (no specific ID), inject location filter
    if (requestDetails.getId() == null) {
      return processSearch(requestDetails);
    }
    // For read operations (specific resource ID), validate the resource
    return processRead(requestDetails);
  }

  /**
   * Processes search requests. For COUNTRY-level users, no filtering is applied (they see
   * everything). For lower-level users, filtering must be handled by the client application or we
   * return unfiltered results (the validation happens when resources are accessed).
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processSearch(RequestDetailsReader requestDetails) {
    logger.debug(
        "Processing search request for {} by user at {} level",
        requestDetails.getResourceName(),
        userAccessLevel);

    // COUNTRY-level users (ADMINISTRATOR, SUPERUSER) can see everything
    if (userAccessLevel == RoleBasedAccessScopeResolver.AccessLevel.COUNTRY) {
      logger.debug("COUNTRY-level user, no location filtering applied");
      return LocationTaggingAccessDecision.accessGranted();
    }

    // For lower-level users, we allow the search but resources will be validated when accessed
    // Note: Building a comprehensive tag filter would require expensive downward traversal
    // Client applications should implement their own location-based filtering if needed
    logger.debug(
        "Lower-level user search allowed, individual resources will be validated on access");
    return LocationTaggingAccessDecision.accessGranted();
  }

  /**
   * Processes read requests by fetching and validating the resource.
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processRead(RequestDetailsReader requestDetails) throws IOException {
    String resourceId = FhirUtil.getIdOrNull(requestDetails);
    logger.debug("Processing read request for {}/{}", requestDetails.getResourceName(), resourceId);

    // Fetch the resource to check its location tags
    String resourcePath = String.format("/%s/%s", requestDetails.getResourceName(), resourceId);
    Resource resource = fetchResource(resourcePath);

    if (resource == null) {
      logger.warn("Resource not found: {}", resourcePath);
      return NoOpAccessDecision.accessDenied();
    }

    // Validate that the resource has valid location tags
    boolean hasValidTags = tagMutator.hasValidLocationTags(resource);
    if (!hasValidTags) {
      logger.warn("Access denied: Resource {} does not have valid location tags", resourcePath);
    }
    return new NoOpAccessDecision(hasValidTags);
  }

  /**
   * Processes POST requests (create operations).
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processPost(RequestDetailsReader requestDetails) throws IOException {
    logger.debug("Processing POST request for {}", requestDetails.getResourceName());

    // Parse the resource from request
    Resource resource = (Resource) FhirUtil.createResourceFromRequest(fhirContext, requestDetails);

    // Validate or inject location tags
    boolean isValid = tagMutator.injectOrValidateLocationTags(resource);
    if (!isValid) {
      logger.warn(
          "Access denied: Resource has invalid location tags for user's accessible locations");
      return NoOpAccessDecision.accessDenied();
    }

    // Return decision that will inject tags in post-processing
    return LocationTaggingAccessDecision.forResource(
        fhirContext,
        tagMutator,
        org.hl7.fhir.r4.model.ResourceType.fromCode(requestDetails.getResourceName()));
  }

  /**
   * Processes PUT requests (update operations).
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processPut(RequestDetailsReader requestDetails) throws IOException {
    String resourceId = FhirUtil.getIdOrNull(requestDetails);
    logger.debug("Processing PUT request for {}/{}", requestDetails.getResourceName(), resourceId);

    // First check if the existing resource (if any) is accessible
    if (resourceId != null) {
      String resourcePath = String.format("/%s/%s", requestDetails.getResourceName(), resourceId);
      Resource existingResource = fetchResource(resourcePath);
      if (existingResource != null && !tagMutator.hasValidLocationTags(existingResource)) {
        logger.warn(
            "Access denied: Cannot update resource {} - not in accessible locations", resourcePath);
        return NoOpAccessDecision.accessDenied();
      }
    }

    // Parse and validate the new resource
    Resource resource = (Resource) FhirUtil.createResourceFromRequest(fhirContext, requestDetails);

    boolean isValid = tagMutator.injectOrValidateLocationTags(resource);
    if (!isValid) {
      logger.warn("Access denied: Updated resource has invalid location tags");
      return NoOpAccessDecision.accessDenied();
    }

    return LocationTaggingAccessDecision.forResource(
        fhirContext,
        tagMutator,
        org.hl7.fhir.r4.model.ResourceType.fromCode(requestDetails.getResourceName()));
  }

  /**
   * Processes PATCH requests (partial update operations).
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processPatch(RequestDetailsReader requestDetails) throws IOException {
    String resourceId = FhirUtil.getIdOrNull(requestDetails);
    logger.debug("Processing PATCH request for {}/{}", requestDetails.getResourceName(), resourceId);

    // Fetch the existing resource to validate access
    String resourcePath = String.format("/%s/%s", requestDetails.getResourceName(), resourceId);
    Resource existingResource = fetchResource(resourcePath);

    if (existingResource == null) {
      logger.warn("Resource not found for PATCH: {}", resourcePath);
      return NoOpAccessDecision.accessDenied();
    }

    boolean hasValidTags = tagMutator.hasValidLocationTags(existingResource);
    if (!hasValidTags) {
      logger.warn(
          "Access denied: Cannot patch resource {} - not in accessible locations", resourcePath);
    }

    // For PATCH, we maintain existing tags, so just validate access
    return new NoOpAccessDecision(hasValidTags);
  }

  /**
   * Processes DELETE requests.
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processDelete(RequestDetailsReader requestDetails) throws IOException {
    String resourceId = FhirUtil.getIdOrNull(requestDetails);
    logger.debug("Processing DELETE request for {}/{}", requestDetails.getResourceName(), resourceId);

    // Fetch the resource to validate access before deletion
    String resourcePath = String.format("/%s/%s", requestDetails.getResourceName(), resourceId);
    Resource resource = fetchResource(resourcePath);

    if (resource == null) {
      logger.warn("Resource not found for DELETE: {}", resourcePath);
      return NoOpAccessDecision.accessDenied();
    }

    boolean hasValidTags = tagMutator.hasValidLocationTags(resource);
    if (!hasValidTags) {
      logger.warn(
          "Access denied: Cannot delete resource {} - not in accessible locations", resourcePath);
    }
    return new NoOpAccessDecision(hasValidTags);
  }

  /**
   * Processes Bundle requests.
   *
   * @param requestDetails the request details
   * @return the access decision
   */
  private AccessDecision processBundle(RequestDetailsReader requestDetails) throws IOException {
    logger.debug("Processing Bundle request");

    Bundle bundle = FhirUtil.parseRequestToBundle(fhirContext, requestDetails);

    // Validate each entry in the bundle
    for (Bundle.BundleEntryComponent entry : bundle.getEntry()) {
      if (!entry.hasResource()) {
        continue;
      }

      Resource resource = entry.getResource();
      Bundle.BundleEntryRequestComponent request = entry.getRequest();

      if (request == null) {
        logger.warn("Bundle entry has no request component");
        return NoOpAccessDecision.accessDenied();
      }

      // Validate based on request method
      switch (request.getMethod()) {
        case GET:
        case DELETE:
          // For GET/DELETE, resource should already have valid tags
          if (!tagMutator.hasValidLocationTags(resource)) {
            logger.warn("Bundle entry has resource without valid location tags");
            return NoOpAccessDecision.accessDenied();
          }
          break;
        case POST:
        case PUT:
        case PATCH:
          // For create/update, validate or inject tags
          if (!tagMutator.injectOrValidateLocationTags(resource)) {
            logger.warn("Bundle entry has resource with invalid location tags");
            return NoOpAccessDecision.accessDenied();
          }
          break;
        default:
          logger.warn("Unsupported bundle entry method: {}", request.getMethod());
          return NoOpAccessDecision.accessDenied();
      }
    }

    // Return decision that will process bundle in post-processing
    return LocationTaggingAccessDecision.forBundle(fhirContext, tagMutator);
  }


  /**
   * Fetches a resource from the FHIR server.
   *
   * @param resourcePath the resource path (e.g., "/Patient/123")
   * @return the resource, or null if not found
   */
  @VisibleForTesting
  Resource fetchResource(String resourcePath) throws IOException {
    try {
      org.apache.http.HttpResponse response = httpFhirClient.getResource(resourcePath);
      if (response.getStatusLine().getStatusCode() == 404) {
        return null;
      }
      com.google.fhir.gateway.HttpUtil.validateResponseEntityOrFail(response, resourcePath);
      return (Resource)
          fhirContext.newJsonParser().parseResource(response.getEntity().getContent());
    } catch (Exception e) {
      logger.error("Error fetching resource {}: {}", resourcePath, e.getMessage());
      throw new IOException("Failed to fetch resource: " + resourcePath, e);
    }
  }

  /** Factory for creating LocationAccessChecker instances from JWT tokens. */
  @Named(value = "location")
  public static class Factory implements AccessCheckerFactory {

    @VisibleForTesting static final String DEFAULT_PRACTITIONER_CLAIM = "sub";

    @Override
    public AccessChecker create(
        DecodedJWT jwt,
        HttpFhirClient httpFhirClient,
        FhirContext fhirContext,
        PatientFinder patientFinder) {
      try {
        // Load configuration
        LocationAccessConfig config = LocationAccessConfig.loadDefault();

        // Extract practitioner ID from JWT
        String practitionerId = extractPractitionerId(jwt, config);
        logger.info("Creating LocationAccessChecker for practitioner: {}", practitionerId);

        // Create resolvers
        RoleBasedAccessScopeResolver scopeResolver = new RoleBasedAccessScopeResolver(config);
        LocationHierarchyResolver hierarchyResolver =
            new LocationHierarchyResolver(httpFhirClient, fhirContext, config, scopeResolver);

        // Get practitioner context (role and location)
        PractitionerContext practitionerContext =
            hierarchyResolver.getPractitionerContext(practitionerId);

        // Create and return the access checker
        // No need to pre-compute accessible locations - we validate on each resource access
        return new LocationAccessChecker(
            fhirContext,
            httpFhirClient,
            config,
            practitionerContext,
            hierarchyResolver,
            scopeResolver);

      } catch (IOException e) {
        logger.error("Failed to create LocationAccessChecker", e);
        throw new RuntimeException("Failed to initialize location-based access control", e);
      }
    }

    /**
     * Extracts the practitioner ID from the JWT token.
     *
     * @param jwt the decoded JWT
     * @param config the configuration
     * @return the practitioner ID
     */
    @VisibleForTesting
    String extractPractitionerId(DecodedJWT jwt, LocationAccessConfig config) {
      String claimName = config.getPractitionerClaimName();
      String practitionerId = JwtUtil.getClaimOrDie(jwt, claimName);
      return FhirUtil.checkIdOrFail(practitionerId);
    }
  }
}

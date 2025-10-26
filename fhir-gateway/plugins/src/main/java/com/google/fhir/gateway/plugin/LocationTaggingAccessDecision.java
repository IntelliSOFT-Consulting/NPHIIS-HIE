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
import ca.uhn.fhir.parser.IParser;
import com.google.common.base.Preconditions;
import com.google.common.io.CharStreams;
import com.google.fhir.gateway.HttpUtil;
import com.google.fhir.gateway.interfaces.AccessDecision;
import com.google.fhir.gateway.interfaces.RequestDetailsReader;
import com.google.fhir.gateway.interfaces.RequestMutation;
import java.io.IOException;
import org.apache.http.HttpResponse;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.Resource;
import org.hl7.fhir.r4.model.ResourceType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Custom AccessDecision implementation that injects location tags into resources after they are
 * created or updated. This ensures all resources are properly tagged with location metadata for
 * access control.
 */
public class LocationTaggingAccessDecision implements AccessDecision {

  private static final Logger logger = LoggerFactory.getLogger(LocationTaggingAccessDecision.class);

  private final FhirContext fhirContext;
  private final LocationTagMutator tagMutator;
  private final RequestMutation requestMutation;
  private final ResourceType expectedResourceType;

  private LocationTaggingAccessDecision(
      FhirContext fhirContext,
      LocationTagMutator tagMutator,
      RequestMutation requestMutation,
      ResourceType expectedResourceType) {
    this.fhirContext = fhirContext;
    this.tagMutator = tagMutator;
    this.requestMutation = requestMutation;
    this.expectedResourceType = expectedResourceType;
  }

  /**
   * Creates an AccessDecision for a single resource that will inject location tags.
   *
   * @param fhirContext the FHIR context
   * @param tagMutator the tag mutator for injecting tags
   * @param expectedResourceType the expected resource type in the response
   * @return the AccessDecision
   */
  public static LocationTaggingAccessDecision forResource(
      FhirContext fhirContext, LocationTagMutator tagMutator, ResourceType expectedResourceType) {
    return new LocationTaggingAccessDecision(fhirContext, tagMutator, null, expectedResourceType);
  }

  /**
   * Creates an AccessDecision for a Bundle that will inject location tags.
   *
   * @param fhirContext the FHIR context
   * @param tagMutator the tag mutator for injecting tags
   * @return the AccessDecision
   */
  public static LocationTaggingAccessDecision forBundle(
      FhirContext fhirContext, LocationTagMutator tagMutator) {
    return new LocationTaggingAccessDecision(fhirContext, tagMutator, null, ResourceType.Bundle);
  }

  /**
   * Creates an AccessDecision with request mutation (for search queries).
   *
   * @param requestMutation the request mutation to apply
   * @return the AccessDecision
   */
  public static LocationTaggingAccessDecision withMutation(RequestMutation requestMutation) {
    return new LocationTaggingAccessDecision(null, null, requestMutation, null);
  }

  /**
   * Creates an AccessDecision that simply grants access without post-processing.
   *
   * @return the AccessDecision
   */
  public static LocationTaggingAccessDecision accessGranted() {
    return new LocationTaggingAccessDecision(null, null, null, null);
  }

  @Override
  public boolean canAccess() {
    return true;
  }

  @Override
  public RequestMutation getRequestMutation(RequestDetailsReader requestDetailsReader) {
    return requestMutation;
  }

  @Override
  public String postProcess(RequestDetailsReader requestDetailsReader, HttpResponse response)
      throws IOException {
    // If no tag mutator is configured, skip post-processing
    if (tagMutator == null || fhirContext == null) {
      return null;
    }

    Preconditions.checkState(HttpUtil.isResponseValid(response));
    String content = CharStreams.toString(HttpUtil.readerFromEntity(response.getEntity()));
    IParser parser = fhirContext.newJsonParser();
    IBaseResource resource = parser.parseResource(content);

    // Verify we got the expected resource type
    if (expectedResourceType != null && !resource.fhirType().equals(expectedResourceType.name())) {
      logger.error("Expected {} resource but got {}", expectedResourceType, resource.fhirType());
      return content;
    }

    if (resource instanceof Bundle) {
      processBundle((Bundle) resource, parser);
    } else if (resource instanceof Resource) {
      processResource((Resource) resource);
    }

    // Return the modified resource as JSON
    return parser.encodeResourceToString(resource);
  }

  /**
   * Processes a Bundle by injecting location tags into all entry resources.
   *
   * @param bundle the Bundle resource
   * @param parser the FHIR parser
   */
  private void processBundle(Bundle bundle, IParser parser) {
    logger.debug("Processing Bundle with {} entries", bundle.getEntry().size());
    for (Bundle.BundleEntryComponent entry : bundle.getEntry()) {
      if (entry.hasResource()) {
        Resource entryResource = entry.getResource();
        processResource(entryResource);
      }
    }
  }

  /**
   * Processes a single resource by injecting location tags.
   *
   * @param resource the resource to process
   */
  private void processResource(Resource resource) {
    logger.debug("Injecting location tags into {} resource", resource.getResourceType());
    tagMutator.injectOrValidateLocationTags(resource);
  }
}

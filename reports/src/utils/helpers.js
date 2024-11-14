export const parseNestedJSON = (obj) => {
  if (typeof obj === "string") {
    try {
      const parsed = JSON.parse(obj);

      return parseNestedJSON(parsed);
    } catch (e) {
      return obj;
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => parseNestedJSON(item));
  }

  if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = parseNestedJSON(value);
    }
    return result;
  }

  return obj;
};

export const locationId = (id) => {
  return id?.replace("Location/", "");
};

// Configure logging
const logger = {
  info: console.log,
  error: console.error,
};

/**
 * Get parent location from location dictionary using location ID
 * @param {string} locationId - The ID of the location
 * @param {Object.<string, Object>} locationsDict - Dictionary of locations
 * @returns {Object} Parent location object
 */
export const getParentLocation = (locationId, locationsDict) => {
  if (!locationId || !locationsDict) {
    return {};
  }

  const location = locationsDict[locationId] || {};
  if (!location) {
    return {};
  }

  try {
    const partOf = location.partOf || "{}";
    const reference = partOf?.reference || "";

    if (reference) {
      const parentId = reference.replace("Location/", "");
      return locationsDict[parentId] || {};
    }
    return {};
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error(`Key error when accessing location data for ${locationId}: ${error}`);
    } else {
      logger.error(`Error getting parent location for ${locationId}: ${error}`);
    }
    return {};
  }
};

/**
 * Get complete location hierarchy (ward, subcounty, county) for a facility
 * @param {string} facilityCode - The facility code
 * @param {Object.<string, Object>} locationsDict - Dictionary of locations
 * @returns {Object} Location hierarchy object
 */
export const getLocationHierarchy = (facilityCode, locationsDict) => {
  const defaultHierarchy = {
    ward: "N/A",
    ward_id: null,
    subcounty: "N/A",
    subcounty_id: null,
    county: "N/A",
    county_id: null,
  };

  try {
    if (!facilityCode || !locationsDict) {
      return defaultHierarchy;
    }

    const facility = locationsDict[facilityCode] || {};
    if (!facility) {
      return defaultHierarchy;
    }

    const ward = getParentLocation(facilityCode, locationsDict);
    if (!ward) {
      return defaultHierarchy;
    }

    const hierarchy = {
      ...defaultHierarchy,
      ward: ward.name || "N/A",
      ward_id: ward.id,
    };

    const subcounty = getParentLocation(ward.id, locationsDict);
    if (subcounty) {
      hierarchy.subcounty = subcounty.name || "N/A";
      hierarchy.subcounty_id = subcounty.id;

      const county = getParentLocation(subcounty.id, locationsDict);
      if (county) {
        hierarchy.county = county.name || "N/A";
        hierarchy.county_id = county.id;
      }
    }

    return hierarchy;
  } catch (error) {
    logger.error(`Error getting location hierarchy for facility ${facilityCode}: ${error}`);
    return defaultHierarchy;
  }
};

/**
 * Process location dictionary to create a mapping of IDs to names
 * @param {Object.<string, Object>} locationsDict - Dictionary of locations
 * @returns {Object.<string, string>} Mapping of location IDs to names
 */
export const processLocationNames = (locationsDict) => {
  try {
    return Object.entries(locationsDict).reduce((acc, [locId, location]) => {
      if (location.name) {
        acc[locId] = location.name;
      }
      return acc;
    }, {});
  } catch (error) {
    logger.error(`Error processing location names: ${error}`);
    return {};
  }
};

export const getLocationName = (locationId, locationsDict) => {
  if (!locationId || !locationsDict) {
    return "N/A";
  }

  const location = locationsDict[locationId] || {};
  return location.name || "N/A";
};

const identificationPriority = ["ID_number", "Passport", "Birth_Certificate", "NEMIS", "Birth_Notification_Number", "SYSTEM_GENERATED"];

export const getPatientIdentifier = (patient) => {
  const identifiers = patient.identifier || [];
  let highestPriorityIdentifier = "N/A";
  let idNumber = null;

  for (const priority of identificationPriority) {
    const identifier = identifiers.find((id) => id.type?.coding?.[0]?.display === priority && id.value);
    if (identifier) {
      highestPriorityIdentifier = identifier.type?.coding?.[0]?.display;
      idNumber = identifier.value;
      break;
    }
  }

  return {
    identifier: highestPriorityIdentifier,
    idNumber,
  };
};

export const locationPriority = (locations) => {
  const { facility, ward, subcounty, county } = locations;
  const priority = ["facility", "ward", "subcounty", "county"];

  for (const loc of priority) {
    if (locations[loc]) {
      return loc === "facility" ? { facilityCode: locations[loc] } : { [loc]: {
        equals: locations[loc],
        mode: "insensitive",
      } };
    }
  }
};

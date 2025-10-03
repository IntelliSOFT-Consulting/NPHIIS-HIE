
// ✅ Do this if using TYPESCRIPT
import { RequestInfo, RequestInit } from 'node-fetch';

const fetch = (url: RequestInfo, init?: RequestInit) =>
    import('node-fetch').then(({ default: fetch }) => fetch(url, init));


export let apiHost = process.env.FHIR_BASE_URL
console.log("HAPI FHIR: ", apiHost)


// a fetch wrapper for HAPI FHIR server.
export const FhirApi = async (params: any) => {
    let _defaultHeaders = { "Content-Type": 'application/json' }
    if (!params.method) {
        params.method = 'GET';
    }
    try {
        let response = await fetch(String(`${apiHost}${params.url}`), {
            headers: _defaultHeaders,
            method: params.method ? String(params.method) : 'GET',
            ...(params.method !== 'GET' && params.method !== 'DELETE') && { body: String(params.data) }
        });
        let responseJSON = await response.json();
        let res = {
            status: "success",
            statusText: response.statusText,
            data: responseJSON
        };
        return res;
    } catch (error) {
        console.error(error);
        let res = {
            statusText: "FHIRFetch: server error",
            status: "error",
            data: error
        };
        console.error(error);
        return res;
    }
}


export const parseIdentifiers = async (patientId: string) => {
    let patient: any = (await FhirApi({ url: `/Patient?identifier=${patientId}`, })).data
    if (!(patient?.total > 0 || patient?.entry.length > 0)) {
        return null;
    }
    let identifiers = patient.entry[0].resource.identifier;
    return identifiers.map((id: any) => {
        return {
            [id.id]: id
        }
    })
}


export const getPatientById = async (crossBorderId: string) => {
    try {
        let patient: any = (await FhirApi({ url: `/Patient?identifier=${crossBorderId}` })).data;
        if (patient?.total > 0 || patient?.entry?.length > 0) {
            patient = patient.entry[0].resource;
            return patient;
        }
        return null;
    } catch (error) {
        console.log(error);
        return null;
    }
}

// Validation helper functions
export const validateRole = (role: string, allowedRoles: string[]): boolean => {
    const normalizedRole = String(role).toUpperCase();
    return allowedRoles.indexOf(normalizedRole) >= 0;
};

export const validateLocationForRole = async (role: string, location: string): Promise<{ isValid: boolean; error?: string; fhirLocation?: any }> => {
    if (!location) {
        return { isValid: true };
    }

    const fhirLocation = await (await FhirApi({ url: `/Location/${location}` })).data;
    const locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;

    switch (role) {
        case "ADMINISTRATOR":
        case "SUPERUSER":
            return { isValid: true, fhirLocation };
        case "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER":
            if (String(locationType) !== String("SUB-COUNTY")) {
                return { isValid: false, error: `Invalid location provided for ${role}` };
            }
            return { isValid: true, fhirLocation };
        case "COUNTY_SYSTEM_ADMINISTRATOR":
            if (locationType !== "COUNTY") {
                return { isValid: false, error: `Invalid location provided for ${role}` };
            }
            return { isValid: true, fhirLocation };
        case "FACILITY_SYSTEM_ADMINISTRATOR":
        case "FACILITY_STORE_MANAGER":
        case "NURSE":
        case "CLERK":
            if (locationType !== "FACILITY") {
                return { isValid: false, error: `Invalid location provided for ${role}` };
            }
            return { isValid: true, fhirLocation };
        default:
            return { isValid: true, fhirLocation };
    }
};

// FHIR practitioner helper functions
export const updatePractitionerLocation = async (userInfo: any, practitioner: any, fhirLocation: any) => {
    // Remove meta tag
    const meta = {
        resourceType: 'Parameters',
        parameter: [
            {
                name: 'meta',
                valueMeta: {
                    tag: practitioner.meta.tag
                },
            },
        ],
    };

    await (await FhirApi({
        url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}/$meta-delete`,
        method: "POST",
        data: JSON.stringify(meta)
    })).data;

    delete practitioner.meta;

    const newLocation = [
        {
            "url": "http://example.org/location",
            "valueReference": {
                "reference": `Location/${fhirLocation.id}`,
                "display": fhirLocation.name
            }
        },
        {
            "url": "http://example.org/fhir/StructureDefinition/role-group",
            "valueString": userInfo?.attributes?.practitionerRole[0]
        }
    ];

    const updatedPractitioner = await (await FhirApi({
        url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}`,
        method: "PUT",
        data: JSON.stringify({
            ...practitioner,
            extension: newLocation,
            meta: {
                tag: [{
                    system: "http://example.org/fhir/StructureDefinition/location",
                    code: `Location/${fhirLocation.id}`
                }]
            }
        })
    })).data;

    return updatedPractitioner;
};

export const buildLocationInfo = async (fhirLocation: any, userInfo: any, heirachy: any[]) => {
    const locationInfo = {
        facility: "", facilityName: "", ward: "", wardName: "",
        subCounty: "", subCountyName: "", county: "", countyName: ""
    };

    if (userInfo.attributes.practitionerRole[0] === "ADMINISTRATOR") {
        return locationInfo;
    }

    const assignedLocationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;
    if (!assignedLocationType || !fhirLocation) {
        return locationInfo;
    }

    // Pre-compute hierarchy mappings for better performance
    const hierarchyMap = new Map();
    const hierarchyKeys = [];
    
    for (const location of heirachy) {
        const key = Object.keys(location)[0];
        const value = location[key];
        hierarchyMap.set(value, key);
        hierarchyKeys.push(key);
    }

    const rootKey = hierarchyMap.get(assignedLocationType);
    if (!rootKey) {
        return locationInfo;
    }

    const rootIndex = hierarchyKeys.indexOf(rootKey);
    const relevantKeys = hierarchyKeys.slice(0, rootIndex + 1).reverse();

    // Collect all location IDs to fetch in parallel
    const locationIds = [fhirLocation.id];
    let currentLocation = fhirLocation;
    
    for (const key of relevantKeys) {
        if (currentLocation?.partOf?.reference) {
            const parentId = currentLocation.partOf.reference.split("/")[1];
            locationIds.push(parentId);
            // We need to fetch each location to get the next parent
            // This is still sequential due to the hierarchical nature, but optimized
        }
    }

    // Build location info by traversing up the hierarchy
    const _locationInfo: any = {
        facility: "", facilityName: "", ward: "", wardName: "",
        subCounty: "", subCountyName: "", county: "", countyName: ""
    };

    let currentId = fhirLocation.id;
    const processedKeys = [...relevantKeys];

    for (const key of processedKeys) {
        try {
            const locationData = await (await FhirApi({ url: `/Location/${currentId}` })).data;
            _locationInfo[key] = locationData.id;
            _locationInfo[`${key}Name`] = locationData.name;
            
            if (locationData?.partOf?.reference) {
                currentId = locationData.partOf.reference.split("/")[1];
            } else {
                break; // No more parent locations
            }
        } catch (error) {
            console.error(`Error fetching location ${currentId}:`, error);
            break; // Stop processing if we can't fetch a location
        }
    }

    return _locationInfo;
};

export const buildUserResponse = (userInfo: any, currentUser: any, locationInfo: any) => {
    return {
        status: "success",
        user: {
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            fhirPractitionerId: userInfo.attributes?.fhirPractitionerId[0],
            practitionerRole: userInfo.attributes?.practitionerRole[0],
            id: userInfo.id,
            idNumber: userInfo.username,
            fullNames: currentUser.name,
            phone: (userInfo.attributes?.phone ? userInfo.attributes?.phone[0] : null),
            email: userInfo.email ?? null,
            ...locationInfo
        }
    };
};

export const buildLocationInfoForUser = async (user: any, practitioner: any, heirachy: any[]): Promise<any> => {
    if (user.attributes.practitionerRole[0] === "ADMINISTRATOR") {
        return { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };
    }

    let fhirLocationRef = practitioner.extension[0].valueReference.reference;
    let fhirLocation = await (await FhirApi({ url: `/${fhirLocationRef}` })).data;
    let locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;
    let root;
    for (let location of heirachy) {
        let l: any = location;
        if (locationType === l[Object.keys(location)[0]]) {
            root = locationType;
        }
    }

    let _locationInfo: any = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };
    let _locs = heirachy.map((x: any) => x[Object.keys(x)[0]]);
    let _locKeys = heirachy.map((x: any) => Object.keys(x)[0]);
    let indexOfRoot = _locs.indexOf(root);
    let previous = fhirLocation.id;
    for (let i of _locKeys.slice(0, indexOfRoot + 1).reverse()) {
        let _fhirlocation = await (await FhirApi({ url: `/Location/${previous}` })).data;
        _locationInfo[i] = _fhirlocation.id;
        _locationInfo[`${i}Name`] = _fhirlocation.name;
        if (_fhirlocation?.partOf) {
            previous = (_fhirlocation?.partOf?.reference).split("/")[1];
        }
    }
    return _locationInfo;
};

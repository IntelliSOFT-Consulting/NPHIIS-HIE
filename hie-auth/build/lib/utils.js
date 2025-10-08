"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUserResponse = exports.buildLocationInfo = exports.updatePractitionerLocation = exports.validateLocationForRole = exports.validateRole = exports.getPatientById = exports.parseIdentifiers = exports.FhirApi = exports.apiHost = void 0;
const fetch = (url, init) => Promise.resolve().then(() => __importStar(require('node-fetch'))).then(({ default: fetch }) => fetch(url, init));
exports.apiHost = process.env.FHIR_BASE_URL;
console.log("HAPI FHIR: ", exports.apiHost);
// a fetch wrapper for HAPI FHIR server.
const FhirApi = (params) => __awaiter(void 0, void 0, void 0, function* () {
    let _defaultHeaders = { "Content-Type": 'application/json' };
    if (!params.method) {
        params.method = 'GET';
    }
    try {
        let response = yield fetch(String(`${exports.apiHost}${params.url}`), Object.assign({ headers: _defaultHeaders, method: params.method ? String(params.method) : 'GET' }, (params.method !== 'GET' && params.method !== 'DELETE') && { body: String(params.data) }));
        let responseJSON = yield response.json();
        let res = {
            status: "success",
            statusText: response.statusText,
            data: responseJSON
        };
        return res;
    }
    catch (error) {
        console.error(error);
        let res = {
            statusText: "FHIRFetch: server error",
            status: "error",
            data: error
        };
        console.error(error);
        return res;
    }
});
exports.FhirApi = FhirApi;
const parseIdentifiers = (patientId) => __awaiter(void 0, void 0, void 0, function* () {
    let patient = (yield (0, exports.FhirApi)({ url: `/Patient?identifier=${patientId}`, })).data;
    if (!((patient === null || patient === void 0 ? void 0 : patient.total) > 0 || (patient === null || patient === void 0 ? void 0 : patient.entry.length) > 0)) {
        return null;
    }
    let identifiers = patient.entry[0].resource.identifier;
    return identifiers.map((id) => {
        return {
            [id.id]: id
        };
    });
});
exports.parseIdentifiers = parseIdentifiers;
const getPatientById = (crossBorderId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let patient = (yield (0, exports.FhirApi)({ url: `/Patient?identifier=${crossBorderId}` })).data;
        if ((patient === null || patient === void 0 ? void 0 : patient.total) > 0 || ((_a = patient === null || patient === void 0 ? void 0 : patient.entry) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            patient = patient.entry[0].resource;
            return patient;
        }
        return null;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.getPatientById = getPatientById;
// Validation helper functions
const validateRole = (role, allowedRoles) => {
    const normalizedRole = String(role).toUpperCase();
    return allowedRoles.indexOf(normalizedRole) >= 0;
};
exports.validateRole = validateRole;
const validateLocationForRole = (role, location) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d, _e;
    if (!location) {
        return { isValid: true };
    }
    const fhirLocation = yield (yield (0, exports.FhirApi)({ url: `/Location/${location}` })).data;
    const locationType = (_e = (_d = (_c = (_b = fhirLocation === null || fhirLocation === void 0 ? void 0 : fhirLocation.type) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.coding) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.code;
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
});
exports.validateLocationForRole = validateLocationForRole;
// FHIR practitioner helper functions
const updatePractitionerLocation = (userInfo, practitioner, fhirLocation) => __awaiter(void 0, void 0, void 0, function* () {
    var _f;
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
    yield (yield (0, exports.FhirApi)({
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
            "valueString": (_f = userInfo === null || userInfo === void 0 ? void 0 : userInfo.attributes) === null || _f === void 0 ? void 0 : _f.practitionerRole[0]
        }
    ];
    const updatedPractitioner = yield (yield (0, exports.FhirApi)({
        url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}`,
        method: "PUT",
        data: JSON.stringify(Object.assign(Object.assign({}, practitioner), { extension: newLocation, meta: {
                tag: [{
                        system: "http://example.org/fhir/StructureDefinition/location",
                        code: `Location/${fhirLocation.id}`
                    }]
            } }))
    })).data;
    return updatedPractitioner;
});
exports.updatePractitionerLocation = updatePractitionerLocation;
const buildLocationInfo = (fhirLocation, heirachy) => __awaiter(void 0, void 0, void 0, function* () {
    var _g, _h, _j, _k, _l, _m;
    const locationInfo = {
        facility: "", facilityName: "", ward: "", wardName: "",
        subCounty: "", subCountyName: "", county: "", countyName: "", country: "", countryName: ""
    };
    const assignedLocationType = (_k = (_j = (_h = (_g = fhirLocation === null || fhirLocation === void 0 ? void 0 : fhirLocation.type) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.coding) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.code;
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
        if ((_l = currentLocation === null || currentLocation === void 0 ? void 0 : currentLocation.partOf) === null || _l === void 0 ? void 0 : _l.reference) {
            const parentId = currentLocation.partOf.reference.split("/")[1];
            locationIds.push(parentId);
            // We need to fetch each location to get the next parent
            // This is still sequential due to the hierarchical nature, but optimized
        }
    }
    // Build location info by traversing up the hierarchy
    const _locationInfo = {
        facility: "", facilityName: "", ward: "", wardName: "",
        subCounty: "", subCountyName: "", county: "", countyName: "", country: "", countryName: ""
    };
    let currentId = fhirLocation.id;
    const processedKeys = [...relevantKeys];
    for (const key of processedKeys) {
        try {
            const locationData = yield (yield (0, exports.FhirApi)({ url: `/Location/${currentId}` })).data;
            _locationInfo[key] = locationData.id;
            _locationInfo[`${key}Name`] = locationData.name;
            if ((_m = locationData === null || locationData === void 0 ? void 0 : locationData.partOf) === null || _m === void 0 ? void 0 : _m.reference) {
                currentId = locationData.partOf.reference.split("/")[1];
            }
            else {
                break; // No more parent locations
            }
        }
        catch (error) {
            console.error(`Error fetching location ${currentId}:`, error);
            break; // Stop processing if we can't fetch a location
        }
    }
    return _locationInfo;
});
exports.buildLocationInfo = buildLocationInfo;
const buildUserResponse = (userInfo, currentUser, locationInfo) => {
    var _a, _b, _c, _d, _e;
    return {
        status: "success",
        user: Object.assign({ firstName: userInfo.firstName, lastName: userInfo.lastName, fhirPractitionerId: (_a = userInfo.attributes) === null || _a === void 0 ? void 0 : _a.fhirPractitionerId[0], practitionerRole: (_b = userInfo.attributes) === null || _b === void 0 ? void 0 : _b.practitionerRole[0], id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name, phone: (((_c = userInfo.attributes) === null || _c === void 0 ? void 0 : _c.phone) ? (_d = userInfo.attributes) === null || _d === void 0 ? void 0 : _d.phone[0] : null), email: (_e = userInfo.email) !== null && _e !== void 0 ? _e : null }, locationInfo)
    };
};
exports.buildUserResponse = buildUserResponse;

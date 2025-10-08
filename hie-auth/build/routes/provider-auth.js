"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const utils_1 = require("../lib/utils");
const keycloak_1 = require("./../lib/keycloak");
const middleware_1 = require("../lib/middleware");
const email_1 = require("../lib/email");
const superset_1 = require("../lib/superset");
const router = express_1.default.Router();
router.use(express_1.default.json());
const USER_ROLES = ((_a = process.env.USER_ROLES) === null || _a === void 0 ? void 0 : _a.split(",")) || [];
const allowedRoles = USER_ROLES;
const heirachy = [
    { country: "COUNTRY" },
    { county: "COUNTY" },
    { subCounty: "SUB-COUNTY" },
    { ward: "WARD" },
    { facility: "FACILITY" }
];
const roleToHeirachy = {
    "ADMINISTRATOR": "COUNTRY",
    "SUPERUSER": "COUNTRY",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER": "COUNTY",
    // "SUB_COUNTY_SYSTEM_ADMINISTRATOR": "SUB-COUNTY", 
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER": "SUB-COUNTY",
    // "FACILITY_SYSTEM_ADMINISTRATOR": "FACILITY",
    "FACILITY_SURVEILLANCE_FOCAL_PERSON": "FACILITY",
    "SUPERVISORS": "FACILITY",
    "VACCINATORS": "FACILITY"
};
// Optimized password generation with cached character set
const PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
const generatePassword = (length) => {
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
        result[i] = PASSWORD_CHARS.charAt(Math.floor(Math.random() * PASSWORD_CHARS.length));
    }
    return result.join('');
};
router.post("/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Extract and validate input
        let { firstName, lastName, idNumber, password, role, email, phone, facility } = req.body;
        // Early validation - fail fast
        if (!idNumber || !firstName || !lastName || !role || !email) {
            return res.status(400).json({ status: "error", error: "password, idNumber, firstName, lastName, email and role are required" });
        }
        role = String(role).toUpperCase();
        if (allowedRoles.indexOf(role) < 0) {
            return res.status(400).json({ status: "error", error: `invalid role provided. Allowed roles: ${allowedRoles.join(",")}` });
        }
        if (role !== "ADMINISTRATOR" && !facility) {
            return res.status(400).json({ status: "error", error: "Failed to register user. Invalid location provided for user role" });
        }
        // Generate password if not provided
        if (!password) {
            password = generatePassword(12);
        }
        // Parallel operations for better performance
        const [keycloakUser, location] = yield Promise.all([
            (0, keycloak_1.registerKeycloakUser)(idNumber, email, phone, firstName, lastName, password, null),
            // Only fetch location if needed (not for ADMINISTRATOR role)
            role !== "ADMINISTRATOR" ?
                (yield (0, utils_1.FhirApi)({ url: `/Location/${facility}` })).data :
                Promise.resolve({ id: '0', name: process.env.ROOT_LOCATION_NAME || 'Kenya' })
        ]);
        // Validate keycloak user creation
        if (!keycloakUser) {
            return res.status(400).json({ status: "error", error: "Failed to register client user" });
        }
        console.log(keycloakUser);
        if (Object.keys(keycloakUser).indexOf('error') > -1) {
            return res.status(400).json(Object.assign(Object.assign({}, keycloakUser), { status: "error" }));
        }
        const practitionerId = keycloakUser.id;
        // Build practitioner resource
        const practitionerResource = {
            "resourceType": "Practitioner",
            "id": practitionerId,
            "meta": {
                "tag": [{
                        "system": "http://example.org/fhir/StructureDefinition/location",
                        "code": `Location/${location.id}`
                    }]
            },
            "active": true,
            "identifier": [
                {
                    "system": "http://hl7.org/fhir/administrative-identifier",
                    "value": idNumber
                }
            ],
            "name": [{ "use": "official", "family": lastName, "given": [firstName] }],
            "extension": [
                {
                    "url": "http://example.org/location",
                    "valueReference": {
                        "reference": `Location/${location.id}`,
                        "display": location.name
                    }
                },
                {
                    "url": "http://example.org/fhir/StructureDefinition/role-group",
                    "valueString": role
                }
            ]
        };
        // Create practitioner in FHIR
        const practitioner = (yield (0, utils_1.FhirApi)({
            url: `/Practitioner/${practitionerId}`,
            method: "PUT",
            data: JSON.stringify(practitionerResource)
        })).data;
        // Validate practitioner creation
        if ((practitioner === null || practitioner === void 0 ? void 0 : practitioner.resourceType) === "OperationOutcome") {
            return res.status(400).json({ status: "error", error: practitioner.issue[0].diagnostics });
        }
        // Send confirmation email asynchronously (don't wait for it)
        setImmediate(() => {
            (0, email_1.sendRegistrationConfirmationEmail)(email, password, idNumber).catch(err => {
                console.error('Failed to send registration confirmation email:', err);
            });
        });
        return res.status(201).json({ response: keycloakUser.success, status: "success" });
    }
    catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ error: "Internal server error during registration", status: "error" });
    }
}));
router.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { idNumber, password } = req.body;
        let token = yield (0, keycloak_1.getKeycloakUserToken)(idNumber, password);
        if (!token) {
            return res.status(401).json({ status: "error", error: "Incorrect ID Number or Password provided" });
        }
        if (Object.keys(token).indexOf('error') > -1) {
            return res.status(401).json({ status: "error", error: `${token.error} - ${token.error_description}` });
        }
        let userInfo = yield (0, keycloak_1.findKeycloakUser)(idNumber);
        if (!userInfo) {
            return res.status(401).json({ status: "error", error: "User not found" });
        }
        let practitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${userInfo === null || userInfo === void 0 ? void 0 : userInfo.id}` })).data;
        if (!practitioner || !practitioner.active) {
            return res.status(401).json({ status: "error", error: "User not found or not active" });
        }
        return res.status(200).json(Object.assign(Object.assign({}, token), { status: "success" }));
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({ error: "incorrect email or password", status: "error" });
    }
}));
router.post("/refresh_token", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { refresh_token } = req.body;
        let token = yield (0, keycloak_1.refreshToken)(refresh_token);
        if (!token) {
            return res.status(401).json({ status: "error", error: "Invalid refresh token provided" });
        }
        return res.status(200).json(Object.assign(Object.assign({}, token), { status: "success" }));
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({ error: "Invalid refresh token provided", status: "error" });
    }
}));
router.get("/me", middleware_1.authenticateUser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const currentUser = req.user;
        const userInfo = yield (0, keycloak_1.findKeycloakUser)(currentUser.preferred_username);
        if (!(userInfo === null || userInfo === void 0 ? void 0 : userInfo.id)) {
            return res.status(404).json({ error: "User not found", status: "error" });
        }
        const userId = userInfo.id;
        // Fetch practitioner data
        const practitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${userId}` })).data;
        if (!practitioner) {
            return res.status(404).json({ error: "Practitioner not found", status: "error" });
        }
        // Early return for ADMINISTRATOR role - no location processing needed
        const practitionerRole = ((_b = practitioner === null || practitioner === void 0 ? void 0 : practitioner.extension) === null || _b === void 0 ? void 0 : _b.length) > 0 ?
            (_c = practitioner.extension[1]) === null || _c === void 0 ? void 0 : _c.valueString : "ADMINISTRATOR";
        // For non-ADMINISTRATOR roles, build location info efficiently
        let locationInfo = {
            facility: "", facilityName: "", ward: "", wardName: "",
            subCounty: "", subCountyName: "", county: "", countyName: "", country: "", countryName: ""
        };
        if (((_d = practitioner === null || practitioner === void 0 ? void 0 : practitioner.extension) === null || _d === void 0 ? void 0 : _d.length) > 0) {
            const locationReference = practitioner.extension[0].valueReference.reference;
            // Fetch initial location
            const fhirLocation = yield (yield (0, utils_1.FhirApi)({ url: `/${locationReference}` })).data;
            const locationType = (_h = (_g = (_f = (_e = fhirLocation === null || fhirLocation === void 0 ? void 0 : fhirLocation.type) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.coding) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.code;
            if (locationType && fhirLocation) {
                // Use the optimized buildLocationInfo utility function
                locationInfo = yield (0, utils_1.buildLocationInfo)(fhirLocation, heirachy);
            }
        }
        return res.status(200).json({
            status: "success",
            user: {
                firstName: userInfo.firstName,
                lastName: userInfo.lastName,
                fhirPractitionerId: userId,
                practitionerRole,
                role: practitionerRole,
                status: practitioner.active,
                id: userInfo.id,
                idNumber: userInfo.username,
                fullNames: currentUser.name,
                phone: ((_k = (_j = userInfo.attributes) === null || _j === void 0 ? void 0 : _j.phone) === null || _k === void 0 ? void 0 : _k[0]) || null,
                email: userInfo.email || null,
                locationInfo
            }
        });
    }
    catch (error) {
        console.error('GET /me error:', error);
        return res.status(500).json({ error: "Internal server error", status: "error" });
    }
}));
router.get("/user/:username", middleware_1.authenticateUser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _l, _m, _o, _p, _q, _r;
    try {
        const username = req.params.username;
        const currentUser = req.user;
        let userInfo = yield (0, keycloak_1.findKeycloakUser)(currentUser.preferred_username);
        let currentUserPractitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${userInfo.id}` })).data;
        let currentUserPractitionerRole = ((_l = currentUserPractitioner === null || currentUserPractitioner === void 0 ? void 0 : currentUserPractitioner.extension) === null || _l === void 0 ? void 0 : _l.length) > 0 ?
            (_m = currentUserPractitioner.extension[1]) === null || _m === void 0 ? void 0 : _m.valueString : "ADMINISTRATOR";
        if (currentUserPractitionerRole !== "ADMINISTRATOR") {
            return res.status(401).json({ error: "Unauthorized access", status: "error" });
        }
        let user = yield (0, keycloak_1.findKeycloakUser)(username);
        if (!user) {
            return res.status(404).json({ status: "error", error: "User not found" });
        }
        let practitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${user.id}` })).data;
        let practitionerRole = ((_o = practitioner === null || practitioner === void 0 ? void 0 : practitioner.extension) === null || _o === void 0 ? void 0 : _o.length) > 0 ?
            (_p = practitioner.extension[1]) === null || _p === void 0 ? void 0 : _p.valueString : "ADMINISTRATOR";
        let locationInfo = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "", country: "", countryName: "" };
        let fhirLocationRef = practitioner.extension[0].valueReference.reference;
        let fhirLocation = yield (yield (0, utils_1.FhirApi)({ url: `/${fhirLocationRef}` })).data;
        locationInfo = yield (0, utils_1.buildLocationInfo)(fhirLocation, heirachy);
        return res.status(200).json({
            status: "success", user: {
                firstName: user.firstName,
                lastName: user.lastName,
                fhirPractitionerId: user.id,
                practitionerRole,
                id: user.id,
                idNumber: user.username,
                status: practitioner.active,
                fullNames: user.name,
                phone: ((_r = (_q = user.attributes) === null || _q === void 0 ? void 0 : _q.phone) === null || _r === void 0 ? void 0 : _r[0]) || null,
                email: user.email || null,
                locationInfo
            }
        });
        return;
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({ error, status: "error" });
        return;
    }
}));
router.post('/reset-password', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { idNumber, password, resetCode } = req.body;
        let resetResp = yield (0, keycloak_1.validateResetCode)(idNumber, resetCode);
        if (!resetResp) {
            return res.status(401).json({ error: "Failed to update new password. Try again", status: "error" });
            return;
        }
        let resp = (0, keycloak_1.updateUserPassword)(idNumber, password);
        (0, keycloak_1.deleteResetCode)(idNumber);
        if (!resp) {
            return res.status(401).json({ error: "Failed to update new password. Try again", status: "error" });
            return;
        }
        return res.status(200).json({ response: "Password updated successfully", status: "success" });
        return;
    }
    catch (error) {
        console.error(error);
        return res.status(401).json({ error: "Invalid Bearer token provided", status: "error" });
        return;
    }
}));
router.get('/reset-password', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { idNumber, email } = req.query;
        // console.log(encodeURIComponent(String(email)))
        let userInfo = yield (0, keycloak_1.findKeycloakUser)(String(idNumber));
        console.log(userInfo);
        if (userInfo.email.toLowerCase() !== String(email).toLowerCase()) {
            return res.status(400).json({ status: "error", error: "Failed to initiate password reset. Invalid account details." });
            return;
        }
        idNumber = String(idNumber);
        let resp = yield (0, email_1.sendPasswordResetEmail)(idNumber);
        if (!resp) {
            return res.status(400).json({ status: "error", error: "Failed to initiate password reset. Try again." });
            return;
        }
        return res.status(200).json({ status: "success", response: "Check your email for the password reset code sent." });
        return;
    }
    catch (error) {
        console.error(error);
        return res.status(401).json({ error: "Failed to initiate password reset", status: "error" });
        return;
    }
}));
router.get("/users", middleware_1.authenticateUser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _s, _t;
    try {
        const currentUser = req.user;
        // Optimized authorization check - early return for better performance
        const userInfo = yield (0, keycloak_1.findKeycloakUser)(currentUser.preferred_username);
        if (!(userInfo === null || userInfo === void 0 ? void 0 : userInfo.id)) {
            return res.status(403).json({ error: "User not found", status: "error" });
        }
        const practitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${userInfo.id}` })).data;
        if (!practitioner) {
            return res.status(404).json({ error: "Practitioner not found", status: "error" });
        }
        const practitionerRole = ((_s = practitioner === null || practitioner === void 0 ? void 0 : practitioner.extension) === null || _s === void 0 ? void 0 : _s.length) > 0 ?
            (_t = practitioner.extension[1]) === null || _t === void 0 ? void 0 : _t.valueString : "ADMINISTRATOR";
        if (practitionerRole !== "ADMINISTRATOR" && practitionerRole !== "SUPERUSER") {
            return res.status(403).json({ error: "Insufficient permissions. Administrator access required.", status: "error" });
        }
        // Fetch users with error handling
        const users = yield (0, keycloak_1.getKeycloakUsers)();
        if (!users) {
            return res.status(500).json({ error: "Failed to retrieve users from Keycloak", status: "error" });
        }
        return res.status(200).json({
            users,
            total: users.length,
            status: "success"
        });
    }
    catch (error) {
        console.error('GET /users error:', error);
        return res.status(500).json({
            error: "Internal server error while fetching users",
            status: "error"
        });
    }
}));
router.put("/users/:username", middleware_1.authenticateUser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
    try {
        const currentUser = req.user;
        const { username } = req.params;
        let { phone, email, facilityCode, county, subCounty, role } = req.body;
        // Get current user info to check permissions
        let currentUserInfo = yield (0, keycloak_1.findKeycloakUser)(currentUser.preferred_username);
        const isAdmin = (_w = (_v = (_u = currentUserInfo.attributes) === null || _u === void 0 ? void 0 : _u.practitionerRole) === null || _v === void 0 ? void 0 : _v[0]) === null || _w === void 0 ? void 0 : _w.includes("ADMINISTRATOR");
        // Authorization check: Only administrators can edit users (self-editing is disabled)
        if (!isAdmin) {
            return res.status(403).json({ error: "Unauthorized access. Only administrators can edit users.", status: "error" });
        }
        // Get target user info
        let targetUserInfo = yield (0, keycloak_1.findKeycloakUser)(username);
        if (!targetUserInfo) {
            return res.status(404).json({ error: "User not found", status: "error" });
        }
        // Determine location and role
        let location = facilityCode || subCounty || county;
        let normalizedRole = role ? String(role).toUpperCase() : null;
        // Validate role if provided
        if (normalizedRole && !(0, utils_1.validateRole)(normalizedRole, allowedRoles)) {
            return res.status(400).json({ status: "error", error: `Invalid role ${normalizedRole} provided. Supported roles: ${allowedRoles.join(",")}` });
        }
        // Validate location for role if both are provided
        if (location && normalizedRole) {
            const locationValidation = yield (0, utils_1.validateLocationForRole)(normalizedRole, location);
            if (!locationValidation.isValid) {
                return res.status(400).json({ status: "error", error: locationValidation.error });
            }
        }
        // Update user profile
        yield (0, keycloak_1.updateUserProfile)(username, phone, email, null, normalizedRole);
        // Get updated user info
        let updatedUserInfo = yield (0, keycloak_1.findKeycloakUser)(username);
        let locationInfo;
        // Handle practitioner location updates if applicable
        if (((_y = (_x = updatedUserInfo === null || updatedUserInfo === void 0 ? void 0 : updatedUserInfo.attributes) === null || _x === void 0 ? void 0 : _x.fhirPractitionerId) === null || _y === void 0 ? void 0 : _y[0]) && location) {
            let practitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${updatedUserInfo.attributes.fhirPractitionerId[0]}` })).data;
            // Get FHIR location
            let fhirLocation = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${location}` })).data;
            // Update practitioner location
            practitioner = yield (0, utils_1.updatePractitionerLocation)(updatedUserInfo, practitioner, fhirLocation);
            locationInfo = yield (0, utils_1.buildLocationInfo)(fhirLocation, heirachy);
        }
        // Build response based on whether it's provider or client user
        if ((_0 = (_z = updatedUserInfo === null || updatedUserInfo === void 0 ? void 0 : updatedUserInfo.attributes) === null || _z === void 0 ? void 0 : _z.fhirPractitionerId) === null || _0 === void 0 ? void 0 : _0[0]) {
            // Provider user response
            const response = (0, utils_1.buildUserResponse)(updatedUserInfo, currentUser, locationInfo);
            return res.status(200).json(response);
        }
        else {
            // Client user response (simplified)
            return res.status(200).json({
                status: "success",
                user: {
                    firstName: updatedUserInfo.firstName,
                    lastName: updatedUserInfo.lastName,
                    fhirPatientId: (_2 = (_1 = updatedUserInfo.attributes) === null || _1 === void 0 ? void 0 : _1.fhirPatientId) === null || _2 === void 0 ? void 0 : _2[0],
                    id: updatedUserInfo.id,
                    idNumber: updatedUserInfo.username,
                    fullNames: currentUser.name,
                    phone: ((_4 = (_3 = updatedUserInfo.attributes) === null || _3 === void 0 ? void 0 : _3.phone) === null || _4 === void 0 ? void 0 : _4[0]) || null,
                    email: updatedUserInfo.email || null
                }
            });
        }
    }
    catch (error) {
        console.error('PUT /users/:username error:', error);
        return res.status(500).json({ error: "Internal server error", status: "error" });
    }
}));
router.get("/superset-token", middleware_1.authenticateUser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUser = req.user;
        let token = yield (0, superset_1.getSupersetGuestToken)();
        res.statusCode = 200;
        res.json({ token, status: "success" });
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Failed to get superset guest token", status: "error" });
        return;
    }
}));
exports.default = router;

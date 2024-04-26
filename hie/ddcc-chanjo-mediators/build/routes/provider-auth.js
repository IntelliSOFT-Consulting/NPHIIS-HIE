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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const utils_1 = require("../lib/utils");
const keycloak_1 = require("./../lib/keycloak");
const uuid_1 = require("uuid");
const router = express_1.default.Router();
router.use(express_1.default.json());
router.post("/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get id number and unique code
        let { firstName, lastName, idNumber, password, role, email, phone, facility } = req.body;
        console.log(req.body);
        if (!password || !idNumber || !firstName || !lastName || !role || !email) {
            res.statusCode = 400;
            res.json({ status: "error", error: "password, idNumber, firstName, lastName, email and role are required" });
            return;
        }
        let practitionerId = uuid_1.v4();
        let location = yield (yield utils_1.FhirApi({ url: `/Location/${facility}` })).data;
        console.log(location);
        if (location.resourceType != "Location") {
            res.statusCode = 400;
            res.json({ status: "error", error: "Failed to register client user. Invalid location provided" });
            return;
        }
        console.log(practitionerId);
        let practitionerResource = {
            "resourceType": "Practitioner",
            "id": practitionerId,
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
                        "display": location.display
                    }
                }
            ]
            // "telecom": [{"system": "phone","value": "123-456-7890"}]
        };
        let keycloakUser = yield keycloak_1.registerKeycloakUser(idNumber, email, phone, firstName, lastName, password, null, practitionerId, role);
        if (!keycloakUser) {
            res.statusCode = 400;
            res.json({ status: "error", error: "Failed to register client user" });
            return;
        }
        if (Object.keys(keycloakUser).indexOf('error') > -1) {
            res.statusCode = 400;
            res.json(Object.assign(Object.assign({}, keycloakUser), { status: "error" }));
            return;
        }
        let practitioner = (yield utils_1.FhirApi({ url: `/Practitioner/${practitionerId}`, method: "PUT", data: JSON.stringify(practitionerResource) })).data;
        console.log(practitioner);
        res.statusCode = 201;
        res.json({ response: keycloakUser.success, status: "success" });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status: "error" });
        return;
    }
}));
router.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { idNumber, password } = req.body;
        let token = yield keycloak_1.getKeycloakUserToken(idNumber, password);
        if (!token) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Incorrect ID Number or Password provided" });
            return;
        }
        if (Object.keys(token).indexOf('error') > -1) {
            res.statusCode = 401;
            res.json({ status: "error", error: `${token.error} - ${token.error_description}` });
            return;
        }
        res.statusCode = 200;
        res.json(Object.assign(Object.assign({}, token), { status: "success" }));
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status: "error" });
        return;
    }
}));
router.get("/me", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const accessToken = ((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(' ')[1]) || null;
        if (!accessToken || ((_b = req.headers.authorization) === null || _b === void 0 ? void 0 : _b.split(' ')[0]) != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        let currentUser = yield keycloak_1.getCurrentUserInfo(accessToken);
        console.log(currentUser);
        let userInfo = yield keycloak_1.findKeycloakUser(currentUser.preferred_username);
        console.log(userInfo);
        if (!currentUser) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided" });
            return;
        }
        let practitioner = yield (yield utils_1.FhirApi({ url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}` })).data;
        let facilityId = practitioner.extension[0].valueReference.reference;
        res.statusCode = 200;
        res.json({ status: "success", user: { firstName: userInfo.firstName, lastName: userInfo.lastName,
                fhirPractitionerId: userInfo.attributes.fhirPractitionerId[0],
                practitionerRole: userInfo.attributes.practitionerRole[0],
                id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name, phone: (((_c = userInfo.attributes) === null || _c === void 0 ? void 0 : _c.phone) ? (_d = userInfo.attributes) === null || _d === void 0 ? void 0 : _d.phone[0] : null), email: (_e = userInfo.email) !== null && _e !== void 0 ? _e : null, facility: facilityId } });
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status: "error" });
        return;
    }
}));
router.post("/me", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _f, _g, _h, _j, _k;
    try {
        const accessToken = ((_f = req.headers.authorization) === null || _f === void 0 ? void 0 : _f.split(' ')[1]) || null;
        if (!accessToken || ((_g = req.headers.authorization) === null || _g === void 0 ? void 0 : _g.split(' ')[0]) != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        // allow phone number & email
        let { phone, email } = req.body;
        let currentUser = yield keycloak_1.getCurrentUserInfo(accessToken);
        console.log(currentUser);
        yield keycloak_1.updateUserProfile(currentUser.preferred_username, phone, email);
        let userInfo = yield keycloak_1.findKeycloakUser(currentUser.preferred_username);
        let practitioner = yield (yield utils_1.FhirApi({ url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}` })).data;
        let facilityId = practitioner.extension[0].valueReference.reference;
        if (!currentUser) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided" });
            return;
        }
        res.statusCode = 200;
        res.json({ status: "success", user: { firstName: userInfo.firstName, lastName: userInfo.lastName,
                fhirPractitionerId: userInfo.attributes.fhirPractitionerId[0],
                practitionerRole: userInfo.attributes.practitionerRole[0],
                id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name, phone: (((_h = userInfo.attributes) === null || _h === void 0 ? void 0 : _h.phone) ? (_j = userInfo.attributes) === null || _j === void 0 ? void 0 : _j.phone[0] : null), email: (_k = userInfo.email) !== null && _k !== void 0 ? _k : null, facility: facilityId } });
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status: "error" });
        return;
    }
}));
exports.default = router;

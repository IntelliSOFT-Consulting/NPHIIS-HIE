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
        let { firstName, lastName, idNumber, password, role } = req.body;
        console.log(req.body);
        if (!password || !idNumber || !firstName || !lastName || !role) {
            res.statusCode = 400;
            res.json({ status: "error", error: "password, idNumber, firstName, lastName and role are required" });
            return;
        }
        let practitionerId = uuid_1.v4();
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
        };
        let keycloakUser = yield keycloak_1.registerKeycloakUser(idNumber, firstName, lastName, password, null, practitionerId, role);
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
    var _a, _b;
    try {
        const accessToken = ((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(' ')[1]) || null;
        if (!accessToken || ((_b = req.headers.authorization) === null || _b === void 0 ? void 0 : _b.split(' ')[0]) != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        res.statusCode = 200;
        res.json({ status: "success", });
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

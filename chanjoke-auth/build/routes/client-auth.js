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
const router = express_1.default.Router();
router.use(express_1.default.json());
router.post("/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // get id number and the unique secret code
        let { secretCode, idNumber, password, email, phone } = req.body;
        if (!password || !idNumber || !secretCode) {
            res.statusCode = 400;
            res.json({ status: "error", error: "secretCode, idNumber and password are required" });
            return;
        }
        let response = yield utils_1.FhirApi({ url: `/Patient?identifier=${secretCode},${idNumber}` });
        if (((_a = response.data) === null || _a === void 0 ? void 0 : _a.entry) || ((_b = response.data) === null || _b === void 0 ? void 0 : _b.count)) { // Patient is found
            let patient = response.data.entry[0].resource;
            console.log(patient);
            // register patient/client user on Keycloak
            let keycloakUser = yield keycloak_1.registerKeycloakUser(idNumber, email, phone, patient.name[0].family, patient.name[0].given[0], password, patient.id, null, null);
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
            res.statusCode = 201;
            res.json({ response: keycloakUser.success, status: "success" });
            return;
        }
        else {
            let error = "Could not register user. Invalid Secret Code or ID number provided.";
            console.log(error);
            res.statusCode = 401;
            res.json({ error: error, status: "error" });
            return;
        }
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
    var _c, _d, _e, _f, _g;
    try {
        const accessToken = ((_c = req.headers.authorization) === null || _c === void 0 ? void 0 : _c.split(' ')[1]) || null;
        if (!accessToken || ((_d = req.headers.authorization) === null || _d === void 0 ? void 0 : _d.split(' ')[0]) != "Bearer") {
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
        res.statusCode = 200;
        res.json({ status: "success", user: { firstName: userInfo.firstName, lastName: userInfo.lastName,
                fhirPatientId: userInfo.attributes.fhirPatientId[0],
                id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name, phone: (((_e = userInfo.attributes) === null || _e === void 0 ? void 0 : _e.phone) ? (_f = userInfo.attributes) === null || _f === void 0 ? void 0 : _f.phone[0] : null), email: (_g = userInfo.email) !== null && _g !== void 0 ? _g : null
            } });
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
    var _h, _j;
    try {
        const accessToken = ((_h = req.headers.authorization) === null || _h === void 0 ? void 0 : _h.split(' ')[1]) || null;
        if (!accessToken || ((_j = req.headers.authorization) === null || _j === void 0 ? void 0 : _j.split(' ')[0]) != "Bearer") {
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
        res.statusCode = 200;
        res.json({ status: "success", user: { firstName: userInfo.firstName, lastName: userInfo.lastName,
                fhirPatientId: userInfo.attributes.fhirPatientId[0],
                id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name
            } });
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

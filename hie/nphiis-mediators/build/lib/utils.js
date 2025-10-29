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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.sendMediatorRequest = exports.OperationOutcome = exports.getPatientById = exports.parseIdentifiers = exports.FhirApi = exports.installChannels = exports.importMediators = exports.createClient = exports.getOpenHIMToken = exports.apiHost = void 0;
const idAssignmentPassThrough_json_1 = __importDefault(require("../config/idAssignmentPassThrough.json"));
const afpFollowUp_json_1 = __importDefault(require("../config/afpFollowUp.json"));
const notificationService_json_1 = __importDefault(require("../config/notificationService.json"));
const openhim_mediator_utils_1 = __importDefault(require("openhim-mediator-utils"));
const https_1 = require("https");
const crypto = __importStar(require("crypto"));
const fhir_1 = require("./fhir");
// mediators to be registered
const mediators = [
    idAssignmentPassThrough_json_1.default,
    afpFollowUp_json_1.default,
    notificationService_json_1.default,
];
const fetch = (url, init) => Promise.resolve().then(() => __importStar(require('node-fetch'))).then(({ default: fetch }) => fetch(url, init));
exports.apiHost = process.env.FHIR_BASE_URL;
console.log("HAPI FHIR: ", exports.apiHost);
const openhimApiUrl = process.env.OPENHIM_API_URL;
const openhimUsername = process.env.OPENHIM_USERNAME;
const openhimPassword = process.env.OPENHIM_PASSWORD;
const openhimConfig = {
    username: openhimUsername,
    password: openhimPassword,
    apiURL: openhimApiUrl,
    trustSelfSigned: true
};
const genClientPassword = (password) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve) => {
        const passwordSalt = crypto.randomBytes(16);
        // create passhash
        let shasum = crypto.createHash('sha512');
        shasum.update(password);
        shasum.update(passwordSalt.toString('hex'));
        const passwordHash = shasum.digest('hex');
        resolve({
            "passwordSalt": passwordSalt.toString('hex'),
            "passwordHash": passwordHash
        });
    });
});
const getOpenHIMToken = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let token = yield openhim_mediator_utils_1.default.genAuthHeaders(openhimConfig);
        return token;
    }
    catch (error) {
        console.log(error);
        return { error, status: "error" };
    }
});
exports.getOpenHIMToken = getOpenHIMToken;
const createClient = (name, password) => __awaiter(void 0, void 0, void 0, function* () {
    let headers = yield (0, exports.getOpenHIMToken)();
    const clientPassword = password;
    const clientPasswordDetails = yield genClientPassword(clientPassword);
    let response = yield (yield fetch(`${openhimApiUrl}/clients`, {
        headers: Object.assign(Object.assign({}, headers), { "Content-Type": "application/json" }), method: 'POST',
        body: JSON.stringify({
            passwordAlgorithm: "sha512",
            passwordHash: clientPasswordDetails.passwordHash,
            passwordSalt: clientPasswordDetails.passwordSalt,
            clientID: name, name: name, "roles": [
                "*"
            ],
        }), agent: new https_1.Agent({
            rejectUnauthorized: false
        })
    })).text();
    console.log("create client: ", response);
    return response;
});
exports.createClient = createClient;
openhim_mediator_utils_1.default.authenticate(openhimConfig, (e) => {
    console.log(e ? e : "✅ OpenHIM authenticated successfully");
    (0, exports.importMediators)();
    (0, exports.installChannels)();
    (0, fhir_1.createFHIRSubscription)();
});
// createClient(process.env['OPENHIM_CLIENT_ID'] || '', process.env['OPENHIM_CLIENT_PASSWORD'] || '');
const importMediators = () => {
    try {
        mediators.map((mediator) => {
            openhim_mediator_utils_1.default.registerMediator(openhimConfig, mediator, (e) => {
                console.log(e ? e : "");
            });
        });
    }
    catch (error) {
        console.log(error);
    }
    return;
};
exports.importMediators = importMediators;
const installChannels = () => __awaiter(void 0, void 0, void 0, function* () {
    let headers = yield (0, exports.getOpenHIMToken)();
    mediators.map((mediator) => __awaiter(void 0, void 0, void 0, function* () {
        let response = yield (yield fetch(`${openhimApiUrl}/channels`, {
            headers: Object.assign(Object.assign({}, headers), { "Content-Type": "application/json" }), method: 'POST', body: JSON.stringify(mediator.defaultChannelConfig[0]), agent: new https_1.Agent({
                rejectUnauthorized: false
            })
        })).text();
        console.log(response);
    }));
});
exports.installChannels = installChannels;
// a fetch wrapper for HAPI FHIR server.
const FhirApi = (params) => __awaiter(void 0, void 0, void 0, function* () {
    // disable cache
    params.disableCache = true;
    let _defaultHeaders = { "Content-Type": 'application/json', "Cache-Control": "no-cache" };
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
// export const getPractitionerLocation = async ( practitioner: String)
/**
 * Create a FHIR OperationOutcome response
 * @param message - Error or status message
 * @param severity - Severity level (error, warning, information)
 * @param code - Issue type code
 * @returns FHIR OperationOutcome object
 */
const OperationOutcome = (message, severity = 'error', code = 'exception') => {
    return {
        "resourceType": "OperationOutcome",
        "id": "exception",
        "issue": [{
                "severity": severity,
                "code": code,
                "details": {
                    "text": message
                }
            }]
    };
};
exports.OperationOutcome = OperationOutcome;
const sendMediatorRequest = (url, data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    console.log("🔵 sendMediatorRequest CALLED with url:", url);
    try {
        let OPENHIM_CLIENT_ID = (_a = process.env['OPENHIM_CLIENT_ID']) !== null && _a !== void 0 ? _a : "";
        let OPENHIM_CLIENT_PASSWORD = (_b = process.env['OPENHIM_CLIENT_PASSWORD']) !== null && _b !== void 0 ? _b : "";
        console.log("🔵 Client ID:", OPENHIM_CLIENT_ID ? "✓ Set" : "✗ Missing");
        const _url = `${(_c = process.env['MEDIATORS_BASE_URL']) !== null && _c !== void 0 ? _c : "http://openhim-core:5001"}${url}`;
        console.log("🔵 Sending mediator request to:", _url);
        console.log("🔵 Request data:", JSON.stringify(data).substring(0, 200));
        const fetchResponse = yield fetch(_url, {
            body: JSON.stringify(data),
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": 'Basic ' + Buffer.from(OPENHIM_CLIENT_ID + ':' + OPENHIM_CLIENT_PASSWORD).toString('base64')
            }
        });
        console.log("🔵 Fetch response status:", fetchResponse.status);
        let response = yield fetchResponse.json();
        console.log("🔵 Mediator Response:", response);
        return response;
    }
    catch (error) {
        console.error("🔴 sendMediatorRequest ERROR:", error);
        return { error, status: "error" };
    }
});
exports.sendMediatorRequest = sendMediatorRequest;

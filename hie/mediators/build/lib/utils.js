"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPatientByHieId = exports.generateCrossBorderId = exports.getPatientSummary = exports.createClient = exports.parseIdentifiers = exports.FhirApi = exports.apiHost = exports.installChannels = exports.getOpenHIMToken = exports.importMediators = void 0;
const openhim_mediator_utils_1 = __importDefault(require("openhim-mediator-utils"));
const shrPassThrough_json_1 = __importDefault(require("../config/shrPassThrough.json"));
const https_1 = require("https");
const crypto = __importStar(require("crypto"));
// mediators to be registered
const mediators = [
    shrPassThrough_json_1.default
];
const fetch = (url, init) => Promise.resolve().then(() => __importStar(require('node-fetch'))).then(({ default: fetch }) => fetch(url, init));
const openhimApiUrl = process.env.OPENHIM_API_URL;
const openhimUsername = process.env.OPENHIM_USERNAME;
const openhimPassword = process.env.OPENHIM_PASSWORD;
const openhimConfig = {
    username: openhimUsername,
    password: openhimPassword,
    apiURL: openhimApiUrl,
    trustSelfSigned: true
};
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
const getOpenHIMToken = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // console.log("Auth", auth)
        let token = yield openhim_mediator_utils_1.default.genAuthHeaders(openhimConfig);
        return token;
    }
    catch (error) {
        console.log(error);
        return { error, status: "error" };
    }
});
exports.getOpenHIMToken = getOpenHIMToken;
const installChannels = () => __awaiter(void 0, void 0, void 0, function* () {
    let headers = yield exports.getOpenHIMToken();
    mediators.map((mediator) => __awaiter(void 0, void 0, void 0, function* () {
        let response = yield (yield fetch(`${openhimApiUrl}/channels`, {
            headers: Object.assign(Object.assign({}, headers), { "Content-Type": "application/json" }),
            method: 'POST', body: JSON.stringify(mediator.defaultChannelConfig[0]), agent: new https_1.Agent({
                rejectUnauthorized: false
            })
        })).text();
        console.log(response);
    }));
});
exports.installChannels = installChannels;
openhim_mediator_utils_1.default.authenticate(openhimConfig, (e) => {
    console.log(e ? e : "✅ OpenHIM authenticated successfully");
    exports.importMediators();
    exports.installChannels();
});
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
    let patient = (yield exports.FhirApi({ url: `/Patient?identifier=${patientId}`, })).data;
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
const createClient = (name, password) => __awaiter(void 0, void 0, void 0, function* () {
    let headers = yield exports.getOpenHIMToken();
    const clientPassword = password;
    const clientPasswordDetails = yield genClientPassword(clientPassword);
    let response = yield (yield fetch(`${openhimApiUrl}/clients`, {
        headers: Object.assign(Object.assign({}, headers), { "Content-Type": "application/json" }),
        method: 'POST',
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
// export let apiHost = process.env.FHIR_BASE_URL
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
const getPatientSummary = (crossBorderId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let patient = yield exports.getPatientByHieId(crossBorderId);
        console.log(patient);
        let ips = (yield exports.FhirApi({ url: `/Patient/${patient.id}/$summary` })).data;
        return ips;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.getPatientSummary = getPatientSummary;
const letterToNumber = (str = '') => {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const char = str[i].toUpperCase();
        if (char >= 'A' && char <= 'Z') {
            const number = (char.charCodeAt(0) - 64).toString().padStart(2, '0');
            result += number;
        }
    }
    return String(result) || "X";
};
const mapStringToNumber = (str) => {
    let number = '';
    for (let x of str.slice(0, 3)) {
        number += letterToNumber(x);
    }
    return number;
};
const generateCrossBorderId = (patient) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    let month = new Date().getMonth() + 1;
    let dob = new Date(patient.birthDate);
    let gender = (patient === null || patient === void 0 ? void 0 : patient.gender) || null;
    let middleNameCode = mapStringToNumber(((_a = patient.name[0]) === null || _a === void 0 ? void 0 : _a.given[1]) || "X");
    let givenNameCode = mapStringToNumber(((_b = patient.name[0]) === null || _b === void 0 ? void 0 : _b.given[0]) || "X");
    let familyNameCode = mapStringToNumber((_c = patient.name[0]) === null || _c === void 0 ? void 0 : _c.family);
    let countryCode = "X";
    let genderCode = gender === 'male' ? "M" : gender === 'female' ? "F" : "X";
    let monthCode = (dob.getMonth() + 1) || "X";
    let year = dob.getFullYear() || "X";
    let id = `${countryCode}-0${monthCode}${year}-${genderCode}-${givenNameCode}-${familyNameCode}-${middleNameCode}`;
    // check if id exists
    // let response = (await FhirApi({ url: `/Patient?identifier=${id}` })).data
    // if(response?.entry){
    //     return id
    // }
    return id;
});
exports.generateCrossBorderId = generateCrossBorderId;
const getPatientByHieId = (crossBorderId) => __awaiter(void 0, void 0, void 0, function* () {
    var _d;
    try {
        let patient = (yield exports.FhirApi({ url: `/Patient?identifier=${crossBorderId}` })).data;
        if ((patient === null || patient === void 0 ? void 0 : patient.total) > 0 || ((_d = patient === null || patient === void 0 ? void 0 : patient.entry) === null || _d === void 0 ? void 0 : _d.length) > 0) {
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
exports.getPatientByHieId = getPatientByHieId;

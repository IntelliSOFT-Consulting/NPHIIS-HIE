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
exports.getPatientById = exports.parseIdentifiers = exports.FhirApi = exports.apiHost = void 0;
const shrPassThrough_json_1 = __importDefault(require("../config/shrPassThrough.json"));
// mediators to be registered
const mediators = [
    shrPassThrough_json_1.default
];
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
const getPatientById = (crossBorderId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let patient = (yield exports.FhirApi({ url: `/Patient?identifier=${crossBorderId}` })).data;
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

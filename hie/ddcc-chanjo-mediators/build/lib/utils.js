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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPatientById = exports.parseIdentifiers = exports.FhirApi = exports.NHDD_GENERIC_PATH = exports.apiHost = void 0;
exports.apiHost = process.env.FHIR_BASE_URL;
console.log("HAPI FHIR: ", exports.apiHost);
let NHDD_URL = process.env.NHDD_URL;
NHDD_URL = `${NHDD_URL}/orgs/MOH-KENYA/sources`;
exports.NHDD_GENERIC_PATH = `${NHDD_URL}/nhdd/concepts/`;
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
        return { [id.id]: id };
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

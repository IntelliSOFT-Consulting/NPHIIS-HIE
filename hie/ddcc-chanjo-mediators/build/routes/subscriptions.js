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
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const utils_1 = require("../lib/utils");
const node_fetch_1 = __importDefault(require("node-fetch"));
exports.router = express_1.default.Router();
exports.router.use(express_1.default.json());
// get posted Immunization resource
// extract patient & immunization
//process FHIR beneficiary
exports.router.put('/Immunization/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        let { id } = req.params;
        let data = yield (yield utils_1.FhirApi({ url: `/Immunization/${id}` })).data;
        let DIGITAL_CERT_MEDIATOR_ENDPOINT = (_a = process.env['DIGITAL_CERT_MEDIATOR_ENDPOINT']) !== null && _a !== void 0 ? _a : "";
        let OPENHIM_CLIENT_ID = (_b = process.env['OPENHIM_CLIENT_ID']) !== null && _b !== void 0 ? _b : "";
        let OPENHIM_CLIENT_PASSWORD = (_c = process.env['OPENHIM_CLIENT_PASSWORD']) !== null && _c !== void 0 ? _c : "";
        let response = yield (yield node_fetch_1.default(DIGITAL_CERT_MEDIATOR_ENDPOINT, {
            body: JSON.stringify(data),
            method: "POST",
            headers: { "Content-Type": "application/json",
                "Authorization": 'Basic ' + Buffer.from(OPENHIM_CLIENT_ID + ':' + OPENHIM_CLIENT_PASSWORD).toString('base64') }
        })).json();
        if (response.code >= 400) {
            res.statusCode = response.code;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                        "severity": "error",
                        "code": "exception",
                        "details": {
                            "text": `Failed to initiate certificate generation - ${JSON.stringify(response)}`
                        }
                    }]
            });
            return;
        }
        res.statusCode = 200;
        res.json(data);
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 400;
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": {
                        "text": `Failed to post beneficiary- ${JSON.stringify(error)}`
                    }
                }]
        });
        return;
    }
}));
exports.default = exports.router;

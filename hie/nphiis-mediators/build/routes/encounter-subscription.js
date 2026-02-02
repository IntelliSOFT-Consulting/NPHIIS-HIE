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
const fhir_1 = require("../lib/fhir");
const caseIdTracker_1 = require("../lib/caseIdTracker");
const fhir_2 = require("../lib/fhir");
exports.router = express_1.default.Router();
exports.router.use(express_1.default.json());
const POSSIBLE_REASON_CODES = {
    "Measles Case Information": "MEA",
    "MOH 505 Reporting Form": "MOH505",
    "AFP Case Information": "AFP"
};
function padStart(str, targetLength, padChar = '0') {
    while (str.length < targetLength) {
        str = padChar + str;
    }
    return str;
}
function toThreeDigits(num) {
    return padStart(num.toString(), 3, '0');
}
function getValidYear(dateString, fallbackDate = new Date()) {
    if (!dateString) {
        return fallbackDate.getFullYear();
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return fallbackDate.getFullYear();
    }
    return date.getFullYear();
}
//process FHIR beneficiary
exports.router.put('/notifications/Encounter/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log("🟢 Encounter subscription triggered for ID:", req.params.id);
    try {
        let { id } = req.params;
        console.log("🟢 Fetching encounter data...");
        let data = yield (yield (0, utils_1.FhirApi)({ url: `/Encounter/${id}` })).data;
        if ((_a = data.identifier) === null || _a === void 0 ? void 0 : _a.some((id) => id.system === "http://hie.org/identifiers/EPID" && id.use === "official")) {
            return res.status(200).json((0, fhir_2.OperationOutcome)("Encounter already has an official id with the system http://hie.org/identifiers/EPID"));
        }
        let response = yield (0, utils_1.sendMediatorRequest)("/process-encounters/assign-ids", data);
        console.log("🟢 sendMediatorRequest returned:", response);
        res.statusCode = response.code || 200;
        res.json(response.data || response);
        return;
    }
    catch (error) {
        console.error("🔴 Error in Encounter subscription:", error);
        res.statusCode = 400;
        res.json((0, fhir_2.OperationOutcome)(error));
        return;
    }
}));
//process FHIR beneficiary
exports.router.post('/assign-ids', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
    try {
        let data = req.body;
        let caseId;
        let encounterCodeSystem = "http://hie.org/identifiers/EPID";
        let reasonCode = (_d = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.reasonCode) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.coding) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.code;
        let patientId = (_f = (_e = data === null || data === void 0 ? void 0 : data.subject) === null || _e === void 0 ? void 0 : _e.reference) === null || _f === void 0 ? void 0 : _f.split("/")[1];
        let patient = yield (yield (0, utils_1.FhirApi)({ url: `/Patient/${patientId}` })).data;
        let onsetDate = (_h = (_g = patient === null || patient === void 0 ? void 0 : patient.identifier) === null || _g === void 0 ? void 0 : _g.find((id) => {
            var _a, _b;
            return id.system === "system-creation" &&
                ((_b = (_a = id.type) === null || _a === void 0 ? void 0 : _a.coding) === null || _b === void 0 ? void 0 : _b.some((coding) => coding.code === "system_creation"));
        })) === null || _h === void 0 ? void 0 : _h.value;
        // Convert onsetDate to a normal date format (YYYY-MM-DD)
        // onsetDate is expected to be in the format "YYYY-MM-DD HH:mm:ss"
        let normalizedOnsetDate = onsetDate;
        if (onsetDate && typeof onsetDate === "string") {
            // Extract only the date part before any space
            normalizedOnsetDate = onsetDate.split(" ")[0];
        }
        // Fallback to Patient birthDate if system-creation is missing
        if (!normalizedOnsetDate && (patient === null || patient === void 0 ? void 0 : patient.birthDate)) {
            normalizedOnsetDate = patient.birthDate;
            console.log("Using Patient birthDate as fallback for EPID year");
        }
        // Validate and extract year (falls back to current year if invalid)
        const yearForId = getValidYear(normalizedOnsetDate);
        if (!onsetDate) {
            console.warn(`Patient ${patientId} missing system-creation identifier. Using fallback for EPID year: ${yearForId}`);
        }
        let epidIdentifier = (_j = patient === null || patient === void 0 ? void 0 : patient.identifier) === null || _j === void 0 ? void 0 : _j.find((id) => {
            var _a, _b;
            return (_b = (_a = id.type) === null || _a === void 0 ? void 0 : _a.coding) === null || _b === void 0 ? void 0 : _b.some((coding) => coding.system === "http://hie.org/identifiers/EPID");
        });
        if ((epidIdentifier === null || epidIdentifier === void 0 ? void 0 : epidIdentifier.use) === "official") {
            console.log("Patient already has an official id with the system http://hie.org/identifiers/EPID");
            (0, fhir_1.processFollowUpObservations)(data === null || data === void 0 ? void 0 : data.id);
            return res.status(400).json((0, fhir_2.OperationOutcome)("Patient already has an official id with the system http://hie.org/identifiers/EPID"));
        }
        if (epidIdentifier) {
            // remove the patient identifier with the system http://hie.org/identifiers/EPID
            patient.identifier = patient.identifier.filter((id) => {
                var _a;
                return !(Array.isArray((_a = id === null || id === void 0 ? void 0 : id.type) === null || _a === void 0 ? void 0 : _a.coding) &&
                    id.type.coding.some((coding) => coding.system === "http://hie.org/identifiers/EPID"));
            });
        }
        let caseCondition = (POSSIBLE_REASON_CODES === null || POSSIBLE_REASON_CODES === void 0 ? void 0 : POSSIBLE_REASON_CODES[reasonCode]) || reasonCode.toUpperCase().slice(0, 3);
        const countyCode = "a4-county";
        const epidNoCode = "EPID";
        const onsetDateCode = "date_given";
        // fetch by code.....observations
        const subCountyCode = "a3-sub-county";
        const countryOfOriginCode = "country_of_origin";
        // console.log("Location:", location);
        const subCountyObservation = yield ((_m = (_l = (_k = (yield (0, utils_1.FhirApi)({ url: `/Observation?code=${subCountyCode}&encounter=${data === null || data === void 0 ? void 0 : data.id}` })).data) === null || _k === void 0 ? void 0 : _k.entry) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.resource);
        const subCounty = yield ((_q = (_p = (_o = (yield (0, utils_1.FhirApi)({ url: `/Location?name=${subCountyObservation === null || subCountyObservation === void 0 ? void 0 : subCountyObservation.valueString}` })).data) === null || _o === void 0 ? void 0 : _o.entry) === null || _p === void 0 ? void 0 : _p[0]) === null || _q === void 0 ? void 0 : _q.resource);
        const county = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${(_s = (_r = subCounty === null || subCounty === void 0 ? void 0 : subCounty.partOf) === null || _r === void 0 ? void 0 : _r.reference) === null || _s === void 0 ? void 0 : _s.split("/")[1]}` })).data;
        const country = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${(_u = (_t = county === null || county === void 0 ? void 0 : county.partOf) === null || _t === void 0 ? void 0 : _t.reference) === null || _u === void 0 ? void 0 : _u.split("/")[1]}` })).data;
        const subCountyName = (_w = (_v = subCounty === null || subCounty === void 0 ? void 0 : subCounty.name) === null || _v === void 0 ? void 0 : _v.toUpperCase()) === null || _w === void 0 ? void 0 : _w.trim();
        const countyName = (_y = (_x = county === null || county === void 0 ? void 0 : county.name) === null || _x === void 0 ? void 0 : _x.toUpperCase()) === null || _y === void 0 ? void 0 : _y.trim();
        const countryName = (_0 = (_z = country === null || country === void 0 ? void 0 : country.name) === null || _z === void 0 ? void 0 : _z.toUpperCase()) === null || _0 === void 0 ? void 0 : _0.trim();
        caseId = yield (0, caseIdTracker_1.generateCaseId)(countryName, countyName, subCountyName, caseCondition);
        let formattedId = `${countryName.substring(0, 3)}-${countyName.substring(0, 3)}-${subCountyName.substring(0, 3)}-${yearForId}-${caseCondition}-${toThreeDigits(caseId)}`;
        let newId = (0, fhir_1.FhirIdentifier)(encounterCodeSystem, "EPID", "Epidemiological ID", formattedId, true);
        let updatedPatient = yield (yield (0, utils_1.FhirApi)({
            url: `/Patient/${patientId}`, method: "PUT",
            data: JSON.stringify(Object.assign(Object.assign({}, patient), { identifier: [
                    ...patient === null || patient === void 0 ? void 0 : patient.identifier,
                    newId
                ] }))
        })).data;
        console.log("updatedPatient:", newId);
        // update the encounter with the new caseId
        // remove the encounter identifier with the system http://hie.org/identifiers/EPID
        data.identifier = data.identifier.filter((id) => id.system !== encounterCodeSystem);
        data.identifier.push(newId);
        let updatedEncounter = yield (yield (0, utils_1.FhirApi)({
            url: `/Encounter/${data === null || data === void 0 ? void 0 : data.id}`, method: "PUT",
            data: JSON.stringify(Object.assign(Object.assign({}, data), { identifier: [{ system: encounterCodeSystem, value: formattedId }] }))
        })).data;
        (0, fhir_1.processFollowUpObservations)(data === null || data === void 0 ? void 0 : data.id);
        return res.status(200).json(updatedEncounter);
    }
    catch (error) {
        console.error(error);
        return res.status(400).json((0, fhir_2.OperationOutcome)(error));
    }
}));
exports.default = exports.router;

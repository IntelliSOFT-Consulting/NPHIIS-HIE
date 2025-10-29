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
//process FHIR beneficiary
exports.router.put('/notifications/Encounter/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🟢 Encounter subscription triggered for ID:", req.params.id);
    try {
        let { id } = req.params;
        console.log("🟢 Fetching encounter data...");
        let data = yield (yield (0, utils_1.FhirApi)({ url: `/Encounter/${id}` })).data;
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
    try {
        let data = req.body;
        let caseId;
        let encounterCodeSystem = "http://hie.org/identifiers/EPID";
        let reasonCode = (_d = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.reasonCode) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.coding) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.code;
        let onsetDate = (_f = (_e = data.identifier) === null || _e === void 0 ? void 0 : _e.find((id) => {
            var _a, _b;
            return id.system === "system-creation" &&
                ((_b = (_a = id.type) === null || _a === void 0 ? void 0 : _a.coding) === null || _b === void 0 ? void 0 : _b.some((coding) => coding.system === "system-creation" &&
                    coding.code === "system_creation"));
        })) === null || _f === void 0 ? void 0 : _f.value;
        // Convert onsetDate to a normal date format (YYYY-MM-DD)
        // onsetDate is expected to be in the format "YYYY-MM-DD HH:mm:ss"
        let normalizedOnsetDate = onsetDate;
        if (onsetDate && typeof onsetDate === "string") {
            // Extract only the date part before any space
            normalizedOnsetDate = onsetDate.split(" ")[0];
        }
        let patientId = (_h = (_g = data === null || data === void 0 ? void 0 : data.subject) === null || _g === void 0 ? void 0 : _g.reference) === null || _h === void 0 ? void 0 : _h.split("/")[1];
        let patient = yield (yield (0, utils_1.FhirApi)({ url: `/Patient/${patientId}` })).data;
        let epidIdentifier = (_j = patient === null || patient === void 0 ? void 0 : patient.identifier) === null || _j === void 0 ? void 0 : _j.find((id) => id.system === encounterCodeSystem);
        if ((epidIdentifier === null || epidIdentifier === void 0 ? void 0 : epidIdentifier.use) === "official") {
            console.log("Patient already has an official id with the system http://hie.org/identifiers/EPID");
            return res.status(200).json((0, fhir_2.OperationOutcome)("Patient already has an official id with the system http://hie.org/identifiers/EPID"));
        }
        if (epidIdentifier) {
            // remove the patient identifier with the system http://hie.org/identifiers/EPID
            patient.identifier = patient.identifier.filter((id) => id.system !== encounterCodeSystem);
        }
        let caseCondition = (POSSIBLE_REASON_CODES === null || POSSIBLE_REASON_CODES === void 0 ? void 0 : POSSIBLE_REASON_CODES[reasonCode]) || reasonCode.toUpperCase().slice(0, 3);
        if (caseCondition === "MPOX") {
            const subCountyCode = "a3-sub-county";
            const countyCode = "a4-county";
            const epidNoCode = "EPID";
            const onsetDateCode = "date_given";
            const countryOfOriginCode = "country_of_origin";
            // fetch by code.....observations
        }
        const locationMeta = (_l = (_k = data === null || data === void 0 ? void 0 : data.meta) === null || _k === void 0 ? void 0 : _k.tag) === null || _l === void 0 ? void 0 : _l.find((tag) => tag.system === "http://example.org/fhir/StructureDefinition/observation-managingLocation");
        const location = (_m = locationMeta === null || locationMeta === void 0 ? void 0 : locationMeta.code) === null || _m === void 0 ? void 0 : _m.split("/")[1];
        const facility = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${location}` })).data;
        const ward = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${(_p = (_o = facility === null || facility === void 0 ? void 0 : facility.partOf) === null || _o === void 0 ? void 0 : _o.reference) === null || _p === void 0 ? void 0 : _p.split("/")[1]}` })).data;
        const subCounty = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${(_r = (_q = ward === null || ward === void 0 ? void 0 : ward.partOf) === null || _q === void 0 ? void 0 : _q.reference) === null || _r === void 0 ? void 0 : _r.split("/")[1]}` })).data;
        const county = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${(_t = (_s = subCounty === null || subCounty === void 0 ? void 0 : subCounty.partOf) === null || _s === void 0 ? void 0 : _s.reference) === null || _t === void 0 ? void 0 : _t.split("/")[1]}` })).data;
        const countryOfOrigin = yield (yield (0, utils_1.FhirApi)({ url: `/Location/${(_v = (_u = county === null || county === void 0 ? void 0 : county.partOf) === null || _u === void 0 ? void 0 : _u.reference) === null || _v === void 0 ? void 0 : _v.split("/")[1]}` })).data;
        caseId = yield (0, caseIdTracker_1.generateCaseId)((_w = countryOfOrigin === null || countryOfOrigin === void 0 ? void 0 : countryOfOrigin.name) === null || _w === void 0 ? void 0 : _w.toUpperCase(), (_x = county === null || county === void 0 ? void 0 : county.name) === null || _x === void 0 ? void 0 : _x.toUpperCase(), (_y = subCounty === null || subCounty === void 0 ? void 0 : subCounty.name) === null || _y === void 0 ? void 0 : _y.toUpperCase(), caseCondition);
        let formattedId = `${countryOfOrigin === null || countryOfOrigin === void 0 ? void 0 : countryOfOrigin.substring(0, 3).toUpperCase()}-${county === null || county === void 0 ? void 0 : county.substring(0, 3).toUpperCase()}-${subCounty === null || subCounty === void 0 ? void 0 : subCounty.substring(0, 3).toUpperCase()}-${new Date(onsetDate).getFullYear()}-${caseCondition}-${toThreeDigits(caseId)}`;
        let newId = (0, fhir_1.FhirIdentifier)(encounterCodeSystem, "EPID", "Epidemiological ID", formattedId);
        let updatedPatient = yield (yield (0, utils_1.FhirApi)({
            url: `/Patient/${patientId}`, method: "PUT",
            data: JSON.stringify(Object.assign(Object.assign({}, patient), { identifier: [
                    ...patient === null || patient === void 0 ? void 0 : patient.identifier,
                    newId
                ] }))
        })).data;
        console.log(updatedPatient);
        // update the encounter with the new caseId
        // remove the encounter identifier with the system http://hie.org/identifiers/EPID
        data.identifier = data.identifier.filter((id) => id.system !== encounterCodeSystem);
        data.identifier.push(newId);
        let updatedEncounter = yield (yield (0, utils_1.FhirApi)({
            url: `/Encounter/${data === null || data === void 0 ? void 0 : data.id}`, method: "PUT",
            data: JSON.stringify(Object.assign(Object.assign({}, data), { identifier: [{ system: encounterCodeSystem, value: formattedId }] }))
        })).data;
        res.statusCode = 200;
        res.json(updatedEncounter);
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
                        "text": `Failed to assign ids for encounter - ${JSON.stringify(error)}`
                    }
                }]
        });
        return;
    }
}));
exports.default = exports.router;

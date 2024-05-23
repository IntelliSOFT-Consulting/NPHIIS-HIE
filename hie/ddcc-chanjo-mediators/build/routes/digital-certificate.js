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
const uuid_1 = require("uuid");
const fhir_1 = require("../lib/fhir");
const generatePDF_1 = require("../lib/generatePDF");
const vaccineCodes_1 = require("../lib/vaccineCodes");
exports.router = express_1.default.Router();
exports.router.use(express_1.default.json());
const _vaccineCodes = vaccineCodes_1.vaccineCodes();
exports.router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        let data = req.body;
        let patientId = (_b = (_a = data === null || data === void 0 ? void 0 : data.subject) === null || _a === void 0 ? void 0 : _a.reference) !== null && _b !== void 0 ? _b : (_c = data === null || data === void 0 ? void 0 : data.patient) === null || _c === void 0 ? void 0 : _c.reference;
        let immunizationId = data.id;
        let vaccineCode = (_e = (_d = data === null || data === void 0 ? void 0 : data.vaccineCode) === null || _d === void 0 ? void 0 : _d.coding[0]) === null || _e === void 0 ? void 0 : _e.code;
        let vaccineName = _vaccineCodes[vaccineCode];
        // get all composition resources for this patient & vaccine code  - avoid regeneration of resources
        let compositions = yield (yield utils_1.FhirApi({ url: `/Composition?subject=${patientId}&type:code=${vaccineCode}` })).data;
        if (compositions === null || compositions === void 0 ? void 0 : compositions.entry) {
            compositions = compositions.entry.map((i) => {
                var _a, _b, _c, _d, _e;
                return (_e = (_d = (_c = (_b = (_a = i.resource) === null || _a === void 0 ? void 0 : _a.section) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.entry) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.reference.split('/')[1];
            });
            if (compositions.indexOf(immunizationId) > -1) {
                let vaccineFolder = yield fhir_1.getVaccineFolder(patientId, vaccineCode);
                let docRefs = yield (yield utils_1.FhirApi({ url: `/DocumentReference?_profile=StructureDefinition/DigitalCertificateDocumentReference&subject=${patientId}` })).data;
                let previousImmunizations = (_g = (_f = docRefs === null || docRefs === void 0 ? void 0 : docRefs.entry) === null || _f === void 0 ? void 0 : _f.map((i) => {
                    var _a, _b;
                    return { item: { reference: `${(_a = i === null || i === void 0 ? void 0 : i.resource) === null || _a === void 0 ? void 0 : _a.resourceType}/${(_b = i === null || i === void 0 ? void 0 : i.resource) === null || _b === void 0 ? void 0 : _b.id}` } };
                })) !== null && _g !== void 0 ? _g : [];
                // console.log("docRefs:", previousImmunizations);
                let updatedFolder = yield (yield utils_1.FhirApi({ url: `/List/${vaccineFolder.id}`, method: "PUT", data: JSON.stringify(Object.assign(Object.assign({}, vaccineFolder), { entry: previousImmunizations })) })).data;
                console.log(updatedFolder);
                res.statusCode = 200;
                res.json({
                    "resourceType": "OperationOutcome",
                    "id": "certificate-already-exists",
                    "issue": [{
                            "severity": "information",
                            "code": "certificate-already-exists",
                            "details": {
                                "text": String("Certificate was already generated")
                            }
                        }]
                });
                return;
            }
        }
        if (!vaccineName) {
            res.statusCode = 400;
            // console.log(error);
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                        "severity": "error",
                        "code": "exception",
                        "details": {
                            "text": String("Invalid vaccine code provided")
                        }
                    }]
            });
            return;
        }
        console.log(vaccineCode, vaccineName);
        patientId = String(patientId).split('/')[1];
        let patient = yield (yield utils_1.FhirApi({ url: `/Patient/${patientId}` })).data;
        if (patient.resourceType === 'OperationOutcome') {
            res.statusCode = 400;
            res.json(patient);
            return;
        }
        // begin processing cert workflow
        let doseQuantity = (_h = data === null || data === void 0 ? void 0 : data.doseQuantity) === null || _h === void 0 ? void 0 : _h.value;
        let locationId = (_j = data === null || data === void 0 ? void 0 : data.location) === null || _j === void 0 ? void 0 : _j.reference.split('/')[1];
        let location = (yield utils_1.FhirApi({ url: `/Location/${locationId}` })).data;
        // get/create vaccine folder and add a new document reference for this immunization
        let vaccineFolder = yield fhir_1.getVaccineFolder(patientId, vaccineCode);
        let docRefId = uuid_1.v4();
        // create certificate PDF
        let pdfFile = yield generatePDF_1.generatePDF(vaccineName, patient, docRefId);
        // savePDFToFileSystem(pdfFile, `${patientId}-${vaccineName}.pdf`.replace("/", '-'));
        // save pdf image to FHIR Server
        let docRefQR = yield fhir_1.createDocumentRefQR(patientId, locationId, pdfFile);
        // create Document/Bundle to attach to DocumentRef above
        let composition = yield fhir_1.createComposition(data.id);
        let organization = yield fhir_1.createOrganization(location);
        let document = yield fhir_1.createDocument(composition, patient, organization, docRefQR);
        let docRef = yield fhir_1.createDocumentRef(patientId, document.id);
        // let binaryId  = await createBinary(pdfFile);
        // console.log(binaryId)
        // update folder - fetch all documentReferences and attach here
        let docRefs = yield (yield utils_1.FhirApi({ url: `/DocumentReference?_profile=${"StructureDefinition/DigitalCertificateDocumentFolder"}&subject=${patientId}` })).data;
        let previousImmunizations = [];
        previousImmunizations = (_l = (_k = docRefs === null || docRefs === void 0 ? void 0 : docRefs.entry) === null || _k === void 0 ? void 0 : _k.map((i) => {
            var _a, _b;
            return { item: { reference: `${(_a = i === null || i === void 0 ? void 0 : i.resource) === null || _a === void 0 ? void 0 : _a.resourceType}/${(_b = i === null || i === void 0 ? void 0 : i.resource) === null || _b === void 0 ? void 0 : _b.id}` } };
        })) !== null && _l !== void 0 ? _l : [];
        let updatedFolder = yield (yield utils_1.FhirApi({ url: `/List/${vaccineFolder.id}`, method: "PUT", data: JSON.stringify(Object.assign(Object.assign({}, vaccineFolder), { entry: previousImmunizations })) })).data;
        console.log(updatedFolder);
        res.statusCode = 200;
        res.json(updatedFolder);
        return;
    }
    catch (error) {
        res.statusCode = 400;
        console.log(error);
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": {
                        "text": String(error)
                    }
                }]
        });
        return;
    }
}));
// id maps to a FHIR List / Folder 
exports.router.get('/:id/$validate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let data = req.body;
        // check headers or param for required response type.
        res.statusCode = 400;
        // res.json(patient);
        return;
    }
    catch (error) {
        res.statusCode = 400;
        console.log(error);
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": {
                        "text": String(error)
                    }
                }]
        });
        return;
    }
}));
exports.default = exports.router;

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
exports.createBinary = exports.processIdentifiers = exports.createFHIRSubscription = exports.processImmunization = exports.createDocument = exports.createDocumentRefQR = exports.createDocumentRef = exports.createOrganization = exports.createComposition = exports.getVaccineFolder = exports.getNHDDCode = exports.getProfile = void 0;
const utils_1 = require("./utils");
const vaccineCodes_1 = require("./vaccineCodes");
const getProfile = (id) => {
    return `StructureDefinition/${id}`;
};
exports.getProfile = getProfile;
const getNHDDCode = (code, display) => {
    return { system: utils_1.NHDD_GENERIC_PATH, code, display };
};
exports.getNHDDCode = getNHDDCode;
let vaccineCodesList = vaccineCodes_1.vaccineCodes();
const getVaccineFolder = (patientId, vaccineCode) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let folder = yield (yield utils_1.FhirApi({ url: `/List?code=${vaccineCode}&subject=${patientId}` })).data;
        if (!(folder === null || folder === void 0 ? void 0 : folder.entry)) {
            folder = yield (yield utils_1.FhirApi({
                url: `/List`,
                method: "POST", data: JSON.stringify({
                    resourceType: "List",
                    meta: { profile: [exports.getProfile("DigitalCertificateDocumentFolder")] },
                    subject: { reference: `${patientId}` },
                    code: { coding: [exports.getNHDDCode(vaccineCode, vaccineCodesList[vaccineCode])] },
                    entry: []
                })
            })).data;
            return folder;
        }
        return folder === null || folder === void 0 ? void 0 : folder.entry[0].resource;
    }
    catch (error) {
        return null;
    }
});
exports.getVaccineFolder = getVaccineFolder;
const createComposition = (immunizationResourceId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    try {
        let immunization = yield (yield utils_1.FhirApi({ url: `/Immunization/${immunizationResourceId}` })).data;
        console.log(exports.getNHDDCode((_c = (_b = (_a = immunization.vaccineCode) === null || _a === void 0 ? void 0 : _a.coding) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.code, (_f = (_e = (_d = immunization.vaccineCode) === null || _d === void 0 ? void 0 : _d.coding) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.display));
        let composition = yield (yield utils_1.FhirApi({
            url: `/Composition`,
            method: "POST",
            data: JSON.stringify({
                resourceType: "Composition",
                status: "final",
                type: { coding: [{ "system": "http://terminology.hl7.org/CodeSystem/document-type", "code": "34488-3", "display": "Digital COVID-19 Vaccination Certificate" }, exports.getNHDDCode((_j = (_h = (_g = immunization.vaccineCode) === null || _g === void 0 ? void 0 : _g.coding) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.code, vaccineCodesList[(_m = (_l = (_k = immunization.vaccineCode) === null || _k === void 0 ? void 0 : _k.coding) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.code])
                    ] },
                meta: { profile: [exports.getProfile("DigitalCertificateCompositionVaccinationStatus")] },
                subject: (_o = immunization.subject) !== null && _o !== void 0 ? _o : immunization.patient,
                author: (_r = (_q = (_p = immunization === null || immunization === void 0 ? void 0 : immunization.performer) === null || _p === void 0 ? void 0 : _p[0]) === null || _q === void 0 ? void 0 : _q.actor) === null || _r === void 0 ? void 0 : _r.reference,
                date: new Date().toISOString().slice(0, 10),
                custodian: { reference: `Organization/${(_s = immunization === null || immunization === void 0 ? void 0 : immunization.location) === null || _s === void 0 ? void 0 : _s.reference.split("/")[1]}` },
                section: [{
                        title: "Vaccination Details",
                        code: {
                            coding: [
                                {
                                    "system": "http://snomed.info/sct",
                                    "code": "419439003",
                                    "display": "Vaccination"
                                }
                            ]
                        },
                        entry: [
                            { reference: `Immunization/${immunizationResourceId}` }
                        ]
                    }]
            })
        })).data;
        return composition;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.createComposition = createComposition;
const createOrganization = (location) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let organization = yield (yield utils_1.FhirApi({
            url: `/Organization/${location.id}`, method: "PUT",
            data: JSON.stringify({
                resourceType: "Organization",
                meta: { profile: [exports.getProfile("DigitalCertificateOrganization")] },
                id: location.id,
                name: location.name
            })
        })).data;
        return organization;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.createOrganization = createOrganization;
const createDocumentRef = (patientId, compositionId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let docRef = yield (yield utils_1.FhirApi({
            url: `/DocumentReference`,
            method: "POST", data: JSON.stringify({
                resourceType: "DocumentReference",
                status: "current",
                meta: { profile: [exports.getProfile("DigitalCertificateDocumentReference")] },
                subject: { reference: `Patient/${patientId}` },
                date: new Date().toISOString(),
                content: [
                    {
                        attachment: {
                            contentType: "application/fhir",
                            url: `Bundle/${compositionId}`
                        }
                    }
                ]
            })
        })).data;
        return docRef;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.createDocumentRef = createDocumentRef;
const createDocumentRefQR = (patientId, facilityId, pdfContent) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let docRef = yield (yield utils_1.FhirApi({
            url: `/DocumentReference`,
            method: "POST", data: JSON.stringify({
                resourceType: "DocumentReference",
                meta: { "profile": [exports.getProfile("DigitalCertificateDocumentReferenceQR")] },
                identifier: { "use": "official", "system": "urn:EXAMPLE-who-:ddcc:composition:ids", "value": "999123456123456123456" },
                type: { "coding": [{ "system": "http://loinc.org", "code": "82593-5" }] },
                subject: { reference: `Patient/${patientId}` },
                date: new Date().toISOString(),
                authenticator: [{ reference: `Organization/${facilityId}` }],
                coding: [{ "system": "http://loinc.org", "code": "11369-6" }],
                content: [{
                        qrPDF: {
                            attachment: {
                                contentType: "application/pdf",
                                data: pdfContent
                            }
                        }
                    }]
            })
        })).data;
        return docRef;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.createDocumentRefQR = createDocumentRefQR;
const createDocument = (composition, patient, organization, documentRefQR) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let document = yield (yield utils_1.FhirApi({
            url: `/Bundle`,
            method: "POST", data: JSON.stringify({
                resourceType: "Bundle",
                type: "document",
                meta: { profile: [exports.getProfile("DigitalCertificateDocument")] },
                subject: { reference: `Patient/${patient.id}` },
                timestamp: new Date().toISOString(),
                entry: [
                    { fullUrl: `Composition/${composition.id}`, resource: composition },
                    { fullUrl: `Organization/${organization.id}`, resource: organization },
                    { fullUrl: `Patient/${patient.id}`, resource: patient },
                    { fullUrl: `DocumentReference/${documentRefQR.id}`, resource: documentRefQR },
                ]
            })
        })).data;
        return document;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.createDocument = createDocument;
const processImmunization = (data) => __awaiter(void 0, void 0, void 0, function* () {
    var _t;
    try {
        let patientId = (_t = data === null || data === void 0 ? void 0 : data.subject) === null || _t === void 0 ? void 0 : _t.reference;
    }
    catch (error) {
    }
});
exports.processImmunization = processImmunization;
let createFHIRSubscription = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let FHIR_SUBSCRIPTION_ID = process.env['FHIR_SUBSCRIPTION_ID'];
        let FHIR_SUBSCRIPTION_CALLBACK_URL = process.env['FHIR_SUBSCRIPTION_CALLBACK_URL'];
        let response = yield (yield utils_1.FhirApi({
            url: `/Subscription/${FHIR_SUBSCRIPTION_ID}`,
            method: "PUT", data: JSON.stringify({
                resourceType: 'Subscription',
                id: FHIR_SUBSCRIPTION_ID,
                status: "active",
                criteria: 'Immunization?',
                channel: {
                    type: 'rest-hook',
                    endpoint: FHIR_SUBSCRIPTION_CALLBACK_URL,
                    payload: 'application/json'
                }
            })
        })).data;
        if (response.resourceType != "OperationOutcome") {
            console.log(`FHIR Subscription ID: ${FHIR_SUBSCRIPTION_ID}`);
            return;
        }
        console.log(`Failed to create FHIR Subscription: \n${response}`);
    }
    catch (error) {
        console.log(error);
    }
});
exports.createFHIRSubscription = createFHIRSubscription;
exports.createFHIRSubscription();
const processIdentifiers = (identifiers) => __awaiter(void 0, void 0, void 0, function* () {
    var _u, _v;
    try {
        let ids = {};
        for (let id of identifiers) {
            let idType = (_u = id === null || id === void 0 ? void 0 : id.type) === null || _u === void 0 ? void 0 : _u.coding[0].code;
            let idSystem = (_v = id === null || id === void 0 ? void 0 : id.type) === null || _v === void 0 ? void 0 : _v.coding[0].system;
            // ids[`${id?.type?.}`]
            ids[idType] = id === null || id === void 0 ? void 0 : id.value;
        }
        return ids;
    }
    catch (error) {
        return {};
    }
});
exports.processIdentifiers = processIdentifiers;
const createBinary = (data) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let response = yield (yield utils_1.FhirApi({
            url: `/Binary`,
            method: "POST", data: JSON.stringify({
                resourceType: 'Binary',
                contentType: "application/pdf",
                status: "active",
                data
            })
        })).data;
        return response.id;
    }
    catch (error) {
        return null;
    }
});
exports.createBinary = createBinary;

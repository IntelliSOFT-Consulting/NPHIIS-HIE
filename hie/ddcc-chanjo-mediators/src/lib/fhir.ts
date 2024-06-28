import { FhirApi, NHDD_GENERIC_PATH } from "./utils";
import { vaccineCodes } from "./vaccineCodes";


export const getProfile = (id: string) => {
    return `StructureDefinition/${id}`
}


export const getNHDDCode = (code: string, display: string) => {
    return { system: NHDD_GENERIC_PATH, code, display }
}

let vaccineCodesList: any = vaccineCodes();

export const getVaccineFolder = async (patientId: string, vaccineCode: string) => {
    try {
        console.log(patientId);
        let folder = await (await FhirApi({ url: `/List?code=${vaccineCode}&subject=Patient/${patientId}` })).data;
        if (!folder?.entry) {
            folder = await (await FhirApi({
                url: `/List`,
                method: "POST", data: JSON.stringify({
                    resourceType: "List",
                    meta: { profile: [getProfile("DigitalCertificateDocumentFolder")] },
                    subject: { reference: `Patient/${patientId}` },
                    code: { coding: [getNHDDCode(vaccineCode, vaccineCodesList[vaccineCode])] },
                    entry: []
                })
            })).data;
            return folder;
        }
        return folder?.entry[0].resource;
    } catch (error) {
        return null;
    }
}

export const createComposition = async (immunizationResourceId: string) => {
    try {
        let immunization = await (await FhirApi({ url: `/Immunization/${immunizationResourceId}` })).data;
        console.log(getNHDDCode(immunization.vaccineCode?.coding?.[0]?.code, immunization.vaccineCode?.coding?.[0]?.display))
        let composition = await (await FhirApi({
            url: `/Composition`,
            method: "POST", data: JSON.stringify({
                resourceType: "Composition",
                status: "final",
                type: {
                    coding: [{ "system": "http://terminology.hl7.org/CodeSystem/document-type", "code": "34488-3", "display": "Digital COVID-19 Vaccination Certificate" }, getNHDDCode(immunization.vaccineCode?.coding?.[0]?.code, vaccineCodesList[immunization.vaccineCode?.coding?.[0]?.code])
                    ]
                },
                meta: { profile: [getProfile("DigitalCertificateCompositionVaccinationStatus")] },
                subject: immunization.subject ?? immunization.patient,
                author: immunization?.performer?.[0]?.actor?.reference,
                date: new Date().toISOString().slice(0, 10),
                custodian: { reference: `Organization/${immunization?.location?.reference.split("/")[1]}` },
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
    } catch (error) {
        console.log(error);
        return null;
    }
}

export const createOrganization = async (location: any) => {
    try {
        let organization = await (await FhirApi({
            url: `/Organization/${location.id}`, method: "PUT",
            data: JSON.stringify({
                resourceType: "Organization",
                meta: { profile: [getProfile("DigitalCertificateOrganization")] },
                id: location.id,
                name: location.name
            })
        })).data;
        return organization;
    } catch (error) {
        console.log(error);
        return null;
    }
}


export const createDocumentRef = async (patientId: string, compositionId: string, vaccineCode: string) => {
    try {
        let docRef = await (await FhirApi({
            url: `/DocumentReference`,
            method: "POST", data: JSON.stringify({
                resourceType: "DocumentReference",
                status: "current",
                type: {coding: [getNHDDCode(vaccineCode, vaccineCodesList[vaccineCode])]},
                meta: { profile: [getProfile("DigitalCertificateDocumentReference")] },
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
    } catch (error) {
        console.log(error);
        return null;
    }
}

export const createDocumentRefQR = async (patientId: string, facilityId: string, pdfContent: string, vaccineCode: string) => {
    try {
        let docRef = await (await FhirApi({
            url: `/DocumentReference`,
            method: "POST", data: JSON.stringify({
                resourceType: "DocumentReference",
                meta: { "profile": [getProfile("DigitalCertificateDocumentReferenceQR")] },
                // identifier: { "use": "official", "system": "urn:EXAMPLE-who-:ddcc:composition:ids", "value": "999123456123456123456" },
                type: { "coding": [{ "system": "http://loinc.org", "code": "82593-5" }, getNHDDCode(vaccineCode, vaccineCodesList[vaccineCode])] },
                subject: { reference: `Patient/${patientId}` },
                date: new Date().toISOString(),
                authenticator: [{ reference: `Organization/${facilityId}` }],
                content: [{
                    attachment: {
                        contentType: "application/pdf",
                        data: pdfContent
                    }
                }]
            })
        })).data;
        return docRef;
    } catch (error) {
        console.log(error);
        return null;
    }
}


export const createDocument = async (composition: any, patient: any, organization: any, documentRefQR: any) => {
    try {
        let document = await (await FhirApi({
            url: `/Bundle`,
            method: "POST", data: JSON.stringify({
                resourceType: "Bundle",
                type: "document",
                meta: { profile: [getProfile("DigitalCertificateDocument")] },
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
    } catch (error) {
        console.log(error);
        return null;
    }
}

export const processImmunization = async (data: any) => {
    try {
        let patientId = data?.subject?.reference;
    } catch (error) {

    }
}



export let createFHIRSubscription = async () => {
    try {
        let FHIR_SUBSCRIPTION_ID = process.env['FHIR_SUBSCRIPTION_ID'];
        let FHIR_SUBSCRIPTION_CALLBACK_URL = process.env['FHIR_SUBSCRIPTION_CALLBACK_URL'];
        let response = await (await FhirApi({
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
        })).data
        if (response.resourceType != "OperationOutcome") {
            console.log(`FHIR Subscription ID: ${FHIR_SUBSCRIPTION_ID}`);
            return;
        }
        console.log(`Failed to create FHIR Subscription: \n${response}`);
    } catch (error) {
        console.log(error);
    }
}


export const processIdentifiers = async (identifiers: any) => {
    try {
        let ids: any = {};
        for (let id of identifiers) {
            let idType = id?.type?.coding[0].code;
            let idSystem = id?.type?.coding[0].system;
            // ids[`${id?.type?.}`]
            ids[idType] = id?.value;
        }
        return ids;
    } catch (error) {
        return {}
    }
}


export const createBinary = async (data: string) => {
    try {
        let response = await (await FhirApi({
            url: `/Binary`,
            method: "POST", data: JSON.stringify({
                resourceType: 'Binary',
                contentType: "application/pdf",
                status: "active",
                data
            })
        })).data;
        return response.id;
    } catch (error) {
        return null;
    }
}
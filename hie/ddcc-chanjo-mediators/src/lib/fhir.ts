import { FhirApi, apiHost, NHDD_GENERIC_PATH } from "./utils";
import { vaccineCodes } from "./vaccineCodes";
import { generatePDF } from "./generatePDF";
import { contentType } from "mime-types";

// generatePDF("Polio");

export const getProfile = (id: string) =>{
    return `${apiHost}/StructureDefinition/${id}`
}

let FHIR_ID_SYSTEM = "https://chanjoke.intellisoftkenya.com/hapi/fhir"

export const getNHDDCode = (code: string, display: string) => {
    return {system: NHDD_GENERIC_PATH, code, display }
}

let vaccineCodesList: any = vaccineCodes();

export const getVaccineFolder = async (patientId: string, vaccineCode: string) => {
    try {
        let folder = await (await FhirApi({url:`/List?code=${vaccineCode}&subject=Patient/${patientId}`})).data;
        if(!folder?.entry){
            folder = await (await FhirApi({url:`/List`,
            method:"POST", body:JSON.stringify({
                resourceType:"List",
                meta:{ profile:[getProfile("DigitalCertificateDocumentFolder")] },
                subject:{reference: `Patient/${patientId}`},
                code:{coding:[getNHDDCode(vaccineCode, vaccineCodesList[vaccineCode])]},
                entry:[]
            })})).data;
            return folder.id;
        }
        return folder?.entry[0].resource.id;
    } catch (error) {
        return null;
    }
}

export const createComposition = async (immunizationResourceId: string) => {
    try {
        let immunization = await (await FhirApi({url:`/Immunization/${immunizationResourceId}`})).data;
        let composition = await (await FhirApi({url:`/Composition`,
            method:"POST", body:JSON.stringify({
                resourceType:"Composition",
                status:"final",
                type:{},
                meta:{ profile:[getProfile("DigitalCertificateCompostionVaccinationStatus")] },
                subject:immunization.subject ?? immunization.patient,
                author: immunization.subject ?? immunization.patient,
                date: new Date().toISOString(),
                section:{
                    vaccination:{
                        code:[
                            {coding: {
                                system: FHIR_ID_SYSTEM,
                                code: immunization.vaccineCode?.coding[0]?.code
                            }}
                        ],
                        focus: `Immunization/${immunizationResourceId}`
                    }
                }
            })})).data;
        return composition;
    } catch (error) {
        return null;
    }
}

export const createDocumentRef = async (patientId: string, documentId: string) => {
    try {
        let docRef = await (await FhirApi({url:`/DocumentReference`,
            method:"POST", body:JSON.stringify({
                resourceType:"DocumentReference",
                status:"current",
                meta:{ profile:[getProfile("DigitalCertificateDocumentReference")] },
                subject:{reference: `Patient/${patientId}`},
                date: new Date().toISOString(),
                content:[
                    {
                        attachment: {
                            contentType:"application/fhir",
                            url: `${apiHost}/Bundle/${documentId}`
                    }}
                ]
            })})).data;
        return docRef;
    } catch (error) {
        console.log(error);
        return null;
    }
}

export const createDocumentRefQR = async (patientId: string, documentId: string, facilityId: string, immunizationResourceId: string, ImmunizationRecommendationId: string | null) => {
    try {
        let docRef = await (await FhirApi({url:`/Composition`,
            method:"POST", body:JSON.stringify({
                "resourceType" : "Composition",
                "meta" : {"profile" : ["http://smart.who.int/ddcc/StructureDefinition/DDCCVSComposition"]},
                "identifier" : {
                  "use" : "official",
                  "system" : "urn:EXAMPLE-who-:ddcc:composition:ids",
                  "value" : "999123456123456123456"
                },
                "status" : "final",
                "type" : {
                  "coding" : [{ "system" : "http://loinc.org", "code" : "82593-5"
                  }]
                },
                subject : {reference : `Patient/${patientId}`},
                date : new Date().toISOString(),
                author : [{reference : `Organization/${facilityId}`}],
                title : "Digital Documentation of COVID-19 Certificate (DDCC)",
                "attester" : [{"mode" : "official",
                  "party" : {"reference" : `Organization/${facilityId}`}}],
                "section" : [{
                  "code" : {
                    "coding" : [{
                      "system" : "http://loinc.org",
                      "code" : "11369-6"
                    }]
                  },
                  "focus" : {reference : `Immunization/${immunizationResourceId}`},
                  "entry" : [{reference : `Immunization/${immunizationResourceId}`},
                  {reference : `ImmunizationRecommendation/${ImmunizationRecommendationId}`}]
                }]
              })})).data;
        return docRef;
    } catch (error) {
        console.log(error);
        return null;
    }
}


export const createDocument = async (patientId: string, documentRefId: string, composition: any) => {
    try {
        let document = await (await FhirApi({url:`/Bundle`,
            method:"POST", body:JSON.stringify({
                resourceType:"Bundle",
                meta:{ profile:[getProfile("DigitalCertificateDocument")] },
                subject:{reference: `Patient/${patientId}`},
                timestamp: new Date().toISOString(),
                entry:[
                    {composition}
                ]
            })})).data;
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
        let response = await (await FhirApi({ url:`/Subscription/${FHIR_SUBSCRIPTION_ID}`,
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
        if(response.resourceType != "OperationOutcome"){
            console.log(`FHIR Subscription ID: ${FHIR_SUBSCRIPTION_ID}`);
            return;
        }
        console.log(`Failed to create FHIR Subscription: \n${response}`);
    } catch (error) {
        console.log(error);
    }
}

createFHIRSubscription();



export const processIdentifiers = async (identifiers: any) => {
    try {
      let ids:any = {};
      for(let id of identifiers){
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
        let response = await (await FhirApi({ url:`/Binary`,
            method: "POST", data: JSON.stringify({
                resourceType: 'Binary',
                contentType: "application/pdf",
                status: "active", data
            })
        })).data;
        return response.id;
    } catch (error) {
        return null;
    }
}
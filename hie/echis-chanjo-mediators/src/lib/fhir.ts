

// Criteria for a ChanjoKE Service Request

import { HIE_SHR_FHIR_BASE, getAccessToken } from "./hie-auth"
import { FhirApi } from "./utils";

let getServiceRequests = async (upi: string | null, requester: string | null, performer: string | null) => {
    try {
        const queryParams = [
            upi ? `subject:identifier=${upi}` : '',
            requester ? `requester:identifier=${requester}` : '',
            performer ? `performer:identifier=${performer}` : ''
        ].filter(param => param !== '').join('&');
        const url = `${HIE_SHR_FHIR_BASE}${queryParams ? `?${queryParams}` : ''}`;
        let response = await (await fetch(url, { headers: { "Authorization": `Bearer ${await getAccessToken()}` } })).json();
        console.log(response);
        return response;
    } catch (error) {
        console.log(error);
        return null;
    }
}

let getPatientByUPI = async () => {
    try {
        let response = await (await fetch(HIE_SHR_FHIR_BASE, {
            headers: {
                "Authorization": `Bearer ${await getAccessToken()}`
            }
        })).json()
        return response;
    } catch (error) {
        console.log(error);
        return null;
    }
}

let OperationOutcome = (error: any) => {
    return {
        "resourceType": "OperationOutcome",
        "id": "exception",
        "issue": [{ "severity": "error", "code": "exception", "details": { "text": String(error) } }]
    }
}

let ChanjoServiceRequestToSHRServiceRequest = (ServiceRequest: any) => {
    try {
        return {
            ...ServiceRequest,
        }
    } catch (error) {
        return OperationOutcome(error);
    }
}

let upiSubject = (upi: string) => {
    return {
        "type": "Patient",
        "identifier": {
            "system": "http://cr.health.go.ke/upi",
            "value": upi
        },
        "display": upi
    }
}


let khmflFacility = (mflCode: string) => {
    return {
        "type": "Organization",
        "identifier": {
            "use": "official",
            "system": "https://kmhfl.health.go.ke/facilities",
            "value": mflCode
        },
        "display": mflCode
    }
}
let chanjoKESubject = (patientId: string ) => {return {reference: `Patient/${patientId}`}}

export const getNHDDCode = (code: string, display: string) => {
    return {system: "NHDD_GENERIC_PATH", code, display }
}

let nhddCode = (coding: any) => {
    return {
        coding: [
            {
                "system": "https://nhdd-api.health.go.ke/orgs/MOH-KENYA/sources/nhdd/concepts/",
                "code": coding.code,
                "display": coding.display
            }
        ],
        text: coding.display
    }
}

let createServiceRequest = (status: string, categoryCoding: any, subject: any, occurrencePeriod: any, 
    requester: string, performer: string, reasonCode: string, note: string) => {
        return {
            resourceType: "ServiceRequest",
            status, intent: "order",
            category: [nhddCode(categoryCoding)],
            priority: "urgent",
            subject,
            occurrencePeriod: {start: occurrencePeriod.start, end: occurrencePeriod.end},
            authoredOn: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }),
            requester: [khmflFacility(requester)],
            performer: [khmflFacility(performer)],
            reasonCode: [nhddCode(reasonCode)],
            note:[ {text: note}]
        }
    }

let postDefaulterTracingRequest = (upi: string, vaccineCode: string, requester: string, performer: string) => {
    try {

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
                criteria: 'ServiceRequest?',
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


// Criteria for a ChanjoKE Service Request

import { FhirApi } from "./utils";


let OperationOutcome = (error: any) => {
    return {
        "resourceType": "OperationOutcome",
        "id": "exception",
        "issue": [{ "severity": "error", "code": "exception", "details": { "text": String(error) } }]
    }
}

export const FhirIdentifier = (system: string, code: string, display: string, value: string) => {
    return { type: { coding: [{ system, code, display }] }, value }
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
                criteria: 'Encounter?reason-code=case-information',
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

// createFHIRSubscription();
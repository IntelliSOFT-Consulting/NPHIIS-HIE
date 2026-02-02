import { FhirApi } from "./utils";

/**
 * Delete all existing FHIR subscriptions before creating new ones
 */
const deleteAllSubscriptions = async () => {
    try {
        let response = await FhirApi({
            url: '/Subscription',
            method: 'GET'
        });
        
        const subscriptions = response.data?.entry || [];
        
        for (const entry of subscriptions) {
            const id = entry.resource?.id;
            if (id) {
                await FhirApi({
                    url: `/Subscription/${id}`,
                    method: 'DELETE'
                });
            }
        }
        
        console.log(`Deleted ${subscriptions.length} existing subscriptions`);
    } catch (error) {
        console.log('Error deleting subscriptions:', error);
    }
};

/**
 * General function to create a FHIR Subscription
 * @param subscriptionId - The ID for the subscription
 * @param callbackUrl - The endpoint URL to receive notifications
 * @param criteria - The FHIR search criteria for the subscription
 */
const createSubscription = async (subscriptionId: string, callbackUrl: string, criteria: string) => {
    try {
        let response = await (await FhirApi({ 
            url: `/Subscription/${subscriptionId}`,
            method: "PUT", 
            data: JSON.stringify({
                resourceType: 'Subscription',
                id: subscriptionId,
                status: "active",
                criteria: criteria,
                channel: {
                    type: 'rest-hook',
                    endpoint: callbackUrl,
                    payload: 'application/json'
                }
            })
        })).data
        
        if(response.resourceType != "OperationOutcome"){
            console.log(`FHIR Subscription ID: ${subscriptionId}`);
            return;
        }
        console.log(`Failed to create FHIR Subscription: \n${JSON.stringify(response)}`);
    } catch (error) {
        console.log(error);
    }
}

export let createEpidFHIRSubscription = async () => {
    let FHIR_EPID_SUBSCRIPTION_ID = process.env['FHIR_EPID_SUBSCRIPTION_ID'];
    let FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL = process.env['FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL'];
    
    if (!FHIR_EPID_SUBSCRIPTION_ID || !FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL) {
        console.log('Missing environment variables for Epid subscription');
        return;
    }
    
    await createSubscription(
        FHIR_EPID_SUBSCRIPTION_ID, 
        FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL, 
        `Encounter?`
    );
}

const createFollowUpFHIRSubscription = async () => {
    let FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID = process.env['FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID'];
    let FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL = process.env['FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL'];
    
    if (!FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID || !FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL) {
        console.log('Missing environment variables for Follow-up subscription');
        return;
    }
    
    await createSubscription(
        FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID, 
        FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL, 
        `Observation?code=502488184403`
    );
}

export let createFHIRSubscription = async () => {
    await deleteAllSubscriptions();
    await createEpidFHIRSubscription();
    // await createFollowUpFHIRSubscription();
}

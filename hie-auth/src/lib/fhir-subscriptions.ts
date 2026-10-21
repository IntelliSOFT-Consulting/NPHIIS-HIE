import { FhirApi } from "./utils";
import { patientActivityResourceTypes } from "./patient-activity";

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

const createSubscription = async (
    subscriptionId: string,
    callbackUrl: string,
    criteria: string,
    options: { sendDeletes?: boolean } = {}
) => {
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
                    payload: 'application/json',
                    extension: [{
                        url: 'http://hapifhir.io/fhir/StructureDefinition/subscription-delivery-retry-count',
                        valueInteger: 3
                    }, ...(options.sendDeletes ? [{
                        url: 'http://hapifhir.io/fhir/StructureDefinition/subscription-send-delete-messages',
                        valueBoolean: true
                    }] : [])]
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

const createSpecimenFHIRSubscription = async () => {
    let FHIR_SPECIMEN_SUBSCRIPTION_ID = process.env['FHIR_SPECIMEN_SUBSCRIPTION_ID'];
    let FHIR_SPECIMENS_SUBSCRIPTION_CALLBACK_URL = process.env['FHIR_SPECIMENS_SUBSCRIPTION_CALLBACK_URL'];

    if (!FHIR_SPECIMEN_SUBSCRIPTION_ID || !FHIR_SPECIMENS_SUBSCRIPTION_CALLBACK_URL) {
        console.log('Missing environment variables for Specimen subscription');
        return;
    }

    await createSubscription(
        FHIR_SPECIMEN_SUBSCRIPTION_ID,
        FHIR_SPECIMENS_SUBSCRIPTION_CALLBACK_URL,
        `Specimen?`
    );
}

/** One Subscription per patient-related type; each bumps the Patient's patient-data-last-updated extension. */
const createPatientActivitySubscriptions = async () => {
    let PATIENT_ACTIVITY_SUBSCRIPTION_CALLBACK_URL = process.env['PATIENT_ACTIVITY_SUBSCRIPTION_CALLBACK_URL'];

    if (!PATIENT_ACTIVITY_SUBSCRIPTION_CALLBACK_URL) {
        console.log('Missing environment variables for Patient activity subscriptions');
        return;
    }

    for (const type of patientActivityResourceTypes()) {
        await createSubscription(
            `patient-activity-${type.toLowerCase()}`,
            PATIENT_ACTIVITY_SUBSCRIPTION_CALLBACK_URL,
            `${type}?`,
            { sendDeletes: true }
        );
    }
}

export let createFHIRSubscription = async () => {
    await deleteAllSubscriptions();
    await createEpidFHIRSubscription();
    await createFollowUpFHIRSubscription();
    await createSpecimenFHIRSubscription();
    await createPatientActivitySubscriptions();
}

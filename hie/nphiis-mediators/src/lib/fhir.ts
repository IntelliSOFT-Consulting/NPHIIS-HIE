import { FhirApi, sendMediatorRequest } from "./utils";

let reasonCode = "mpox-register";

export let OperationOutcome = (error: any) => {
    return {
        "resourceType": "OperationOutcome",
        "id": "exception",
        "issue": [{ "severity": "error", "code": "exception", "details": { "text": String(error) } }]
    }
}

export const FhirIdentifier = (system: string, code: string, display: string, value: string, official: boolean = false) => {
    return { type: { coding: [{ system, code, display }] }, value, use: official ? "official" : "usual" }
}

export const processFollowUpObservations = async (encounterId: string) => {
    let response = await (await FhirApi({
        url: `/Observation?code=502488184403&encounter=${encounterId}`,
        method: "GET"
    })).data;
    // send observation to the follow up service
    if(response?.total > 0){
        const followUpResponse = await sendMediatorRequest("/process-observations/afp-follow-up", response?.entry?.[0]?.resource);
        if(followUpResponse?.status === "success"){
            return {
                status: "success",
                message: "Follow up observations created successfully"
            }
        }
        return {
            status: "error",
            message: "Failed to create follow up observations"
        }
    }
    console.log("No follow up observations found");
    return {
        status: "success",
        message: "No follow up observations found"
    }
}
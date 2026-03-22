import { FhirApi } from "./utils";
import { processAfpObservation } from "./notification";

export const processFollowUpObservations = async (encounterId: string) => {
    let response = await (await FhirApi({
        url: `/Observation?code=502488184403&encounter=${encounterId}`,
        method: "GET"
    })).data;
    if((response?.total ?? 0) > 0 || (response?.entry?.length ?? 0) > 0){
        const resource = response?.entry?.[0]?.resource;
        const followUpResponse = await processAfpObservation(resource);
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

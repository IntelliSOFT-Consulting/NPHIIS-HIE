import shrPassthroughConfig from '../config/mediatorConfig.json';

// ✅ Do this if using TYPESCRIPT
import { RequestInfo, RequestInit } from 'node-fetch';

// mediators to be registered
const mediators = [
    shrPassthroughConfig
];

const fetch = (url: RequestInfo, init?: RequestInit) =>
    import('node-fetch').then(({ default: fetch }) => fetch(url, init));


export let apiHost = process.env.FHIR_BASE_URL
console.log("HAPI FHIR: ", apiHost)


// a fetch wrapper for HAPI FHIR server.
export const FhirApi = async (params: any) => {
    let _defaultHeaders = { "Content-Type": 'application/json' }
    if (!params.method) {
        params.method = 'GET';
    }
    try {
        let response = await fetch(String(`${apiHost}${params.url}`), {
            headers: _defaultHeaders,
            method: params.method ? String(params.method) : 'GET',
            ...(params.method !== 'GET' && params.method !== 'DELETE') && { body: String(params.data) }
        });
        let responseJSON = await response.json();
        let res = {
            status: "success",
            statusText: response.statusText,
            data: responseJSON
        };
        return res;
    } catch (error) {
        console.error(error);
        let res = {
            statusText: "FHIRFetch: server error",
            status: "error",
            data: error
        };
        console.error(error);
        return res;
    }
}


export const parseIdentifiers = async (patientId: string) => {
    let patient: any = (await FhirApi({ url: `/Patient?identifier=${patientId}`, })).data
    if (!(patient?.total > 0 || patient?.entry.length > 0)) {
        return null;
    }
    let identifiers = patient.entry[0].resource.identifier;
    return identifiers.map((id: any) => {
        return {
            [id.id]: id
        }
    })
}


export const getPatientById = async (crossBorderId: string) => {
    try {
        let patient: any = (await FhirApi({ url: `/Patient?identifier=${crossBorderId}` })).data;
        if (patient?.total > 0 || patient?.entry?.length > 0) {
            patient = patient.entry[0].resource;
            return patient;
        }
        return null;
    } catch (error) {
        console.log(error);
        return null;
    }
}


// export const getPractitionerLocation = async ( practitioner: String)
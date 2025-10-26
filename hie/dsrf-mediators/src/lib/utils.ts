import idAssignmentConfig from '../config/idAssignmentPassThrough.json';
import afpFollowUpConfig from '../config/afpFollowUp.json';
import notificationServiceConfig from '../config/notificationService.json';
import utils from 'openhim-mediator-utils';


import { Agent } from 'https';
import * as crypto from 'crypto';

// ✅ Do this if using TYPESCRIPT
import { RequestInfo, RequestInit } from 'node-fetch';
import { createFHIRSubscription } from './fhir';

// mediators to be registered
const mediators = [
    idAssignmentConfig,
    afpFollowUpConfig,
    notificationServiceConfig,
];

const fetch = (url: RequestInfo, init?: RequestInit) =>
    import('node-fetch').then(({ default: fetch }) => fetch(url, init));


export let apiHost = process.env.FHIR_BASE_URL;
console.log("HAPI FHIR: ", apiHost)



const openhimApiUrl = process.env.OPENHIM_API_URL;
const openhimUsername = process.env.OPENHIM_USERNAME;
const openhimPassword = process.env.OPENHIM_PASSWORD;

const openhimConfig = {
    username: openhimUsername,
    password: openhimPassword,
    apiURL: openhimApiUrl,
    trustSelfSigned: true
}


const genClientPassword = async (password: string) => {
    return new Promise((resolve) => {
        const passwordSalt = crypto.randomBytes(16);
        // create passhash
        let shasum = crypto.createHash('sha512');
        shasum.update(password);
        shasum.update(passwordSalt.toString('hex'));
        const passwordHash = shasum.digest('hex');
        resolve({
            "passwordSalt": passwordSalt.toString('hex'),
            "passwordHash": passwordHash
        })
    })
}

export const getOpenHIMToken = async () => {
    try {
        let token = await utils.genAuthHeaders(openhimConfig);
        return token
    } catch (error) {
        console.log(error);
        return { error, status: "error" }
    }
}

export const createClient = async (name: string, password: string) => {
    let headers = await getOpenHIMToken();
    const clientPassword = password
    const clientPasswordDetails: any = await genClientPassword(clientPassword)
    let response = await (await fetch(`${openhimApiUrl}/clients`, {
        headers: { ...headers, "Content-Type": "application/json" }, method: 'POST',
        body: JSON.stringify({
            passwordAlgorithm: "sha512",
            passwordHash: clientPasswordDetails.passwordHash,
            passwordSalt: clientPasswordDetails.passwordSalt,
            clientID: name, name: name, "roles": [
                "*"
            ],
        }), agent: new Agent({
            rejectUnauthorized: false
        })
    })).text();
    console.log("create client: ", response)
    return response
}

utils.authenticate(openhimConfig, (e: any) => {
    console.log(e ? e : "✅ OpenHIM authenticated successfully");
    importMediators();
    installChannels();
    createFHIRSubscription();
})

createClient(process.env['OPENHIM_CLIENT_ID'] || '', process.env['OPENHIM_CLIENT_PASSWORD'] || '');


export const importMediators = () => {
    try {
        mediators.map((mediator: any) => {
            utils.registerMediator(openhimConfig, mediator, (e: any) => {
                console.log(e ? e : "");
            });
        })
    } catch (error) {
        console.log(error);
    }
    return;
}



export const installChannels = async () => {
    let headers = await getOpenHIMToken();
    mediators.map(async (mediator: any) => {
        let response = await (await fetch(`${openhimApiUrl}/channels`, {
            headers: { ...headers, "Content-Type": "application/json" }, method: 'POST', body: JSON.stringify(mediator.defaultChannelConfig[0]), agent: new Agent({
                rejectUnauthorized: false
            })
        })).text();
        console.log(response);
    })
}


// a fetch wrapper for HAPI FHIR server.
export const FhirApi = async (params: any) => {
    // disable cache
    params.disableCache = true;
    let _defaultHeaders = { "Content-Type": 'application/json', "Cache-Control": "no-cache" }
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


/**
 * Create a FHIR OperationOutcome response
 * @param message - Error or status message
 * @param severity - Severity level (error, warning, information)
 * @param code - Issue type code
 * @returns FHIR OperationOutcome object
 */
export const OperationOutcome = (
    message: string,
    severity: 'fatal' | 'error' | 'warning' | 'information' = 'error',
    code: string = 'exception'
) => {
    return {
        "resourceType": "OperationOutcome",
        "id": "exception",
        "issue": [{
            "severity": severity,
            "code": code,
            "details": {
                "text": message
            }
        }]
    };
};



export const sendMediatorRequest = async (url: string, data: any) => {
    try {
        let OPENHIM_CLIENT_ID = process.env['OPENHIM_CLIENT_ID'] ?? "";
        let OPENHIM_CLIENT_PASSWORD = process.env['OPENHIM_CLIENT_PASSWORD'] ?? "";
        let response = await (await fetch(url, {
            body: JSON.stringify(data),
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": 'Basic ' + Buffer.from(OPENHIM_CLIENT_ID + ':' + OPENHIM_CLIENT_PASSWORD).toString('base64')
            }
        })).json();
        return response;
    } catch (error) {
        console.log(error);
        return null;
    }
}
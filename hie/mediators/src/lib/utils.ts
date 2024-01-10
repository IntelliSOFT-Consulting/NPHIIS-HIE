import utils from 'openhim-mediator-utils';
import shrPassthroughConfig from '../config/shrPassThrough.json';


import { Agent } from 'https';
import * as crypto from 'crypto';

// ✅ Do this if using TYPESCRIPT
import { RequestInfo, RequestInit } from 'node-fetch';

// mediators to be registered
const mediators = [
    shrPassthroughConfig
];

const fetch = (url: RequestInfo, init?: RequestInit) =>
    import('node-fetch').then(({ default: fetch }) => fetch(url, init));

const openhimApiUrl = process.env.OPENHIM_API_URL;
const openhimUsername = process.env.OPENHIM_USERNAME;
const openhimPassword = process.env.OPENHIM_PASSWORD;

const openhimConfig = {
    username: openhimUsername,
    password: openhimPassword,
    apiURL: openhimApiUrl,
    trustSelfSigned: true
}

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



export const getOpenHIMToken = async () => {
    try {
        // console.log("Auth", auth)
        let token = await utils.genAuthHeaders(openhimConfig);
        return token
    } catch (error) {
        console.log(error);
        return { error, status: "error" }
    }
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

utils.authenticate(openhimConfig, (e: any) => {
    console.log(e ? e : "✅ OpenHIM authenticated successfully");
    importMediators();
    installChannels();
})

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


// export let apiHost = process.env.FHIR_BASE_URL


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


export const getPatientSummary = async (crossBorderId: string) => {
    try {
        let patient = await getPatientByHieId(crossBorderId)
        console.log(patient);
        let ips = (await FhirApi({ url: `/Patient/${patient.id}/$summary` })).data;
        return ips;
    } catch (error) {
        console.log(error);
        return null
    }
}


const letterToNumber = (str: any = '') => {
    let result = '';

    for (let i = 0; i < str.length; i++) {
        const char = str[i].toUpperCase();

        if (char >= 'A' && char <= 'Z') {
            const number = (char.charCodeAt(0) - 64).toString().padStart(2, '0');
            result += number;
        }
    }
    return String(result) || "X";
}

const mapStringToNumber = (str: string) => {
    let number = ''
    for (let x of str.slice(0, 3)) {
        number += letterToNumber(x)
    }
    return number;
}


export const generateCrossBorderId = async (patient: any) => {
    let month = new Date().getMonth() + 1;
    let dob = new Date(patient.birthDate);
    let gender = patient?.gender || null

    let middleNameCode = mapStringToNumber(patient.name[0]?.given[1] || "X")
    let givenNameCode = mapStringToNumber(patient.name[0]?.given[0] || "X")
    let familyNameCode = mapStringToNumber(patient.name[0]?.family)
    let countryCode = "X"
    let genderCode = gender === 'male' ? "M" : gender === 'female' ? "F" : "X"
    let monthCode = (dob.getMonth() + 1) || "X"
    let year = dob.getFullYear() || "X"

    let id = `${countryCode}-0${monthCode}${year}-${genderCode}-${givenNameCode}-${familyNameCode}-${middleNameCode}`;

    // check if id exists
    // let response = (await FhirApi({ url: `/Patient?identifier=${id}` })).data
    // if(response?.entry){
    //     return id
    // }
    return id;
}

export const getPatientByHieId = async (crossBorderId: string) => {
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

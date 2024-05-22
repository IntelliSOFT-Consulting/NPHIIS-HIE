import utils from 'openhim-mediator-utils';
import { Agent } from 'https';
import { RequestInfo, RequestInit } from 'node-fetch';

const fetch = (url: RequestInfo, init?: RequestInit) =>
    import('node-fetch').then(({ default: fetch }) => fetch(url, init));

import cerficiateMediatorConfig from "../config/mediatorConfig.json";

const mediators = [
    cerficiateMediatorConfig
]

// OpenHIM Configuration 
const openhimApiUrl = process.env.OPENHIM_API_URL;
const openhimUsername = process.env.OPENHIM_USERNAME;
const openhimPassword = process.env.OPENHIM_PASSWORD;

const openhimConfig = {
  apiURL: openhimApiUrl,
  username: openhimUsername,
  password: openhimPassword,
  trustSelfSigned: true
};

export const registerMediators = () => {
    utils.authenticate(openhimConfig, (e: any) => {
        console.log(e ? e : "✅ OpenHIM authenticated successfully\nImporting Mediators...");
        importMediators();
        console.log(e ? e : "✅ OpenHIM mediators imported successfully");
        installChannels();
        console.log(e ? e : "✅ OpenHIM channels installed successfully");
    })
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
            headers: { ...headers, "Content-Type": "application/json" }, method: 'POST', body: JSON.stringify(mediator.defaultChannelConfig[0]), 
            agent: new Agent({
                rejectUnauthorized: false
            })
        })).text();
        console.log(response);
    })
}

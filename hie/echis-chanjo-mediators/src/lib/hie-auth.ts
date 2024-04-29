import fetch from 'cross-fetch'


let HIE_AUTH_URL = process.env.HIE_AUTH_URL ?? '';
export let HIE_SHR_FHIR_BASE = process.env.HIE_SHR_FHIR_BASE ?? '';

let HIE_CLIENT_ID = process.env.HIE_CLIENT_ID ?? '';
let HIE_CLIENT_SECRET = process.env.HIE_CLIENT_SECRET ?? '';

export const getAccessToken = async () => {
  try {
    const urlencoded = new URLSearchParams();
    urlencoded.append("client_id", HIE_CLIENT_ID);
    urlencoded.append("client_secret", HIE_CLIENT_SECRET);
    urlencoded.append("grant_type", "client_credentials");
    urlencoded.append("scope", "DHP.Gateway DHP.Partners");
    let response = await (await fetch(HIE_AUTH_URL, {method: "POST", body: urlencoded, redirect: 'follow'
    })).json()
    console.log(response);
    return response.access_token;
  } catch (error) {
    return null;
  }
}

getAccessToken();
import fetch from "cross-fetch";
import { createHash, randomBytes } from 'crypto';
import { FhirApi } from "./utils";


let KC_BASE_URL = String(process.env.KC_BASE_URL);
let KC_REALM = String(process.env.KC_REALM);
let KC_CLIENT_ID = String(process.env.KC_CLIENT_ID);
let KC_CLIENT_SECRET = String(process.env.KC_CLIENT_SECRET);

// Function to generate hashed password and salt
const generateHashedPassword = (password: string, salt: string): string => {
  const hash = createHash('sha512');
  hash.update(password + salt);
  return hash.digest('base64');
};

// Function to generate a random salt
const generateRandomSalt = (length: number): string => {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};


export const getKeycloakAdminToken = async () => {
    try {
        const tokenResponse = await fetch(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded',},
            body: new URLSearchParams({
              grant_type: 'client_credentials', client_id: KC_CLIENT_ID, client_secret: KC_CLIENT_SECRET, }),
          });
        const tokenData: any = await tokenResponse.json();
        console.log("TOKEn", tokenData)
        return tokenData
    } catch (error) {
        return null;
    }
}

export const refreshToken = async (refreshToken: string) => {
  try {
    const tokenResponse = await fetch(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded',},
        body: new URLSearchParams({
          grant_type: 'refresh_token', client_id: KC_CLIENT_ID, client_secret: KC_CLIENT_SECRET, refresh_token: refreshToken }),
      });
    const tokenData: any = await tokenResponse.json();
    // console.log(tokenData)
    return tokenData
  } catch (error) {
      return null;
  }
}


export const findKeycloakUser = async (username: string) => {
    try {
        // await Client.auth(authConfig);
        const accessToken = (await getKeycloakAdminToken()).access_token;
        const searchResponse = await fetch(
            `${KC_BASE_URL}/admin/realms/${KC_REALM}/users?username=${encodeURIComponent(username)}`,
            {headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',},}
          );
          if (!searchResponse.ok) {
            console.error(`Failed to search user with username ${username}`);
            console.log(await searchResponse.json())
            return null;
          }
          const userData = await searchResponse.json();
          return userData[0];
    } catch (error) {
        console.error(error);
        return null
    }
}


export const validateResetCode = async (idNumber: string, resetCode: string) => {
  try {
    let userInfo = await findKeycloakUser(idNumber);
    let _resetCode = userInfo?.attributes?.resetCode;
    if(!_resetCode){
      return null;
    }
    _resetCode = _resetCode[0]
    return resetCode === _resetCode;
  } catch (error) {
    console.log(error);
    return null
  }
}



export const updateUserPassword = async (username: string, password: string) => {
  try {
    let user = (await findKeycloakUser(username));
    const accessToken = (await getKeycloakAdminToken()).access_token;
    const response = await (await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}/reset-password`,
      {headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, method: "PUT",
      body: JSON.stringify({type:"password", temporary: false, value: password})
      }
    ));
    if(response.ok){
      return true;
    }
    // console.log(await response.json());
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export const deleteResetCode = async (idNumber: string) => {
  try {
    let user = (await findKeycloakUser(idNumber));
    const accessToken = (await getKeycloakAdminToken()).access_token;
    delete user.attributes.resetCode;
    const response = await (await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`,
      {headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, method: "PUT",
      body: JSON.stringify({attributes: {...user.attributes}})}
    ));
    // let result = await response.json()
    // console.log(response);
    if(response.ok){
      return true;
    }
    // console.log(await response.json());
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export const updateUserProfile = async (
  username: string,
  phone: string | null,
  email: string | null,
  resetCode: string | null,
  practitionerRole: string | null
) => {
  try {
    let user = await findKeycloakUser(username);
    const accessToken = (await getKeycloakAdminToken()).access_token;
    
    let updatedAttributes = { ...user.attributes };
    
    updatedAttributes.phone = phone ? [phone] : updatedAttributes.phone || user.phone ? [user.phone] : null;
    
    if (resetCode !== null) {
      updatedAttributes.resetCode = [resetCode];
    }
    
    if (practitionerRole !== null) {
      updatedAttributes.practitionerRole = [practitionerRole];
    }
    
    const requestBody: any = {
      attributes: updatedAttributes
    };
    
    requestBody.email = email || user.email;
  

    const response = await (await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        method: "PUT",
        body: JSON.stringify(requestBody)
      }
    ));

    return response.ok ? true : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export const registerKeycloakUser = async (username: string, email: string | null, phone: string | null,lastName: string, firstName: string, password: string, fhirPatientId: string | null, fhirPractitionerId: string | null, practitionerRole: string | null) => {
    try {
        
        // Authenticate
        const accessToken = (await getKeycloakAdminToken()).access_token;
        let salt = generateRandomSalt(10);
        // Create Keycloak user
        const createUserResponse = await fetch(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, firstName, lastName, enabled: true, email,
              credentials: [
                {
                  "type": "password",
                  "secretData": JSON.stringify({
                    value: generateHashedPassword(password, salt)
                  }),
                  credentialData: JSON.stringify({
                    algorithm: 'sha512',
                    hashIterations: 1,
                }),
                },],
              attributes: {
                fhirPatientId,
                practitionerRole,
                phone,
                ...(fhirPractitionerId != null && { fhirPractitionerId })
              },
            }),
          })
      
        let responseCode = (createUserResponse.status)
        if(responseCode === 201){
          await updateUserPassword(username, password);
          return {success: "User registered successfully"}
        }
        const userData = await createUserResponse.json();
        console.log('User created successfully:', userData);
        if (Object.keys(userData).indexOf('errorMessage') > -1){
          return {error: userData.errorMessage.replace("username", "idNumber or email")}
        }
        return userData;
    } catch (error) {
        console.log(error);
        return null;
    }
}

export const getKeycloakUserToken = async (idNumber: string, password: string) => {
    try {
        const tokenResponse = await fetch(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'password',
              client_id: KC_CLIENT_ID,
              client_secret: KC_CLIENT_SECRET,
              username: idNumber,
              password,
            }),
          });
        const tokenData = await tokenResponse.json();
        // console.log(tokenData);
        return tokenData;
    } catch (error) {
        console.log(error);
        return null
    }
}

export const getCurrentUserInfo = async (accessToken: string) => {
  try {
    const userInfoEndpoint = `${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/userinfo`;
    // const accessToken = (await getKeycloakAdminToken()).access_token;
    // Make a request to Keycloak's userinfo endpoint with the access token
    const response = await fetch(userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type":"application/json"
      },
    });
    // console.log(response);
    let result = await response.json();
    // console.log(result);
    // Handle response
    if (response.ok) {
      // const userInfo = await response.json();
      // console.log(result);
      return result;
    } else {
      // console.log(result);
      return null;
    }
  }
  catch (error) {
    console.error(error)
    return null 
  }
}

export const getKeycloakUsers = async () => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    const response = await (await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )).json();
    // console.log(response);
    // return response.data;

    let responseData: any = [];
    response.map((i: any) =>{
      responseData.push({
        username: i.username, 
        firstName: i.firstName, 
        lastName: i.lastName, 
        email: i.email, 
        phone: i?.attributes?.phone?.[0],
        role: i?.attributes?.practitionerRole?.[0],
        // attr: i?.attributes
      })
    });
    return responseData;
  } catch (error) {
    console.log(error);
   return null;   
  }
}



const updateStuff = async () => {
  let users =  await getKeycloakUsers();
  users.map( async (i: any) => {
    if(i?.attr?.practitionerRole?.[0]){
      // console.log(i);
      let practitionerId = i?.attr?.fhirPractitionerId?.[0]
      let fhirPractitioner = await (await FhirApi({url: `/Practitioner/${practitionerId}`})).data;
      // let extension = fhirPractitioner.extension;
      let facilityId = fhirPractitioner.extension[0].valueReference.reference;
      let facility = await (await FhirApi({ url: `/${facilityId}` })).data;
      fhirPractitioner = await (await FhirApi({url: `/Practitioner/${practitionerId}`, method:"PUT", data: JSON.stringify({
        ...fhirPractitioner, extension: [
          { "url": "http://example.org/location", "valueReference": { "reference": `Location/${facility.id}`, "display": facility.name } },
          { "url": "http://example.org/fhir/StructureDefinition/role-group", "valueString": i?.attr?.practitionerRole[0]}
        ]}
      )})).data;
      console.log(fhirPractitioner);

    }
  })
}

// updateStuff()

export const sendPasswordResetLink = async (idNumber: string) => {
  try {
    let user = (await findKeycloakUser(idNumber));
    const accessToken = (await getKeycloakAdminToken()).access_token;
    let passwordResetEndpoint = `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}/execute-actions-email`
    let res = await (await fetch(passwordResetEndpoint, 
      {headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, method: "PUT",
      body: JSON.stringify({actions:["UPDATE_PASSWORD"]})
    })).json();
    console.log(res);
    return {status: "status", res}
  } catch (error) {
    console.log(error);
    return {status: "error", error: JSON.stringify(error)}
  }
}


// validateResetCodeAndResetPassword("123456", "89898")
// sendPasswordResetLink("1234567")
// deleteResetCode("123456")
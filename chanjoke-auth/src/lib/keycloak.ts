import fetch from "cross-fetch";
import { createHash, randomBytes } from 'crypto';


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
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
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


export const updateUserPassword = async (username: string, password: string) => {
  try {
    let user = (await findKeycloakUser(username));
    console.log(user)
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

export const updateUserProfile = async (username: string, password: string) => {
  try {
    let user = (await findKeycloakUser(username));
    console.log(user)
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

export const registerKeycloakUser = async (username: string, email: string | null, phone: string | null,firstName: string, lastName: string, password: string, fhirPatientId: string | null, fhirPractitionerId: string | null, practitionerRole: string | null) => {
    try {
        
        // Authenticate
        const accessToken = (await getKeycloakAdminToken()).access_token;
        // console.log(accessToken);
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
                fhirPractitionerId,
                practitionerRole,
                phone
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
    // Make a request to Keycloak's userinfo endpoint with the access token
    const response = await fetch(userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    // Handle response
    if (response.ok) {
      const userInfo = await response.json();
      console.log(userInfo);
      return userInfo;
    } else {
      console.log(await (response.text()))
      return null;
    }
  }
  catch (error) {
    console.error(error)
    return null 
  }
}

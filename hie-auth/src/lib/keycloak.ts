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


export const  validateResetCode = async (idNumber: string, resetCode: string) => {
  try {
    let userInfo = await findKeycloakUser(idNumber);
    console.log(userInfo);
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
  userInfo: any | null
) => {
  try {
    let user = await findKeycloakUser(username);
    if (!user) {
      console.error(`User not found: ${username}`);
      return null;
    }
    
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) {
      console.error('Failed to get admin token');
      return null;
    }
    
    let updatedAttributes = { ...user.attributes };
    
    // Fix phone attribute handling - only update if phone is provided
    if (phone !== null) {
      updatedAttributes.phone = [phone];
    }
    
    if (resetCode !== null) {
      user.resetCode = resetCode;
    }
    
    // Start with the existing user data to avoid overriding fields
    const requestBody: any = {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      enabled: user.enabled,
      attributes: updatedAttributes
    };
    
    // Only update email if provided
    if (email !== null) {
      requestBody.email = email;
    } else if (user.email) {
      // Preserve existing email if not updating
      requestBody.email = user.email;
    }
    
    // Merge any additional fields from userInfo if provided
    if (userInfo) {
      if (userInfo.firstName !== undefined) requestBody.firstName = userInfo.firstName;
      if (userInfo.lastName !== undefined) requestBody.lastName = userInfo.lastName;
      if (userInfo.enabled !== undefined) requestBody.enabled = userInfo.enabled;
    }

    console.log(`Updating user profile for ${username}:`, {
      phone: phone !== null ? phone : 'not updating',
      email: email !== null ? email : 'not updating', 
      resetCode: resetCode !== null ? 'updating' : 'not updating',
    });

    const response = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        method: "PUT",
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Failed to update user profile for ${username}:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return null;
    }

    console.log(`Successfully updated user profile for ${username}`);
    return true;
  } catch (error) {
    console.error(`Error updating user profile for ${username}:`, error);
    return null;
  }
}

export const registerKeycloakUser = async (username: string, email: string | null, phone: string | null,lastName: string, firstName: string, password: string, fhirPatientId: string | null) => {
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
                phone,
              },
            }),
          })
      
        let responseCode = (createUserResponse.status)
        if(responseCode === 201){
          await updateUserPassword(username, password);
          const token = await getKeycloakUserToken(username, password);
          const user =  await getCurrentUserInfo(token.access_token);
          return {success: "User registered successfully", id: user?.sub}
        }
        const userData: any = await createUserResponse.json();
        console.log('User created successfully:', userData);
        if (Object.keys(userData).indexOf('errorMessage') > -1){
          return {error: userData.errorMessage.replace("username", "idNumber or email"), }
        }
        return {error: userData.errorMessage.replace("username", "idNumber or email"),};
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
    
    const response = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`Keycloak API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const users = await response.json();
    
    // Optimized transformation using proper map instead of map + push
    const responseData = users.map((user: any) => ({
      id: user.id,
      username: user.username, 
      firstName: user.firstName, 
      lastName: user.lastName, 
      email: user.email, 
      phone: user?.attributes?.phone?.[0] || null,
      role: user?.attributes?.practitionerRole?.[0] || null,
      active: user.enabled,
      createdTimestamp: user.createdTimestamp
    }));

    return responseData;
  } catch (error) {
    console.error('Error fetching Keycloak users:', error);
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

// Authentication helper functions
export const validateBearerToken = (req: any): string | null => {
    const accessToken = req.headers.authorization?.split(' ')[1] || null;
    if (!accessToken || req.headers.authorization?.split(' ')[0] !== "Bearer") {
        return null;
    }
    return accessToken;
};

export const validateUserAuthentication = async (accessToken: string) => {
    const currentUser = await getCurrentUserInfo(accessToken);
    if (!currentUser) {
        return null;
    }
    return currentUser;
};

export const deleteKeycloakUser = async (username: string) => {
  try {
    let user = await findKeycloakUser(username);
    if (!user) {
      console.error(`User not found: ${username}`);
      return { success: false, error: "User not found" };
    }
    
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) {
      console.error('Failed to get admin token');
      return { success: false, error: "Failed to authenticate with Keycloak" };
    }
    
    const response = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        method: "DELETE"
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Failed to delete user ${username}:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return { success: false, error: `Failed to delete user: ${response.statusText}` };
    }

    console.log(`Successfully deleted user ${username} from Keycloak`);
    return { success: true, userId: user.id };
  } catch (error) {
    console.error(`Error deleting user ${username}:`, error);
    return { success: false, error: "Internal server error" };
  }
};

export const getKeycloakUserById = async (id: string) => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    const response = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const user = await response.json();
    if (!response.ok) {
      console.error(`Keycloak API error: ${response.status} ${response.statusText}`);
      return null;
    }
    return user;
  } catch (error) {
    console.error(`Error fetching Keycloak user by id ${id}:`, error);
    return null;
  }
}

const USER_ROLES = process.env.USER_ROLES?.split(",") || [];

// Create a role in Keycloak if it doesn't exist
const addKeycloakRole = async (roleName: string) => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    const response = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/roles`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({
          name: roleName.trim(),
        }),
      }
    );
    if (!response.ok) {
      // 409 Conflict means role already exists, which is fine
      if (response.status === 409) {
        console.log(`Role ${roleName} already exists`);
        return true;
      }
      const errorText = await response.text();
      console.error(`Failed to create role ${roleName}: ${response.status} ${response.statusText} - ${errorText}`);
      return false;
    }
    console.log(`Successfully created role: ${roleName}`);
    return true;
  } catch (error) {
    console.error(`Error creating role ${roleName}:`, error);
    return false;
  }
};

// check if USERROLES exist in Keycloak if not add them
export const checkUserRoles = async () => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    for (let roleName of USER_ROLES) {
      // Search for the specific role by name
      const response = await fetch(
        `${KC_BASE_URL}/admin/realms/${KC_REALM}/roles/${encodeURIComponent(roleName.trim())}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response.ok) {
        console.error(`Role not found: ${roleName} - ${response.status} ${response.statusText}`);
        await addKeycloakRole(roleName);
        continue;
      }
      const role = await response.json();
      if (!role || !role.id) {
        console.error(`Role data invalid for: ${roleName}`);
        continue;
      }
    }
  } catch (error) {
    console.error(`Error checking user roles:`, error);
    return null;
  }
}

checkUserRoles();
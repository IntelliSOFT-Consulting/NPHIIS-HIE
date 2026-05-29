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
    if (!user) {
      console.error(`User not found: ${idNumber}`);
      return null;
    }
    
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) {
      console.error('Failed to get admin token');
      return null;
    }
    
    // Remove resetCode from attributes
    let updatedAttributes = { ...user.attributes };
    delete updatedAttributes.resetCode;
    
    // Build complete request body with all user fields to prevent clearing user information
    const requestBody: any = {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      enabled: user.enabled,
      attributes: updatedAttributes
    };
    
    // Preserve email if it exists
    if (user.email) {
      requestBody.email = user.email;
    }
    
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
      console.error(`Failed to delete reset code for ${idNumber}:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return null;
    }
    
    return true;
  } catch (error) {
    console.error(`Error deleting reset code for ${idNumber}:`, error);
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
    
    // Store resetCode in user attributes so it persists in Keycloak
    if (resetCode !== null) {
      updatedAttributes.resetCode = [resetCode];
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
                firstLogin: ["true"],
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
    // Make a request to Keycloak's userinfo endpoint with the access token
    const response = await fetch(userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type":"application/json"
      },
    });
    
    // Check if response is OK before parsing JSON
    if (!response.ok) {
      // Try to get error details if available
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          console.error(`Keycloak userinfo error (${response.status}):`, errorData);
        } catch (e) {
          // Response might be empty or not valid JSON
          const text = await response.text().catch(() => '');
          console.error(`Keycloak userinfo error (${response.status}): ${text || 'Empty response'}`);
        }
      } else {
        const text = await response.text().catch(() => '');
        console.error(`Keycloak userinfo error (${response.status}): ${text || 'Empty response'}`);
      }
      return null;
    }
    
    // Only parse JSON if response is OK
    try {
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to parse userinfo response as JSON:', error);
      return null;
    }
  }
  catch (error) {
    console.error('Error fetching userinfo from Keycloak:', error)
    return null 
  }
}

/** Paginated Keycloak users with full `attributes` (for backfill / admin tooling). */
export const listKeycloakUsersRaw = async (
  first: number = 0,
  max: number = 100,
  search?: string,
): Promise<{ users: any[]; total: number | null } | null> => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    const url = new URL(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users`);
    url.searchParams.set("first", first.toString());
    url.searchParams.set("max", max.toString());
    if (search?.trim()) {
      url.searchParams.set("search", search.trim());
    }
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      console.error(`Keycloak API error: ${response.status} ${response.statusText}`);
      return null;
    }
    const users = await response.json();
    const totalHeader = response.headers.get("X-Total-Count");
    const total = totalHeader ? parseInt(totalHeader, 10) : null;
    return { users, total };
  } catch (error) {
    console.error("Error listing Keycloak users:", error);
    return null;
  }
};

/**
 * Merge Keycloak user attributes (preserves existing attribute keys).
 */
export const setKeycloakUserAttributes = async (
  userId: string,
  attrs: Record<string, string[]>,
): Promise<boolean> => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) return false;

    const getRes = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!getRes.ok) {
      console.error(`setKeycloakUserAttributes: user ${userId} not found`);
      return false;
    }
    const user = await getRes.json();
    const updatedAttributes = { ...(user.attributes ?? {}), ...attrs };
    const putRes = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${userId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          enabled: user.enabled,
          email: user.email,
          attributes: updatedAttributes,
        }),
      },
    );
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      console.error(`setKeycloakUserAttributes failed for ${userId}:`, err);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`setKeycloakUserAttributes error for ${userId}:`, error);
    return false;
  }
};

export const getKeycloakUsers = async (first: number = 0, max: number = 100, search?: string) => {
  try {
    const page = await listKeycloakUsersRaw(first, max, search);
    if (!page) return null;
    const { users, total } = page;

    const responseData = users.map((user: any) => ({
      id: user.id,
      username: user.username, 
      firstName: user.firstName, 
      lastName: user.lastName, 
      email: user.email, 
      phone: user?.attributes?.phone?.[0] || null,
      role: user?.attributes?.practitionerRole?.[0] || null,
      /** FHIR Practitioner id when set on the Keycloak user (see provider registration). */
      fhirPractitionerId: user?.attributes?.fhirPractitionerId?.[0] || null,
      active: user.enabled,
      createdTimestamp: user.createdTimestamp
    }));

    return {
      users: responseData,
      total,
    };
  } catch (error) {
    console.error('Error fetching Keycloak users:', error);
    return null;   
  }
}

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
    
    // Check if response is OK before parsing JSON
    if (!response.ok) {
      // Try to get error details if available
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          console.error(`Keycloak API error (${response.status}):`, errorData);
        } catch (e) {
          // Response might be empty or not valid JSON
          const text = await response.text().catch(() => '');
          console.error(`Keycloak API error (${response.status}): ${text || 'Empty response'}`);
        }
      } else {
        const text = await response.text().catch(() => '');
        console.error(`Keycloak API error (${response.status}): ${text || 'Empty response'}`);
      }
      return null;
    }
    
    // Only parse JSON if response is OK
    try {
      const user = await response.json();
      return user;
    } catch (error) {
      console.error(`Failed to parse Keycloak user response as JSON for id ${id}:`, error);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching Keycloak user by id ${id}:`, error);
    return null;
  }
}

export const setFirstLoginComplete = async (username: string) => {
  try {
    const user = await findKeycloakUser(username);
    if (!user) return null;
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) return null;

    const requestBody: any = {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      enabled: user.enabled,
      attributes: { ...user.attributes, firstLogin: ["false"] },
    };
    if (user.email) requestBody.email = user.email;

    const response = await fetch(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      method: "PUT",
      body: JSON.stringify(requestBody),
    });
    return response.ok ? true : null;
  } catch (error) {
    console.error(`Error marking firstLogin complete for ${username}:`, error);
    return null;
  }
};

export const setFirstLoginPending = async (username: string) => {
  try {
    const user = await findKeycloakUser(username);
    if (!user) return null;
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) return null;

    const requestBody: any = {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      enabled: user.enabled,
      attributes: { ...user.attributes, firstLogin: ["true"] },
    };
    if (user.email) requestBody.email = user.email;

    const response = await fetch(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      method: "PUT",
      body: JSON.stringify(requestBody),
    });
    return response.ok ? true : null;
  } catch (error) {
    console.error(`Error marking firstLogin pending for ${username}:`, error);
    return null;
  }
};

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

const REQUIRED_USER_ATTRIBUTES: { name: string; displayName: string }[] = [
  { name: "phone",               displayName: "Phone Number" },
  { name: "resetCode",           displayName: "Password Reset Code" },
  { name: "firstLogin",          displayName: "First Login" },
  { name: "fhirPatientId",       displayName: "FHIR Patient ID" },
  { name: "fhirPractitionerId",  displayName: "FHIR Practitioner ID" },
  { name: "practitionerRole",    displayName: "Practitioner Role" },
  { name: "nphiis_role",         displayName: "NPHIIS Role" },
  { name: "nphiis_location",     displayName: "NPHIIS Location" },
];

export const checkUserProfileAttributes = async () => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) {
      console.error("checkUserProfileAttributes: failed to obtain admin token");
      return;
    }

    const profileResponse = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/profile`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    if (!profileResponse.ok) {
      console.error(`Failed to fetch user profile schema: ${profileResponse.status}`);
      return;
    }

    const profile = await profileResponse.json();
    const existingNames: Set<string> = new Set((profile.attributes ?? []).map((a: any) => a.name));

    const missing = REQUIRED_USER_ATTRIBUTES.filter(a => !existingNames.has(a.name));
    if (missing.length === 0) {
      console.log("Keycloak user profile attributes: all required attributes present");
      return;
    }

    for (const attr of missing) {
      profile.attributes.push({
        name: attr.name,
        displayName: attr.displayName,
        permissions: { view: ["admin"], edit: ["admin"] },
        multivalued: false,
      });
      console.log(`Adding missing Keycloak attribute: ${attr.name}`);
    }

    const putResponse = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/profile`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      }
    );
    if (putResponse.ok) {
      console.log(`Keycloak user profile attributes: added [${missing.map(a => a.name).join(", ")}]`);
    } else {
      console.error(`Failed to update user profile schema: ${putResponse.status} ${putResponse.statusText}`);
    }
  } catch (error) {
    console.error("Error checking user profile attributes:", error);
  }
};

const REQUIRED_PROTOCOL_MAPPERS = [
  {
    name: "nphiis_role",
    protocolMapper: "oidc-usermodel-attribute-mapper",
    config: {
      "user.attribute": "nphiis_role",
      "claim.name": "nphiis_role",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "multivalued": "false",
    },
  },
  {
    name: "nphiis_location",
    protocolMapper: "oidc-usermodel-attribute-mapper",
    config: {
      "user.attribute": "nphiis_location",
      "claim.name": "nphiis_location",
      "jsonType.label": "JSON",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "multivalued": "false",
    },
  },
];

export const checkClientProtocolMappers = async () => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) {
      console.error("checkClientProtocolMappers: failed to obtain admin token");
      return;
    }

    const clientsRes = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/clients?clientId=${encodeURIComponent(KC_CLIENT_ID)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
    );
    if (!clientsRes.ok) {
      console.error(`checkClientProtocolMappers: failed to list clients: ${clientsRes.status}`);
      return;
    }
    const clients = await clientsRes.json();
    if (!clients.length) {
      console.error(`checkClientProtocolMappers: client '${KC_CLIENT_ID}' not found`);
      return;
    }
    const clientUuid: string = clients[0].id;

    const mappersRes = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/clients/${clientUuid}/protocol-mappers/models`,
      { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
    );
    if (!mappersRes.ok) {
      console.error(`checkClientProtocolMappers: failed to fetch mappers: ${mappersRes.status}`);
      return;
    }
    const existingMappers = await mappersRes.json();
    const existingNames = new Set<string>(existingMappers.map((m: any) => m.name));

    for (const mapper of REQUIRED_PROTOCOL_MAPPERS) {
      if (existingNames.has(mapper.name)) {
        console.log(`Protocol mapper '${mapper.name}' already exists on ${KC_CLIENT_ID}`);
        continue;
      }
      const addRes = await fetch(
        `${KC_BASE_URL}/admin/realms/${KC_REALM}/clients/${clientUuid}/protocol-mappers/models`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: mapper.name,
            protocol: "openid-connect",
            protocolMapper: mapper.protocolMapper,
            consentRequired: false,
            config: mapper.config,
          }),
        }
      );
      if (addRes.status === 201) {
        console.log(`Added protocol mapper '${mapper.name}' to client ${KC_CLIENT_ID}`);
      } else {
        const text = await addRes.text().catch(() => "");
        console.error(`Failed to add protocol mapper '${mapper.name}': ${addRes.status} ${text}`);
      }
    }
  } catch (error) {
    console.error("Error checking protocol mappers:", error);
  }
};

checkUserProfileAttributes();
checkUserRoles();
checkClientProtocolMappers();
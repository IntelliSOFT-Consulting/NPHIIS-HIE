import fetch from "cross-fetch";
import { timingSafeEqual } from 'crypto';
import { getApplicationRoles } from "./roles";
import { clearCounter, hitCounter } from "./rate-limit";
import { reportsClientOf } from "./reports-client";
export { reportsClientIds, reportsClientOf } from "./reports-client";


let KC_BASE_URL = String(process.env.KC_BASE_URL);
let KC_REALM = String(process.env.KC_REALM);
let KC_CLIENT_ID = String(process.env.KC_CLIENT_ID);
let KC_CLIENT_SECRET = String(process.env.KC_CLIENT_SECRET);

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

/**
 * Client credentials grant for a partner system's own Keycloak client (service account).
 * Returns null when Keycloak rejects the client id / secret.
 */
export const getClientCredentialsToken = async (clientId: string, clientSecret: string) => {
  try {
    const res = await fetch(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.access_token ? data : null;
  } catch (error) {
    console.error("getClientCredentialsToken:", error);
    return null;
  }
};

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


export function isNotificationsEnabledForKeycloakUser(user: {
  attributes?: Record<string, string[]>;
} | null | undefined): boolean {
  return user?.attributes?.notificationsEnabled?.[0] === "true";
}

export const findKeycloakUserByEmail = async (email: string) => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) return null;
    const searchResponse = await fetch(
      `${KC_BASE_URL}/admin/realms/${KC_REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!searchResponse.ok) {
      console.error(`Failed to search user with email ${email}`);
      return null;
    }
    const userData = await searchResponse.json();
    return userData[0] ?? null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

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


const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_CODE_TTL_MS = 15 * 60 * 1000;

/**
 * Checks a password-reset code. Codes expire (see resetCodeExpiresAt) and are
 * deleted after RESET_CODE_MAX_ATTEMPTS wrong guesses, so the user has to
 * request a new one.
 */
export const validateResetCode = async (idNumber: string, resetCode: string) => {
  try {
    if (!idNumber || !resetCode) return null;
    const userInfo = await findKeycloakUser(idNumber);
    const stored = userInfo?.attributes?.resetCode?.[0];
    if (!stored) return null;

    const expiresAt = Number(userInfo?.attributes?.resetCodeExpiresAt?.[0]);
    if (!expiresAt || Date.now() > expiresAt) {
      await deleteResetCode(idNumber);
      return null;
    }

    const a = Buffer.from(String(resetCode));
    const b = Buffer.from(String(stored));
    const failKey = `reset-fail:${String(idNumber).trim().toLowerCase()}`;
    if (a.length === b.length && timingSafeEqual(a, b)) {
      await clearCounter(failKey);
      return true;
    }

    // Wrong guesses are counted in the database, so the cap holds across
    // restarts and instances. If the count can't be stored this throws and
    // the code is treated as invalid.
    const { hits } = await hitCounter(failKey, RESET_CODE_TTL_MS);
    if (hits >= RESET_CODE_MAX_ATTEMPTS) {
      await clearCounter(failKey);
      await deleteResetCode(idNumber);
    }
    return false;
  } catch (error) {
    console.error(error);
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
    delete updatedAttributes.resetCodeExpiresAt;
    
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
      updatedAttributes.resetCodeExpiresAt = [String(Date.now() + RESET_CODE_TTL_MS)];
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
        // Create Keycloak user
        const createUserResponse = await fetch(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, firstName, lastName, enabled: true, email,
              // Keycloak hashes the password with the realm's password policy.
              credentials: [{ type: "password", value: password, temporary: false }],
              attributes: {
                fhirPatientId,
                phone,
                firstLogin: ["true"],
                tempPasswordExpiresAt: [tempPasswordExpiry()],
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

/**
 * The token's user, or null when Keycloak rejects it. Tokens of the reports clients are refused
 * unless allowReportsClient is set: they are for /reports/vhf only.
 */
export const getCurrentUserInfo = async (accessToken: string, { allowReportsClient = false } = {}) => {
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
      if (!allowReportsClient && reportsClientOf(accessToken, result)) {
        console.warn(`Refused a reports client token outside /reports/vhf (${result?.preferred_username})`);
        return null;
      }
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
      notificationsEnabled: user?.attributes?.notificationsEnabled?.[0] === "true",
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

export const validateUserAuthentication = async (accessToken: string, options: { allowReportsClient?: boolean } = {}) => {
    const currentUser = await getCurrentUserInfo(accessToken, options);
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

/** How long a temporary (welcome-email) password works before it must be re-issued. */
const TEMP_PASSWORD_TTL_MS = Number(process.env.TEMP_PASSWORD_TTL_HOURS ?? 72) * 60 * 60 * 1000;

const tempPasswordExpiry = () => String(Date.now() + TEMP_PASSWORD_TTL_MS);

function withoutTempPasswordExpiry(attrs: Record<string, unknown>) {
  const { tempPasswordExpiresAt: _drop, ...rest } = attrs;
  return rest;
}

/**
 * True when the user still has to change a temporary password and it has
 * expired. Accounts created before expiry was recorded have no
 * tempPasswordExpiresAt and are let through.
 */
export function isTempPasswordExpired(user: any): boolean {
  if (user?.attributes?.firstLogin?.[0] !== "true") return false;
  const expiresAt = Number(user?.attributes?.tempPasswordExpiresAt?.[0]);
  return !!expiresAt && Date.now() > expiresAt;
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
      attributes: withoutTempPasswordExpiry({ ...user.attributes, firstLogin: ["false"] }),
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
      attributes: { ...user.attributes, firstLogin: ["true"], tempPasswordExpiresAt: [tempPasswordExpiry()] },
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
    for (let roleName of getApplicationRoles()) {
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
  { name: "resetCodeExpiresAt",  displayName: "Password Reset Code Expiry" },
  { name: "tempPasswordExpiresAt", displayName: "Temporary Password Expiry" },
  { name: "firstLogin",          displayName: "First Login" },
  { name: "fhirPatientId",       displayName: "FHIR Patient ID" },
  { name: "fhirPractitionerId",  displayName: "FHIR Practitioner ID" },
  { name: "practitionerRole",    displayName: "Practitioner Role" },
  { name: "nphiis_role",         displayName: "NPHIIS Role" },
  { name: "nphiis_profile",      displayName: "NPHIIS Profile" },
  { name: "nphiis_location",     displayName: "NPHIIS Location" },
  { name: "notificationsEnabled", displayName: "Notifications Enabled" },
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

// Access tokens last 30 minutes unless KC_ACCESS_TOKEN_LIFESPAN_SECONDS says otherwise.
const ACCESS_TOKEN_LIFESPAN_SECONDS = Number(process.env.KC_ACCESS_TOKEN_LIFESPAN_SECONDS) || 30 * 60;

export const checkAccessTokenLifespan = async () => {
  try {
    const accessToken = (await getKeycloakAdminToken()).access_token;
    if (!accessToken) {
      console.error("checkAccessTokenLifespan: failed to obtain admin token");
      return;
    }
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const realmUrl = `${KC_BASE_URL}/admin/realms/${KC_REALM}`;

    const realmRes = await fetch(realmUrl, { headers });
    if (!realmRes.ok) {
      console.error(`checkAccessTokenLifespan: failed to read realm: ${realmRes.status}`);
      return;
    }
    const realm = await realmRes.json();
    if (realm.accessTokenLifespan === ACCESS_TOKEN_LIFESPAN_SECONDS) return;

    // Keycloak only updates the fields sent, so a partial body is safe.
    const updateRes = await fetch(realmUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ accessTokenLifespan: ACCESS_TOKEN_LIFESPAN_SECONDS }),
    });
    if (updateRes.ok) {
      console.log(
        `Access token lifespan for realm ${KC_REALM}: ${realm.accessTokenLifespan}s -> ${ACCESS_TOKEN_LIFESPAN_SECONDS}s`
      );
    } else {
      const text = await updateRes.text().catch(() => "");
      console.error(`checkAccessTokenLifespan: failed to update realm: ${updateRes.status} ${text}`);
    }
  } catch (error) {
    console.error("Error checking access token lifespan:", error);
  }
};

checkUserProfileAttributes();
checkUserRoles();
checkClientProtocolMappers();
checkAccessTokenLifespan();
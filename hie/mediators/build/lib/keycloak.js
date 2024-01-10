"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUserInfo = exports.getKeycloakUserToken = exports.registerKeycloakUser = exports.updateUserPassword = exports.findKeycloakUser = exports.getKeycloakAdminToken = void 0;
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const crypto_1 = require("crypto");
let KC_BASE_URL = String(process.env.KC_BASE_URL);
let KC_REALM = String(process.env.KC_REALM);
let KC_CLIENT_ID = String(process.env.KC_CLIENT_ID);
let KC_CLIENT_SECRET = String(process.env.KC_CLIENT_SECRET);
// Function to generate hashed password and salt
const generateHashedPassword = (password, salt) => {
    const hash = crypto_1.createHash('sha512');
    hash.update(password + salt);
    return hash.digest('base64');
};
// Function to generate a random salt
const generateRandomSalt = (length) => {
    return crypto_1.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};
const getKeycloakAdminToken = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenResponse = yield cross_fetch_1.default(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', },
            body: new URLSearchParams({
                grant_type: 'client_credentials', client_id: KC_CLIENT_ID, client_secret: KC_CLIENT_SECRET,
            }),
        });
        const tokenData = yield tokenResponse.json();
        return tokenData;
    }
    catch (error) {
        return null;
    }
});
exports.getKeycloakAdminToken = getKeycloakAdminToken;
const findKeycloakUser = (username) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // await Client.auth(authConfig);
        const accessToken = (yield exports.getKeycloakAdminToken()).access_token;
        const searchResponse = yield cross_fetch_1.default(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users?username=${encodeURIComponent(username)}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!searchResponse.ok) {
            console.error(`Failed to search user with username ${username}`);
            console.log(yield searchResponse.json());
            return null;
        }
        const userData = yield searchResponse.json();
        return userData[0];
    }
    catch (error) {
        console.error(error);
        return null;
    }
});
exports.findKeycloakUser = findKeycloakUser;
const updateUserPassword = (username, password) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let user = (yield exports.findKeycloakUser(username));
        console.log(user);
        const accessToken = (yield exports.getKeycloakAdminToken()).access_token;
        const response = yield (yield cross_fetch_1.default(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}/reset-password`, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, method: "PUT",
            body: JSON.stringify({ type: "password", temporary: false, value: password })
        }));
        if (response.ok) {
            return true;
        }
        console.log(yield response.json());
        return null;
    }
    catch (error) {
        console.error(error);
        return null;
    }
});
exports.updateUserPassword = updateUserPassword;
const registerKeycloakUser = (username, firstName, lastName, password, fhirPatientId, fhirPractitionerId, practitionerRole) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Authenticate
        const accessToken = (yield exports.getKeycloakAdminToken()).access_token;
        console.log(accessToken);
        let salt = generateRandomSalt(10);
        // Create Keycloak user
        const createUserResponse = yield cross_fetch_1.default(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, firstName, lastName, enabled: true,
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
                    },
                ],
                attributes: {
                    fhirPatientId,
                    fhirPractitionerId,
                    practitionerRole
                },
            }),
        });
        let responseCode = (createUserResponse.status);
        if (responseCode === 201) {
            yield exports.updateUserPassword(username, password);
            return { success: "User registered successfully" };
        }
        const userData = yield createUserResponse.json();
        console.log('User created successfully:', userData);
        if (Object.keys(userData).indexOf('errorMessage') > -1) {
            return { error: userData.errorMessage };
        }
        return userData;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.registerKeycloakUser = registerKeycloakUser;
const getKeycloakUserToken = (idNumber, password) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenResponse = yield cross_fetch_1.default(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
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
        const tokenData = yield tokenResponse.json();
        // console.log(tokenData);
        return tokenData;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.getKeycloakUserToken = getKeycloakUserToken;
const getCurrentUserInfo = (accessToken) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userInfoEndpoint = `${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/userinfo`;
        // Make a request to Keycloak's userinfo endpoint with the access token
        const response = yield cross_fetch_1.default(userInfoEndpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        // Handle response
        if (response.ok) {
            const userInfo = yield response.json();
            console.log(userInfo);
            return userInfo;
        }
        else {
            console.log(yield (response.text()));
            return null;
        }
    }
    catch (error) {
        console.error(error);
        return null;
    }
});
exports.getCurrentUserInfo = getCurrentUserInfo;

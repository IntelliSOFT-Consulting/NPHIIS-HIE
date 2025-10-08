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
exports.validateUserAuthentication = exports.validateBearerToken = exports.sendPasswordResetLink = exports.getKeycloakUsers = exports.getCurrentUserInfo = exports.getKeycloakUserToken = exports.registerKeycloakUser = exports.updateUserProfile = exports.deleteResetCode = exports.updateUserPassword = exports.validateResetCode = exports.findKeycloakUser = exports.refreshToken = exports.getKeycloakAdminToken = void 0;
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const crypto_1 = require("crypto");
const utils_1 = require("./utils");
let KC_BASE_URL = String(process.env.KC_BASE_URL);
let KC_REALM = String(process.env.KC_REALM);
let KC_CLIENT_ID = String(process.env.KC_CLIENT_ID);
let KC_CLIENT_SECRET = String(process.env.KC_CLIENT_SECRET);
// Function to generate hashed password and salt
const generateHashedPassword = (password, salt) => {
    const hash = (0, crypto_1.createHash)('sha512');
    hash.update(password + salt);
    return hash.digest('base64');
};
// Function to generate a random salt
const generateRandomSalt = (length) => {
    return (0, crypto_1.randomBytes)(Math.ceil(length / 2)).toString('hex').slice(0, length);
};
const getKeycloakAdminToken = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenResponse = yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
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
const refreshToken = (refreshToken) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenResponse = yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', },
            body: new URLSearchParams({
                grant_type: 'refresh_token', client_id: KC_CLIENT_ID, client_secret: KC_CLIENT_SECRET, refresh_token: refreshToken
            }),
        });
        const tokenData = yield tokenResponse.json();
        // console.log(tokenData)
        return tokenData;
    }
    catch (error) {
        return null;
    }
});
exports.refreshToken = refreshToken;
const findKeycloakUser = (username) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // await Client.auth(authConfig);
        const accessToken = (yield (0, exports.getKeycloakAdminToken)()).access_token;
        const searchResponse = yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users?username=${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, });
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
const validateResetCode = (idNumber, resetCode) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let userInfo = yield (0, exports.findKeycloakUser)(idNumber);
        let _resetCode = (_a = userInfo === null || userInfo === void 0 ? void 0 : userInfo.attributes) === null || _a === void 0 ? void 0 : _a.resetCode;
        if (!_resetCode) {
            return null;
        }
        _resetCode = _resetCode[0];
        return resetCode === _resetCode;
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.validateResetCode = validateResetCode;
const updateUserPassword = (username, password) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let user = (yield (0, exports.findKeycloakUser)(username));
        const accessToken = (yield (0, exports.getKeycloakAdminToken)()).access_token;
        const response = yield (yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}/reset-password`, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, method: "PUT",
            body: JSON.stringify({ type: "password", temporary: false, value: password })
        }));
        if (response.ok) {
            return true;
        }
        // console.log(await response.json());
        return null;
    }
    catch (error) {
        console.error(error);
        return null;
    }
});
exports.updateUserPassword = updateUserPassword;
const deleteResetCode = (idNumber) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let user = (yield (0, exports.findKeycloakUser)(idNumber));
        const accessToken = (yield (0, exports.getKeycloakAdminToken)()).access_token;
        delete user.attributes.resetCode;
        const response = yield (yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, method: "PUT",
            body: JSON.stringify({ attributes: Object.assign({}, user.attributes) }) }));
        // let result = await response.json()
        // console.log(response);
        if (response.ok) {
            return true;
        }
        // console.log(await response.json());
        return null;
    }
    catch (error) {
        console.error(error);
        return null;
    }
});
exports.deleteResetCode = deleteResetCode;
const updateUserProfile = (username, phone, email, resetCode, practitionerRole) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let user = yield (0, exports.findKeycloakUser)(username);
        if (!user) {
            console.error(`User not found: ${username}`);
            return null;
        }
        const accessToken = (yield (0, exports.getKeycloakAdminToken)()).access_token;
        if (!accessToken) {
            console.error('Failed to get admin token');
            return null;
        }
        let updatedAttributes = Object.assign({}, user.attributes);
        // Fix phone attribute handling - only update if phone is provided
        if (phone !== null) {
            updatedAttributes.phone = [phone];
        }
        if (resetCode !== null) {
            updatedAttributes.resetCode = [resetCode];
        }
        // Fix role update logic - only update if practitionerRole is provided
        if (practitionerRole !== null) {
            updatedAttributes.practitionerRole = [practitionerRole];
        }
        const requestBody = {
            attributes: updatedAttributes
        };
        // Only update email if provided
        if (email !== null) {
            requestBody.email = email;
        }
        console.log(`Updating user profile for ${username}:`, {
            phone: phone !== null ? phone : 'not updating',
            email: email !== null ? email : 'not updating',
            resetCode: resetCode !== null ? 'updating' : 'not updating',
            practitionerRole: practitionerRole !== null ? practitionerRole : 'not updating'
        });
        const response = yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            method: "PUT",
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorData = yield response.json().catch(() => ({}));
            console.error(`Failed to update user profile for ${username}:`, {
                status: response.status,
                statusText: response.statusText,
                error: errorData
            });
            return null;
        }
        console.log(`Successfully updated user profile for ${username}`);
        return true;
    }
    catch (error) {
        console.error(`Error updating user profile for ${username}:`, error);
        return null;
    }
});
exports.updateUserProfile = updateUserProfile;
const registerKeycloakUser = (username, email, phone, lastName, firstName, password, fhirPatientId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Authenticate
        const accessToken = (yield (0, exports.getKeycloakAdminToken)()).access_token;
        let salt = generateRandomSalt(10);
        // Create Keycloak user
        const createUserResponse = yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users`, {
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
                    },
                ],
                attributes: {
                    fhirPatientId,
                    phone,
                },
            }),
        });
        let responseCode = (createUserResponse.status);
        if (responseCode === 201) {
            yield (0, exports.updateUserPassword)(username, password);
            const token = yield (0, exports.getKeycloakUserToken)(username, password);
            const user = yield (0, exports.getCurrentUserInfo)(token.access_token);
            return { success: "User registered successfully", id: user === null || user === void 0 ? void 0 : user.sub };
        }
        const userData = yield createUserResponse.json();
        console.log('User created successfully:', userData);
        if (Object.keys(userData).indexOf('errorMessage') > -1) {
            return { error: userData.errorMessage.replace("username", "idNumber or email"), };
        }
        return { error: userData.errorMessage.replace("username", "idNumber or email"), };
    }
    catch (error) {
        console.log(error);
        return null;
    }
});
exports.registerKeycloakUser = registerKeycloakUser;
const getKeycloakUserToken = (idNumber, password) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenResponse = yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
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
        // const accessToken = (await getKeycloakAdminToken()).access_token;
        // Make a request to Keycloak's userinfo endpoint with the access token
        const response = yield (0, cross_fetch_1.default)(userInfoEndpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
        });
        // console.log(response);
        let result = yield response.json();
        // console.log(result);
        // Handle response
        if (response.ok) {
            // const userInfo = await response.json();
            // console.log(result);
            return result;
        }
        else {
            // console.log(result);
            return null;
        }
    }
    catch (error) {
        console.error(error);
        return null;
    }
});
exports.getCurrentUserInfo = getCurrentUserInfo;
const getKeycloakUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const accessToken = (yield (0, exports.getKeycloakAdminToken)()).access_token;
        const response = yield (0, cross_fetch_1.default)(`${KC_BASE_URL}/admin/realms/${KC_REALM}/users`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            console.error(`Keycloak API error: ${response.status} ${response.statusText}`);
            return null;
        }
        const users = yield response.json();
        // Optimized transformation using proper map instead of map + push
        const responseData = users.map((user) => {
            var _a, _b, _c, _d;
            return ({
                id: user.id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: ((_b = (_a = user === null || user === void 0 ? void 0 : user.attributes) === null || _a === void 0 ? void 0 : _a.phone) === null || _b === void 0 ? void 0 : _b[0]) || null,
                role: ((_d = (_c = user === null || user === void 0 ? void 0 : user.attributes) === null || _c === void 0 ? void 0 : _c.practitionerRole) === null || _d === void 0 ? void 0 : _d[0]) || null,
                active: user.enabled,
                createdTimestamp: user.createdTimestamp
            });
        });
        return responseData;
    }
    catch (error) {
        console.error('Error fetching Keycloak users:', error);
        return null;
    }
});
exports.getKeycloakUsers = getKeycloakUsers;
const updateStuff = () => __awaiter(void 0, void 0, void 0, function* () {
    let users = yield (0, exports.getKeycloakUsers)();
    users.map((i) => __awaiter(void 0, void 0, void 0, function* () {
        var _b, _c, _d, _e, _f;
        if ((_c = (_b = i === null || i === void 0 ? void 0 : i.attr) === null || _b === void 0 ? void 0 : _b.practitionerRole) === null || _c === void 0 ? void 0 : _c[0]) {
            // console.log(i);
            let practitionerId = (_e = (_d = i === null || i === void 0 ? void 0 : i.attr) === null || _d === void 0 ? void 0 : _d.fhirPractitionerId) === null || _e === void 0 ? void 0 : _e[0];
            let fhirPractitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${practitionerId}` })).data;
            // let extension = fhirPractitioner.extension;
            let facilityId = fhirPractitioner.extension[0].valueReference.reference;
            let facility = yield (yield (0, utils_1.FhirApi)({ url: `/${facilityId}` })).data;
            fhirPractitioner = yield (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${practitionerId}`, method: "PUT", data: JSON.stringify(Object.assign(Object.assign({}, fhirPractitioner), { extension: [
                        { "url": "http://example.org/location", "valueReference": { "reference": `Location/${facility.id}`, "display": facility.name } },
                        { "url": "http://example.org/fhir/StructureDefinition/role-group", "valueString": (_f = i === null || i === void 0 ? void 0 : i.attr) === null || _f === void 0 ? void 0 : _f.practitionerRole[0] }
                    ] })) })).data;
            console.log(fhirPractitioner);
        }
    }));
});
// updateStuff()
const sendPasswordResetLink = (idNumber) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let user = (yield (0, exports.findKeycloakUser)(idNumber));
        const accessToken = (yield (0, exports.getKeycloakAdminToken)()).access_token;
        let passwordResetEndpoint = `${KC_BASE_URL}/admin/realms/${KC_REALM}/users/${user.id}/execute-actions-email`;
        let res = yield (yield (0, cross_fetch_1.default)(passwordResetEndpoint, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', }, method: "PUT",
            body: JSON.stringify({ actions: ["UPDATE_PASSWORD"] })
        })).json();
        console.log(res);
        return { status: "status", res };
    }
    catch (error) {
        console.log(error);
        return { status: "error", error: JSON.stringify(error) };
    }
});
exports.sendPasswordResetLink = sendPasswordResetLink;
// Authentication helper functions
const validateBearerToken = (req) => {
    var _a, _b;
    const accessToken = ((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(' ')[1]) || null;
    if (!accessToken || ((_b = req.headers.authorization) === null || _b === void 0 ? void 0 : _b.split(' ')[0]) !== "Bearer") {
        return null;
    }
    return accessToken;
};
exports.validateBearerToken = validateBearerToken;
const validateUserAuthentication = (accessToken) => __awaiter(void 0, void 0, void 0, function* () {
    const currentUser = yield (0, exports.getCurrentUserInfo)(accessToken);
    if (!currentUser) {
        return null;
    }
    return currentUser;
});
exports.validateUserAuthentication = validateUserAuthentication;

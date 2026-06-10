import express, { Request, Response, NextFunction } from "express";
import { FhirApi, validateRole, validateLocationForRole, updatePractitionerLocation, buildLocationInfo, buildUserResponse } from "../lib/utils";
import { deleteResetCode, findKeycloakUser, getKeycloakUserToken, getKeycloakUsers, registerKeycloakUser, updateUserPassword, updateUserProfile, validateResetCode, refreshToken, deleteKeycloakUser, setFirstLoginComplete, setFirstLoginPending, setKeycloakUserAttributes, validateBearerToken, validateUserAuthentication } from './../lib/keycloak'
import { authenticateUser } from "../lib/middleware";
import { sendPasswordResetEmail, sendRegistrationConfirmationEmail } from "../lib/email";
import { getSupersetGuestToken } from "../lib/superset";
import { getRoleFromPractitioner, providerRoleKeycloakAttributes, putPractitionerRoleResource, resolvePractitionerAssignment, deletePractitionerRoleResource, syncPractitionerRoleAndExtensions, getLocationFromPractitioner } from "../lib/practitioner-role";
import { runPractitionerRoleBackfillJob } from "../lib/practitioner-role-backfill";
import { runPractitionerRoleResourceBackfillJob } from "../lib/practitioner-role-resource-backfill";
import { runCaseNotificationBackfillJob } from "../lib/notification-backfill-job";

const router = express.Router();
router.use(express.json());

const USER_ROLES = process.env.USER_ROLES?.split(",") || [];


const allowedRoles = USER_ROLES;


const heirachy = [
    { country: "COUNTRY" },
    { county: "COUNTY" },
    { subCounty: "SUB-COUNTY" },
    { ward: "WARD" },
    { facility: "FACILITY" }
]



// Optimized password generation with cached character set (alphanumeric only)
const PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const generatePassword = (length: number): string => {
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
        result[i] = PASSWORD_CHARS.charAt(Math.floor(Math.random() * PASSWORD_CHARS.length));
    }
    return result.join('');
};


router.post("/register", async (req: Request, res: Response) => {
    try {
        // Extract and validate input
        let { firstName, lastName, idNumber, password, role, email, phone, facility } = req.body;

        // Early validation - fail fast
        if (!idNumber || !firstName || !lastName || !role || !email) {
            return res.status(400).json({ status: "error", error: "password, idNumber, firstName, lastName, email and role are required" });
        }

        role = String(role).toUpperCase();
        if (allowedRoles.indexOf(role) < 0) {
            return res.status(400).json({ status: "error", error: `invalid role provided. Allowed roles: ${allowedRoles.join(",")}` });
        }

        if (role !== "ADMINISTRATOR" && !facility) {
            return res.status(400).json({ status: "error", error: "Failed to register user. Invalid location provided for user role" });
        }

        // Generate password if not provided
        if (!password) {
            password = generatePassword(12);
        }

        // Parallel operations for better performance
        const [keycloakUser, location] = await Promise.all([
            registerKeycloakUser(idNumber, email, phone, firstName, lastName, password, null),
            // Only fetch location if needed (not for ADMINISTRATOR role)
            role !== "ADMINISTRATOR" ?
                (await FhirApi({ url: `/Location/${facility}` })).data :
                Promise.resolve({ id: '0', name: process.env.ROOT_LOCATION_NAME || 'Kenya' })
        ]);

        // Validate keycloak user creation
        if (!keycloakUser) {
            return res.status(400).json({ status: "error", error: "Failed to register client user" });
        }
        console.log(keycloakUser);
        if (Object.keys(keycloakUser).indexOf('error') > -1) {
            return res.status(400).json({ ...keycloakUser, status: "error" });
        }

        const practitionerId = keycloakUser.id;

        // Build practitioner resource with telecom information
        const practitionerResource: any = {
            "resourceType": "Practitioner",
            "id": practitionerId,
            "meta": {
                "tag": [{
                    "system": "http://example.org/fhir/StructureDefinition/location",
                    "code": `Location/${location.id}`
                }]
            },
            "active": true,
            "identifier": [
                {
                    "system": "http://hl7.org/fhir/administrative-identifier",
                    "value": idNumber
                }
            ],
            "name": [{ "use": "official", "family": lastName, "given": [firstName] }],
            "extension": [
                {
                    "url": "http://example.org/location",
                    "valueReference": {
                        "reference": `Location/${location.id}`,
                        "display": location.name
                    }
                },
                {
                    "url": "http://example.org/fhir/StructureDefinition/role-group",
                    "valueString": role
                }
            ]
        };

        // Add telecom (phone and email) if provided
        const telecom = [];
        if (phone) {
            telecom.push({
                "system": "phone",
                "value": phone,
                "use": "work"
            });
        }
        if (email) {
            telecom.push({
                "system": "email",
                "value": email,
                "use": "work"
            });
        }
        if (telecom.length > 0) {
            practitionerResource.telecom = telecom;
        }

        // Create practitioner in FHIR
        const practitioner = (await FhirApi({
            url: `/Practitioner/${practitionerId}`,
            method: "PUT",
            data: JSON.stringify(practitionerResource)
        })).data;

        // Validate practitioner creation
        if (practitioner?.resourceType === "OperationOutcome") {
            return res.status(400).json({ status: "error", error: practitioner.issue[0].diagnostics });
        }

        await putPractitionerRoleResource(practitionerId, role, {
            id: location.id,
            name: location.name,
        });

        await setKeycloakUserAttributes(
            practitionerId,
            providerRoleKeycloakAttributes(practitionerId, role),
        );

        // Send confirmation email asynchronously (don't wait for it)
        setImmediate(() => {
            sendRegistrationConfirmationEmail(email, password, idNumber).catch(err => {
                console.error('Failed to send registration confirmation email:', err);
            });
        });

        return res.status(201).json({ response: keycloakUser.success, status: "success" });
    }
    catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ error: "Internal server error during registration", status: "error" });
    }
});

router.post("/login", async (req: Request, res: Response) => {
    try {
        let { idNumber, password } = req.body;
        let token = await getKeycloakUserToken(idNumber, password);
        if (!token) {
            return res.status(401).json({ status: "error", error: "Incorrect ID Number or Password provided" });
        }
        if (Object.keys(token).indexOf('error') > -1) {
            return res.status(401).json({ status: "error", error: `${token.error} - ${token.error_description}` })
        }

        let userInfo = await findKeycloakUser(idNumber);
        if (!userInfo) {
            return res.status(401).json({ status: "error", error: "User not found" });
        }

        let practitioner = await (await FhirApi({ url: `/Practitioner/${userInfo?.id}` })).data;
        if (!practitioner || !practitioner.active) {
            return res.status(401).json({ status: "error", error: "User not found or not active" });
        }

        const isFirstLogin = userInfo.attributes?.firstLogin?.[0] === "true";

        return res.status(200).json({ ...token, firstLogin: isFirstLogin, status: "success" });
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({ error: "incorrect email or password", status: "error" });
    }
});

router.post("/refresh_token", async (req: Request, res: Response) => {
    try {
        let { refresh_token } = req.body;
        let token = await refreshToken(refresh_token);
        if (!token) {
            return res.status(401).json({ status: "error", error: "Invalid refresh token provided" });
        }
        return res.status(200).json({ ...token, status: "success" });
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({ error: "Invalid refresh token provided", status: "error" });
    }
});

router.get("/me", authenticateUser, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;
        const userInfo = await findKeycloakUser(currentUser.preferred_username);

        if (!userInfo?.id) {
            return res.status(404).json({ error: "User not found", status: "error" });
        }

        const userId = userInfo.id;

        // Fetch practitioner data
        const practitioner = await (await FhirApi({ url: `/Practitioner/${userId}` })).data;

        if (!practitioner) {
            return res.status(404).json({ error: "Practitioner not found", status: "error" });
        }

        const assignment = await resolvePractitionerAssignment(userId, practitioner);
        const practitionerRole = assignment?.role ?? "ADMINISTRATOR";

        // For non-ADMINISTRATOR roles, build location info efficiently
        let locationInfo = {
            facility: "", facilityName: "", ward: "", wardName: "",
            subCounty: "", subCountyName: "", county: "", countyName: "", country: "", countryName: ""
        };

        const locationReference =
            assignment?.locationReference ??
            getLocationFromPractitioner(practitioner).reference;

        if (locationReference) {
            const fhirLocation = await (await FhirApi({ url: `/${locationReference}` })).data;
            const locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;

            if (locationType && fhirLocation) {
                locationInfo = await buildLocationInfo(fhirLocation, heirachy);
            }
        }

        return res.status(200).json({
            status: "success",
            user: {
                firstName: userInfo.firstName,
                lastName: userInfo.lastName,
                fhirPractitionerId: userId,
                practitionerRole,
                role: practitionerRole,
                status: practitioner.active,
                id: userInfo.id,
                idNumber: userInfo.username,
                fullNames: currentUser.name,
                phone: userInfo.attributes?.phone?.[0] || null,
                email: userInfo.email || null,
                locationInfo
            }
        });
    }
    catch (error) {
        console.error('GET /me error:', error);
        return res.status(500).json({ error: "Internal server error", status: "error" });
    }
});


router.get("/user/:username", authenticateUser, async (req: Request, res: Response) => {
    try {
        const username = req.params.username;
        const currentUser = (req as any).user;
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        let currentUserPractitioner = await (await FhirApi({ url: `/Practitioner/${userInfo.id}` })).data;
        let currentUserPractitionerRole = currentUserPractitioner?.extension?.length > 0 ?
            currentUserPractitioner.extension[1]?.valueString : "ADMINISTRATOR";
        if (currentUserPractitionerRole !== "ADMINISTRATOR") {
            return res.status(401).json({ error: "Unauthorized access", status: "error" });
        }
        let user = await findKeycloakUser(username);
        if (!user) {
            return res.status(404).json({ status: "error", error: "User not found" });
        }
        let practitioner = await (await FhirApi({ url: `/Practitioner/${user.id}` })).data;
        let practitionerRole = practitioner?.extension?.length > 0 ?
            practitioner.extension[1]?.valueString : "ADMINISTRATOR";
        let locationInfo = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "", country: "", countryName: "" };
        let fhirLocationRef = practitioner.extension[0].valueReference.reference;
        let fhirLocation = await (await FhirApi({ url: `/${fhirLocationRef}` })).data;
        locationInfo = await buildLocationInfo(fhirLocation, heirachy);
        return res.status(200).json({
            status: "success", user: {
                firstName: user.firstName,
                lastName: user.lastName,
                fhirPractitionerId: user.id,
                practitionerRole,
                id: user.id,
                idNumber: user.username,
                status: practitioner.active,
                fullNames: user.name,
                phone: user.attributes?.phone?.[0] || null,
                email: user.email || null,
                locationInfo
            }
        });
        return;


    } catch (error) {
        console.log(error);
        return res.status(401).json({ error, status: "error" });
        return;
    }
});


router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        let { idNumber, password, resetCode, temporaryPassword } = req.body;

        if (resetCode) {
            // Email reset-code flow
            let resetResp = await validateResetCode(idNumber, resetCode);
            if (!resetResp) {
                return res.status(401).json({ error: "Failed to update new password. Try again - Invalid reset code", status: "error" });
            }
            let resp = await updateUserPassword(idNumber, password);
            if (!resp) {
                return res.status(401).json({ error: "Failed to update new password. Try again", status: "error" });
            }
            await deleteResetCode(idNumber);
        } else if (temporaryPassword) {
            // First-login flow: verify current temporary password then set new one
            const tokenResp = await getKeycloakUserToken(idNumber, temporaryPassword);
            if (!tokenResp || tokenResp.error) {
                return res.status(401).json({ error: "Invalid temporary password provided", status: "error" });
            }
            let resp = await updateUserPassword(idNumber, password);
            if (!resp) {
                return res.status(401).json({ error: "Failed to update new password. Try again", status: "error" });
            }
        } else {
            return res.status(400).json({ error: "Either resetCode or temporaryPassword is required", status: "error" });
        }

        setImmediate(() => setFirstLoginComplete(idNumber).catch(err => {
            console.error('Failed to mark firstLogin complete after password reset:', err);
        }));
        return res.status(200).json({ response: "Password updated successfully", status: "success" });
    } catch (error) {
        console.error(error);
        return res.status(401).json({ error: "Invalid Bearer token provided", status: "error" });
    }
});


router.get('/reset-password', async (req: Request, res: Response) => {
    try {
        let { idNumber, email } = req.query;
        let userInfo = await findKeycloakUser(String(idNumber));
        
        // Validate user exists
        if (!userInfo) {
            return res.status(400).json({ status: "error", error: "User not found" });
        }
        
        // Validate email matches user's email
        if (userInfo.email !== email) {
            return res.status(400).json({ status: "error", error: "Failed to initiate password reset. Invalid account details." });
        }
        
        idNumber = String(idNumber);
        let resp = await sendPasswordResetEmail(idNumber);
        if (!resp) {
            return res.status(400).json({ status: "error", error: "Failed to initiate password reset. Try again." })
        }
        return res.status(200).json({ status: "success", response: "Check your email for the password reset code sent." })
    } catch (error) {
        console.error(error);
        return res.status(401).json({ error: "Failed to initiate password reset", status: "error" });
    }
});

router.post('/welcome-email', authenticateUser, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;
        const { username } = req.body;

        // Validate username is provided
        if (!username) {
            return res.status(400).json({ status: "error", error: "Username is required" });
        }

        // Get current user info to check permissions
        let currentUserInfo = await findKeycloakUser(currentUser.preferred_username);
        if (!currentUserInfo?.id) {
            return res.status(403).json({ error: "User not found", status: "error" });
        }

        const currentPractitioner = await (await FhirApi({ url: `/Practitioner/${currentUserInfo.id}` })).data;
        const practitionerRole = currentPractitioner?.extension?.length > 0 
            ? currentPractitioner.extension[1]?.valueString 
            : "ADMINISTRATOR";

        // Authorization check: Only administrators and superusers can send welcome emails
        if (practitionerRole !== "ADMINISTRATOR" && practitionerRole !== "SUPERUSER") {
            return res.status(403).json({ 
                error: "Unauthorized. Only administrators can send welcome emails.", 
                status: "error" 
            });
        }

        // Get target user info
        let targetUserInfo = await findKeycloakUser(username);
        if (!targetUserInfo) {
            return res.status(404).json({ error: "User not found", status: "error" });
        }

        // Validate user has email
        if (!targetUserInfo.email) {
            return res.status(400).json({ 
                status: "error", 
                error: "User does not have an email address configured" 
            });
        }

        // Generate new password
        const newPassword = generatePassword(12);

        // Update user password
        const passwordUpdateResult = await updateUserPassword(username, newPassword);
        if (!passwordUpdateResult) {
            return res.status(500).json({
                status: "error",
                error: "Failed to update user password"
            });
        }
        setImmediate(() => setFirstLoginPending(username).catch(err => {
            console.error('Failed to reset firstLogin pending after welcome email:', err);
        }));

        // Send welcome email with new credentials
        const emailSent = await sendRegistrationConfirmationEmail(
            targetUserInfo.email, 
            newPassword, 
            username
        );
        
        if (!emailSent) {
            return res.status(500).json({ 
                status: "error", 
                error: "Password updated but failed to send email. Please try again." 
            });
        }

        return res.status(200).json({ 
            status: "success", 
            message: "Welcome email sent successfully with new credentials" 
        });

    } catch (error) {
        console.error('POST /welcome-email error:', error);
        return res.status(500).json({ 
            error: "Internal server error while sending welcome email", 
            status: "error" 
        });
    }
});

function internalApiKeyMatches(req: Request): boolean {
    const expected = process.env.INTERNAL_SUBSCRIPTION_API_KEY;
    if (!expected?.trim()) return false;
    const provided = req.headers["x-internal-api-key"];
    const key = Array.isArray(provided) ? provided[0] : provided;
    return key === expected;
}

async function requireAdminOrInternalApiKey(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void | Response> {
    if (internalApiKeyMatches(req)) {
        return next();
    }
    const token = validateBearerToken(req);
    if (!token) {
        return res.status(401).json({ status: "error", error: "Bearer token is required" });
    }
    const currentUser = await validateUserAuthentication(token);
    if (!currentUser) {
        return res.status(401).json({ status: "error", error: "Invalid Bearer token" });
    }
    (req as any).user = currentUser;
    const userInfo = await findKeycloakUser(currentUser.preferred_username);
    if (!userInfo?.id) {
        return res.status(403).json({ status: "error", error: "User not found" });
    }
    const practitioner = (await FhirApi({ url: `/Practitioner/${userInfo.id}` })).data;
    const role = getRoleFromPractitioner(practitioner) ?? "ADMINISTRATOR";
    if (role !== "ADMINISTRATOR" && role !== "SUPERUSER") {
        return res.status(403).json({ status: "error", error: "Administrator access required" });
    }
    next();
}

router.post(
    "/users/backfill-practitioner-role-resources",
    requireAdminOrInternalApiKey,
    async (req: Request, res: Response) => {
        try {
            const stats = await runPractitionerRoleResourceBackfillJob();
            if (stats.skippedBecauseAlreadyRunning) {
                return res.status(409).json({
                    status: "error",
                    error: "PractitionerRole resource backfill is already running",
                });
            }
            return res.status(200).json({ status: "completed", stats });
        } catch (error) {
            console.error("backfill-practitioner-role-resources:", error);
            return res.status(500).json({ status: "error", error: String(error) });
        }
    },
);

router.post(
    "/users/backfill-practitioner-roles",
    requireAdminOrInternalApiKey,
    async (req: Request, res: Response) => {
        try {
            const stats = await runPractitionerRoleBackfillJob();
            if (stats.skippedBecauseAlreadyRunning) {
                return res.status(409).json({
                    status: "error",
                    error: "Practitioner role backfill is already running",
                });
            }
            return res.status(200).json({ status: "completed", stats });
        } catch (error) {
            console.error("backfill-practitioner-roles:", error);
            return res.status(500).json({ status: "error", error: String(error) });
        }
    },
);

router.post(
    "/users/backfill-case-notifications",
    requireAdminOrInternalApiKey,
    async (req: Request, res: Response) => {
        try {
            const stats = await runCaseNotificationBackfillJob();
            if (stats.skippedBecauseAlreadyRunning) {
                return res.status(409).json({
                    status: "error",
                    error: "Case notification backfill is already running",
                });
            }
            return res.status(200).json({ status: "completed", stats });
        } catch (error) {
            console.error("backfill-case-notifications:", error);
            return res.status(500).json({ status: "error", error: String(error) });
        }
    },
);

router.get("/users", authenticateUser, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;

        // Optimized authorization check - early return for better performance
        const userInfo = await findKeycloakUser(currentUser.preferred_username);
        if (!userInfo?.id) {
            return res.status(403).json({ error: "User not found", status: "error" });
        }
        const practitioner = await (await FhirApi({ url: `/Practitioner/${userInfo.id}` })).data;
        if (!practitioner) {
            return res.status(404).json({ error: "Practitioner not found", status: "error" });
        }
        const practitionerRole = practitioner?.extension?.length > 0 ?
            practitioner.extension[1]?.valueString : "ADMINISTRATOR";

        if (practitionerRole !== "ADMINISTRATOR" && practitionerRole !== "SUPERUSER") {
            return res.status(403).json({ error: "Insufficient permissions. Administrator access required.", status: "error" });
        }

        // Get pagination parameters from query string
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const first = (page - 1) * limit;
        const max = limit;
        const search = req.query.search as string | undefined;

        // Fetch users with pagination and search
        const keycloakResponse = await getKeycloakUsers(first, max, search);
        if (!keycloakResponse || !keycloakResponse.users) {
            return res.status(500).json({ error: "Failed to retrieve users from Keycloak", status: "error" });
        }
        
        const response = [];
        for(let user of keycloakResponse.users){
            if(!user.id){
                continue;
            }
            const practitioner = await (await FhirApi({ url: `/Practitioner/${user.id}` })).data;
            const assignment = await resolvePractitionerAssignment(user.id, practitioner);
            const role = assignment?.role ?? getRoleFromPractitioner(practitioner) ?? "ADMINISTRATOR";
            user.role = role;
            response.push({...user, role});
        }

        // Get total count - if not available from Keycloak, we need to fetch it separately
        // When searching, we need to get the total count of search results
        let total: number = keycloakResponse.total || 0;
        if (total === 0 || total === null || total === undefined) {
            // Fetch total count separately (without pagination, but with same search if provided)
            const totalResponse = await getKeycloakUsers(0, 1, search);
            if (totalResponse && totalResponse.total !== null && totalResponse.total !== undefined) {
                total = totalResponse.total;
            } else {
                // Fallback: fetch all users to count (only if we don't have total)
                // Use search parameter if provided
                const allUsersResponse = await getKeycloakUsers(0, 10000, search);
                total = allUsersResponse?.users?.length || response.length;
            }
        }
        
        // Ensure total is never null/undefined
        if (!total || total === 0) {
            total = response.length;
        }

        return res.status(200).json({
            users: response,
            total: total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(total / limit),
            status: "success"
        });

    } catch (error) {
        console.error('GET /users error:', error);
        return res.status(500).json({
            error: "Internal server error while fetching users",
            status: "error"
        });
    }
});

router.put("/users/:username", authenticateUser, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;
        const { username } = req.params;
        let { phone, email, facilityCode, county, subCounty, role, firstName, lastName } = req.body;

       
        let currentUserInfo = await findKeycloakUser(currentUser.preferred_username);
        if (!currentUserInfo?.id) {
            return res.status(403).json({ error: "User not found", status: "error" });
        }
        const practitioner = await (await FhirApi({ url: `/Practitioner/${currentUserInfo.id}` })).data;
        const practitionerRole = practitioner?.extension?.length > 0 ?
            practitioner.extension[1]?.valueString : "ADMINISTRATOR";
        if (practitionerRole !== "ADMINISTRATOR" && practitionerRole !== "SUPERUSER") {
            return res.status(403).json({ error: "Unauthorized access. Only administrators can edit users.", status: "error" });
        }


        // Get target user info
        let targetUserInfo = await findKeycloakUser(username);
        if (!targetUserInfo) {
            return res.status(404).json({ error: "User not found", status: "error" });
        }

        // Determine location and role
        let location = facilityCode || subCounty || county;
        let normalizedRole = role ? String(role).toUpperCase() : null;

        // Validate role if provided
        if (normalizedRole && !validateRole(normalizedRole, allowedRoles)) {
            return res.status(400).json({ status: "error", error: `Invalid role ${normalizedRole} provided. Supported roles: ${allowedRoles.join(",")}` });
        }

        // Validate location for role if both are provided
        if (location && normalizedRole) {
            const locationValidation = await validateLocationForRole(normalizedRole, location);
            if (!locationValidation.isValid) {
                return res.status(400).json({ status: "error", error: locationValidation.error });
            }
        }

        // Build userInfo object with firstName/lastName if provided
        let userInfo: any = null;
        if (firstName !== undefined || lastName !== undefined) {
            userInfo = {};
            if (firstName !== undefined) userInfo.firstName = firstName;
            if (lastName !== undefined) userInfo.lastName = lastName;
        }

        // Update user profile in Keycloak
        await updateUserProfile(username, phone, email, null, userInfo);

        // Get updated user info
        let updatedUserInfo = await findKeycloakUser(username);
        let locationInfo;
        const practitionerId = updatedUserInfo?.attributes?.fhirPractitionerId?.[0] ?? updatedUserInfo?.id;

        if (updatedUserInfo?.attributes?.fhirPractitionerId?.[0] || updatedUserInfo?.id) {
            let practitioner = await (await FhirApi({ url: `/Practitioner/${practitionerId}` })).data;
            const currentAssignment = await resolvePractitionerAssignment(practitionerId, practitioner);
            const effectiveRole = normalizedRole ?? currentAssignment?.role ?? getRoleFromPractitioner(practitioner) ?? "ADMINISTRATOR";

            if (location) {
                const fhirLocation = await (await FhirApi({ url: `/Location/${location}` })).data;
                practitioner = await updatePractitionerLocation(
                    {
                        ...updatedUserInfo,
                        attributes: {
                            ...updatedUserInfo.attributes,
                            fhirPractitionerId: [practitionerId],
                            practitionerRole: [effectiveRole],
                        },
                    },
                    practitioner,
                    fhirLocation,
                    effectiveRole,
                );
                locationInfo = await buildLocationInfo(fhirLocation, heirachy);
            } else if (normalizedRole) {
                const currentLocationRef =
                    currentAssignment?.locationReference ??
                    getLocationFromPractitioner(practitioner).reference ??
                    "Location/0";
                const currentLocationId = currentLocationRef.replace(/^Location\//, "");
                const fhirLocation = await (await FhirApi({ url: `/Location/${currentLocationId}` })).data;

                await syncPractitionerRoleAndExtensions(
                    practitionerId,
                    effectiveRole,
                    {
                        id: currentLocationId,
                        name: fhirLocation?.name ?? currentAssignment?.locationDisplay ?? undefined,
                    },
                    {
                        assignedByPractitionerId: currentUserInfo.id,
                        practitioner,
                    },
                );
                locationInfo = fhirLocation
                    ? await buildLocationInfo(fhirLocation, heirachy)
                    : undefined;
            }

            if (normalizedRole) {
                await setKeycloakUserAttributes(
                    updatedUserInfo.id,
                    providerRoleKeycloakAttributes(practitionerId, effectiveRole),
                );
                updatedUserInfo = await findKeycloakUser(username);
            }
        }

        // Handle practitioner name updates if firstName/lastName were provided
        if (updatedUserInfo?.attributes?.fhirPractitionerId?.[0] && (firstName !== undefined || lastName !== undefined)) {
            try {
                let practitioner = await (await FhirApi({ url: `/Practitioner/${updatedUserInfo.attributes.fhirPractitionerId[0]}` })).data;
                
                // Update practitioner name while preserving all other fields
                const updatedName = {
                    "use": "official",
                    "family": lastName !== undefined ? lastName : practitioner.name[0].family,
                    "given": [firstName !== undefined ? firstName : practitioner.name[0].given[0]]
                };

                // Update practitioner with new name, preserving extension, meta, and all other fields
                await (await FhirApi({
                    url: `/Practitioner/${updatedUserInfo.attributes.fhirPractitionerId[0]}`,
                    method: "PUT",
                    data: JSON.stringify({
                        ...practitioner,
                        name: [updatedName]
                    })
                })).data;
            } catch (error) {
                console.error(`Failed to update FHIR Practitioner name for ${username}:`, error);
                // Don't fail the entire request if FHIR update fails
            }
        }

        // Build response based on whether it's provider or client user
        if (updatedUserInfo?.attributes?.fhirPractitionerId?.[0]) {
            // Provider user response
            const response = buildUserResponse(updatedUserInfo, currentUser, locationInfo);
            return res.status(200).json(response);
        } else {
            // Client user response (simplified)
            return res.status(200).json({
                status: "success",
                user: {
                    firstName: updatedUserInfo.firstName,
                    lastName: updatedUserInfo.lastName,
                    fhirPatientId: updatedUserInfo.attributes?.fhirPatientId?.[0],
                    id: updatedUserInfo.id,
                    idNumber: updatedUserInfo.username,
                    fullNames: currentUser.name,
                    phone: updatedUserInfo.attributes?.phone?.[0] || null,
                    email: updatedUserInfo.email || null
                }
            });
        }

    } catch (error) {
        console.error('PUT /users/:username error:', error);
        return res.status(500).json({ error: "Internal server error", status: "error" });
    }
});

router.patch("/users/:username/notifications-enabled", authenticateUser, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;
        const { username } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== "boolean") {
            return res.status(400).json({ error: "enabled must be a boolean", status: "error" });
        }

        const currentUserInfo = await findKeycloakUser(currentUser.preferred_username);
        if (!currentUserInfo?.id) {
            return res.status(403).json({ error: "User not found", status: "error" });
        }

        const currentPractitioner = await (await FhirApi({ url: `/Practitioner/${currentUserInfo.id}` })).data;
        const currentUserRole = currentPractitioner?.extension?.length > 0
            ? currentPractitioner.extension[1]?.valueString
            : "ADMINISTRATOR";

        if (currentUserRole !== "ADMINISTRATOR" && currentUserRole !== "SUPERUSER") {
            return res.status(403).json({
                error: "Unauthorized access. Only administrators can update notification settings.",
                status: "error",
            });
        }

        const targetUser = await findKeycloakUser(username);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found", status: "error" });
        }

        const updated = await setKeycloakUserAttributes(targetUser.id, {
            notificationsEnabled: [String(enabled)],
        });
        if (!updated) {
            return res.status(500).json({
                error: "Failed to update notification settings",
                status: "error",
            });
        }

        const updatedUser = await findKeycloakUser(username);
        return res.status(200).json({
            status: "success",
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email ?? null,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                notificationsEnabled: updatedUser.attributes?.notificationsEnabled?.[0] === "true",
            },
        });
    } catch (error) {
        console.error("PATCH /users/:username/notifications-enabled error:", error);
        return res.status(500).json({ error: "Internal server error", status: "error" });
    }
});

router.delete("/users/:username", authenticateUser, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;
        const { username } = req.params;

        // Get current user info to check permissions
        let currentUserInfo = await findKeycloakUser(currentUser.preferred_username);
        if (!currentUserInfo?.id) {
            return res.status(403).json({ error: "User not found", status: "error" });
        }

        const currentPractitioner = await (await FhirApi({ url: `/Practitioner/${currentUserInfo.id}` })).data;
        const currentUserRole = currentPractitioner?.extension?.length > 0 ?
            currentPractitioner.extension[1]?.valueString : "ADMINISTRATOR";

        // Authorization check: Only administrators can delete users
        if (currentUserRole !== "ADMINISTRATOR" && currentUserRole !== "SUPERUSER") {
            return res.status(403).json({ error: "Unauthorized access. Only administrators can delete users.", status: "error" });
        }

        // Prevent self-deletion
        if (currentUser.preferred_username === username) {
            return res.status(400).json({ error: "Cannot delete your own account", status: "error" });
        }

        // Get target user info
        let targetUserInfo = await findKeycloakUser(username);
        if (!targetUserInfo) {
            return res.status(404).json({ error: "User not found", status: "error" });
        }

        // Delete PractitionerRole and Practitioner from FHIR if they exist
        if (targetUserInfo.id) {
            try {
                await deletePractitionerRoleResource(targetUserInfo.id);
            } catch (fhirError) {
                console.error(`Error deleting PractitionerRole from FHIR:`, fhirError);
            }

            try {
                const deletePractitionerResponse = await FhirApi({
                    url: `/Practitioner/${targetUserInfo.id}`,
                    method: "DELETE"
                });
                
                const statusCode = Number(deletePractitionerResponse.status);
                if (statusCode >= 200 && statusCode < 300) {
                    console.log(`Successfully deleted practitioner ${targetUserInfo.id} from FHIR`);
                } else {
                    console.log(`Practitioner ${targetUserInfo.id} may not exist in FHIR or already deleted`);
                }
            } catch (fhirError) {
                // Log but don't fail the entire operation if FHIR deletion fails
                console.error(`Error deleting practitioner from FHIR:`, fhirError);
            }
        }

        // Delete user from Keycloak
        const deleteResult = await deleteKeycloakUser(username);
        
        if (!deleteResult.success) {
            return res.status(400).json({ 
                error: deleteResult.error || "Failed to delete user from Keycloak", 
                status: "error" 
            });
        }

        return res.status(200).json({ 
            status: "success", 
            message: "User deleted successfully",
            deletedUser: {
                username,
                id: targetUserInfo.id
            }
        });

    } catch (error) {
        console.error('DELETE /users/:username error:', error);
        return res.status(500).json({ error: "Internal server error", status: "error" });
    }
});

router.get("/superset-token", authenticateUser, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as any).user;

        let token = await getSupersetGuestToken();
        res.statusCode = 200;
        res.json({ token, status: "success" });
        return;
    } catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Failed to get superset guest token", status: "error" });
        return;
    }
});


export default router
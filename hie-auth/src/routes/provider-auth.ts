import express, { Request, Response } from "express";
import { FhirApi, validateRole, validateLocationForRole, updatePractitionerLocation, buildLocationInfo, buildUserResponse } from "../lib/utils";
import { deleteResetCode, findKeycloakUser, getKeycloakUserToken, getKeycloakUsers, registerKeycloakUser, updateUserPassword, updateUserProfile, validateResetCode, refreshToken, deleteKeycloakUser } from './../lib/keycloak'
import { authenticateUser } from "../lib/middleware";
import { sendPasswordResetEmail, sendRegistrationConfirmationEmail } from "../lib/email";
import { getSupersetGuestToken } from "../lib/superset";

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


const roleToHeirachy = {
    "ADMINISTRATOR": "COUNTRY",
    "SUPERUSER": "COUNTRY",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER": "COUNTY",
    // "SUB_COUNTY_SYSTEM_ADMINISTRATOR": "SUB-COUNTY", 
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER": "SUB-COUNTY",
    // "FACILITY_SYSTEM_ADMINISTRATOR": "FACILITY",
    "FACILITY_SURVEILLANCE_FOCAL_PERSON": "FACILITY",
    "SUPERVISORS": "FACILITY",
    "VACCINATORS": "FACILITY"
}


// Optimized password generation with cached character set
const PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
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

        return res.status(200).json({ ...token, status: "success" });
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

        // Early return for ADMINISTRATOR role - no location processing needed
        const practitionerRole = practitioner?.extension?.length > 0 ?
            practitioner.extension[1]?.valueString : "ADMINISTRATOR";

        // For non-ADMINISTRATOR roles, build location info efficiently
        let locationInfo = {
            facility: "", facilityName: "", ward: "", wardName: "",
            subCounty: "", subCountyName: "", county: "", countyName: "", country: "", countryName: ""
        };

        if (practitioner?.extension?.length > 0) {
            const locationReference = practitioner.extension[0].valueReference.reference;

            // Fetch initial location
            const fhirLocation = await (await FhirApi({ url: `/${locationReference}` })).data;
            const locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;

            if (locationType && fhirLocation) {
                // Use the optimized buildLocationInfo utility function
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
        let { idNumber, password, resetCode } = req.body;
        let resetResp = await validateResetCode(idNumber, resetCode)
        if (!resetResp) {
            return res.status(401).json({ error: "Failed to update new password. Try again", status: "error" });
        }
        let resp = await updateUserPassword(idNumber, password);
        deleteResetCode(idNumber);
        if (!resp) {
            return res.status(401).json({ error: "Failed to update new password. Try again", status: "error" });
        }
        return res.status(200).json({ response: "Password updated successfully", status: "success" });
    } catch (error) {
        console.error(error);
        return res.status(401).json({ error: "Invalid Bearer token provided", status: "error" });
    }
});


router.get('/reset-password', async (req: Request, res: Response) => {
    try {
        let { idNumber, email } = req.query;
        // console.log(encodeURIComponent(String(email)))
        let userInfo = await findKeycloakUser(String(idNumber));
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

        // Fetch users with error handling
        const users = await getKeycloakUsers();
        if (!users) {
            return res.status(500).json({ error: "Failed to retrieve users from Keycloak", status: "error" });
        }
        const response = [];
        for(let user of users){
            if(!user.id){
                continue;
            }
            const practitioner = await (await FhirApi({ url: `/Practitioner/${user.id}` })).data;
            const role = practitioner?.extension?.length > 0 ?
                practitioner.extension[1]?.valueString : "ADMINISTRATOR";
            user.role = role;
            response.push({...user, role});
        }

        return res.status(200).json({
            users,
            total: users.length,
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
        let { phone, email, facilityCode, county, subCounty, role } = req.body;

       
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

        // Update user profile
        await updateUserProfile(username, phone, email, null, normalizedRole);

        // Get updated user info
        let updatedUserInfo = await findKeycloakUser(username);
        let locationInfo;

        // Handle practitioner location updates if applicable
        if (updatedUserInfo?.attributes?.fhirPractitionerId?.[0] && location) {
            let practitioner = await (await FhirApi({ url: `/Practitioner/${updatedUserInfo.attributes.fhirPractitionerId[0]}` })).data;

            // Get FHIR location
            let fhirLocation = await (await FhirApi({ url: `/Location/${location}` })).data;

            // Update practitioner location
            practitioner = await updatePractitionerLocation(updatedUserInfo, practitioner, fhirLocation);
            locationInfo = await buildLocationInfo(fhirLocation, heirachy);
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

        // Delete practitioner from FHIR if exists
        if (targetUserInfo.id) {
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
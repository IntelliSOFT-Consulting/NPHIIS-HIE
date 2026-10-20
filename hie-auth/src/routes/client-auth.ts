import express, { Request, Response } from "express";
import { FhirApi  } from "../lib/utils";
import { getKeycloakUserToken, registerKeycloakUser, getCurrentUserInfo, findKeycloakUser, updateUserProfile, deleteResetCode, updateUserPassword, validateResetCode } from './../lib/keycloak'
import { sendPasswordResetEmail } from "../lib/email";
import { handleResetRequest } from "../lib/password-reset-request";

const router = express.Router();
router.use(express.json());

/**
 * Patient self-registration. Off unless CLIENT_SELF_REGISTRATION_ENABLED=true.
 * The patient must be found by ID number AND carry the secret code as one of
 * their identifiers.
 */
router.post("/register", async (req: Request, res: Response) => {
    if (process.env.CLIENT_SELF_REGISTRATION_ENABLED !== "true") {
        return res.status(404).json({ status: "error", error: "Not found" });
    }
    try {
        // get id number and the unique secret code
        let {secretCode, idNumber, password, email, phone} = req.body;
        if(!password || !idNumber || !secretCode) {
            res.statusCode = 400;
            res.json({ status: "error", error: "secretCode, idNumber and password are required" });
            return;
        }
        idNumber = String(idNumber).trim();
        secretCode = String(secretCode).trim();
        // Look up by ID number only. (A comma in a FHIR search means OR, so the
        // old `identifier=<code>,<id>` matched on the ID number alone.)
        let response: any = await FhirApi({url:`/Patient?identifier=${encodeURIComponent(idNumber)}`});
        const entries: any[] = response.data?.entry ?? [];
        const patient = entries.length === 1 ? entries[0].resource : null;
        const hasCode = (patient?.identifier ?? []).some((i: any) => String(i?.value ?? '') === secretCode);
        if(patient && hasCode){
            // register patient/client user on Keycloak
            let keycloakUser = await registerKeycloakUser(idNumber, email, phone, patient.name[0].family, patient.name[0].given.join(' '), password, patient.id);
            if(!keycloakUser){
                res.statusCode = 400;
                res.json({ status: "error", error: "Failed to register client user" });
                return;
            }
            if (Object.keys(keycloakUser).indexOf('error') > -1){
                res.statusCode = 400;
                res.json( {...keycloakUser, status:"error"} );
                return;
            }
            res.statusCode = 201;
            res.json({ response:keycloakUser.success, status:"success" });
            return;
        }else{
            let error = "Could not register user. Invalid Secret Code or ID number provided." 
            console.log(error);
            res.statusCode = 401;
            res.json({ error: error, status:"error" });
            return;
        }
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status:"error" });
        return;
    }
});

router.post("/login", async (req: Request, res: Response) => {
    try {
        let {idNumber, password} = req.body;
        let token = await getKeycloakUserToken(idNumber, password);
        let user = await getCurrentUserInfo(token.access_token);
        let userInfo = await findKeycloakUser(user.preferred_username);

        console.log(userInfo)

        let practitioner = await (await FhirApi({ url: `/Practitioner/${userInfo?.id}` })).data;


        let isPractitioner = practitioner.resourceType === "Practitioner";
        if(!isPractitioner){
            res.statusCode = 401;
            res.json({ status: "error", error:"Unauthorized client login." });
            return;
        }


        
        if(!token){
            res.statusCode = 401;
            res.json({ status: "error", error:"Incorrect ID Number or Password provided" });
            return;
        }
        if (Object.keys(token).indexOf('error') > -1){
            res.statusCode = 401;
            res.json({status:"error", error: `${token.error} - ${token.error_description}`})
            return;
        }
        res.statusCode = 200;
        res.json({ ...token, status: "success" });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status:"error" });
        return;
    }
});


router.get("/me", async (req: Request, res: Response) => {
    try {
        const accessToken = req.headers.authorization?.split(' ')[1] || null;
        if(!accessToken || req.headers.authorization?.split(' ')[0] != "Bearer"){
            res.statusCode = 401;
            res.json({ status: "error", error:"Bearer token is required but not provided" });
            return;
        }
        let currentUser = await getCurrentUserInfo(accessToken);
        console.log(currentUser);
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        console.log(userInfo)
        if(!currentUser){
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided"  });
            return;
        }
        res.statusCode = 200;
        res.json({ status: "success", user:{ firstName: userInfo.firstName,lastName: userInfo.lastName,
            fhirPatientId:userInfo.attributes.fhirPatientId[0], 
            id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name,
            phone: (userInfo.attributes?.phone ? userInfo.attributes?.phone[0] : null) , email: userInfo.email ?? null
        }});
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status:"error" });
        return;
    }
});

// Note: POST /me functionality has been moved to PUT /users/{username} in provider-auth.ts
// This endpoint is kept for backward compatibility but should be considered deprecated
router.post("/me", async (req: Request, res: Response) => {
    try {
        const accessToken = req.headers.authorization?.split(' ')[1] || null;
        if(!accessToken || req.headers.authorization?.split(' ')[0] != "Bearer"){
            res.statusCode = 401;
            res.json({ status: "error", error:"Bearer token is required but not provided" });
            return;
        }
        // allow phone number & email
        let {phone, email} = req.body;
        let currentUser = await getCurrentUserInfo(accessToken);
        console.log(currentUser);
        await updateUserProfile(currentUser.preferred_username, phone, email, null, null);
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        if(!currentUser){
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided"  });
            return;
        }
        res.statusCode = 200;
        res.json({ status: "success", user:{ firstName: userInfo.firstName,lastName: userInfo.lastName,
            fhirPatientId:userInfo.attributes.fhirPatientId[0], 
            id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name,
            phone: (userInfo.attributes?.phone ? userInfo.attributes?.phone[0] : null) , email: userInfo.email ?? null
        }});
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status:"error" });
        return;
    }
});


router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        let {idNumber, password, resetCode} = req.body;
        let resetResp = await validateResetCode(idNumber, resetCode)
        if (!resetResp){
            res.statusCode = 401;
            res.json({ error: "Failed to update new password. Try again", status:"error" });
            return;
        }
        let resp = await updateUserPassword(idNumber, password);
        if(!resp){
            res.statusCode = 401;
            res.json({ error: "Failed to update new password. Try again", status:"error" });
            return;
        }
        // Only delete reset code after successful password update
        await deleteResetCode(idNumber);
        res.statusCode = 200;
        res.json({ response: "Password updated successfully", status:"success" });
        return;
    } catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status:"error" });
        return;
    }
});


router.get('/reset-password', handleResetRequest);


export default router
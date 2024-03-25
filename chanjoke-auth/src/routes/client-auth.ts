import express, { Request, Response } from "express";
import { FhirApi  } from "../lib/utils";
import { getKeycloakUserToken, registerKeycloakUser, getCurrentUserInfo, findKeycloakUser, updateUserProfile, deleteResetCode, updateUserPassword, validateResetCode } from './../lib/keycloak'
import { sendPasswordResetEmail } from "../lib/email";

const router = express.Router();
router.use(express.json());

router.post("/register", async (req: Request, res: Response) => {
    try {
        // get id number and the unique secret code
        let {secretCode, idNumber, password, email, phone} = req.body;
        if(!password || !idNumber || !secretCode) {
            res.statusCode = 400;
            res.json({ status: "error", error: "secretCode, idNumber and password are required" });
            return;
        }
        let response: any = await FhirApi({url:`/Patient?identifier=${secretCode},${idNumber}`});
        if(response.data?.entry || response.data?.count){ // Patient is found
            let patient = response.data.entry[0].resource;
            console.log(patient);
            // register patient/client user on Keycloak
            let keycloakUser = await registerKeycloakUser(idNumber, email, phone, patient.name[0].family, patient.name[0].given[0], password, patient.id, null, null);
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
        await updateUserProfile(currentUser.preferred_username, phone, email, null);
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
        let resp = updateUserPassword(idNumber, password);
        deleteResetCode(idNumber);
        if(!resp){
            res.statusCode = 401;
            res.json({ error: "Failed to update new password. Try again", status:"error" });
            return;
        }
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


router.get('/reset-password', async (req: Request, res: Response) => {
    try {
        let {idNumber, email} = req.query;
        let userInfo = await findKeycloakUser(String(idNumber));
        if (userInfo.email !== email){
            res.statusCode = 400;
            res.json({status:"error", error:"Failed to initiate password reset. Invalid account details."})
            return; 
        }
        idNumber = String(idNumber);
        let resp = await sendPasswordResetEmail(idNumber);
        if (!resp){
            res.statusCode = 400;
            res.json({status:"error", error:"Failed to initiate password reset. Try again."})
            return;
        }
        res.statusCode = 200;
        res.json({status:"success", response:"Check your email for the password reset code sent."})
        return;
    } catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Failed to initiate password reset", status:"error" });
        return;
    }
});


export default router
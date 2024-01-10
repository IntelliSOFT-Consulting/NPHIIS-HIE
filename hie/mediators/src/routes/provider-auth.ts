import express, { Request, response, Response } from "express";
import { createClient, FhirApi, getOpenHIMToken, installChannels } from "../lib/utils";
import { findKeycloakUser, getCurrentUserInfo, getKeycloakUserToken, registerKeycloakUser } from './../lib/keycloak'
import { v4 } from "uuid";

const router = express.Router();
router.use(express.json());

router.post("/register", async (req: Request, res: Response) => {
    try {
        // get id number and unique code
        let {firstName, lastName, idNumber, password, role} = req.body;
        console.log(req.body);
        if(!password || !idNumber || !firstName || !lastName || !role ) {
            res.statusCode = 400;
            res.json({ status: "error", error: "password, idNumber, firstName, lastName and role are required" });
            return;
        }
        let practitionerId = v4();
        console.log(practitionerId);
        let practitionerResource = {
            "resourceType": "Practitioner",
            "id": practitionerId,
            "identifier": [
              {
                "system": "http://hl7.org/fhir/administrative-identifier",
                "value": idNumber
              }
            ],
            "name": [{"use": "official","family": lastName, "given": [firstName]}],
            // "telecom": [{"system": "phone","value": "123-456-7890"}]
        };
        let keycloakUser = await registerKeycloakUser(idNumber, firstName, 
                    lastName, password, null, practitionerId, role);
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
        let practitioner = (await FhirApi({url:`/Practitioner/${practitionerId}`, method:"PUT", data: JSON.stringify(practitionerResource)})).data;
        console.log(practitioner)
        res.statusCode = 201;
        res.json({ response:keycloakUser.success, status:"success" });
        return;
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
        let userInfo = await findKeycloakUser(currentUser.preferred_username)
        console.log(userInfo)
        if(!currentUser){
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided"  });
            return;
        }
        res.statusCode = 200;
        res.json({ status: "success", user:{ firstName: userInfo.firstName,lastName: userInfo.lastName,
            fhirPractitionerId:userInfo.attributes.fhirPractitionerId[0], 
            practitionerRole: userInfo.attributes.practitionerRole[0],
            id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name   
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

export default router
import express, { Request, Response } from "express";
import { FhirApi } from "../lib/utils";
import { deleteResetCode, findKeycloakUser, getCurrentUserInfo, getKeycloakUserToken, registerKeycloakUser, updateUserPassword, updateUserProfile, validateResetCode } from './../lib/keycloak'
import { v4 } from "uuid";
import { sendPasswordResetEmail } from "../lib/email";
import { count } from "console";
import { extension } from "mime-types";

const router = express.Router();
router.use(express.json());

router.post("/register", async (req: Request, res: Response) => {
    try {
        // get id number and unique code
        let {firstName, lastName, idNumber, password, role, email, phone, facility } = req.body;
        console.log(req.body);
        if(!password || !idNumber || !firstName || !lastName || !role || !email ) {
            res.statusCode = 400;
            res.json({ status: "error", error: "password, idNumber, firstName, lastName, email and role are required" });
            return;
        }
        let practitionerId = v4();
        let location = await (await FhirApi({url:`/Location/${facility}`})).data;
        console.log(location)
        if(location.resourceType != "Location"){
            res.statusCode = 400;
            res.json({ status: "error", error: "Failed to register client user. Invalid location provided" });
            return;
        }
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
            "extension": [
                {
                  "url": "http://example.org/location",
                  "valueReference": {
                    "reference": `Location/${location.id}`,
                    "display": location.name
                  }
                }
              ]
            // "telecom": [{"system": "phone","value": "123-456-7890"}]
        };
        let keycloakUser = await registerKeycloakUser(idNumber, email, phone, firstName, 
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
        if(!currentUser){
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided"  });
            return;
        }
        let userInfo = await findKeycloakUser(currentUser.preferred_username)
        let practitioner = await (await FhirApi({url:`/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}`})).data;
        let facilityId = practitioner.extension[0].valueReference.reference;
        let facility = await (await FhirApi({url:`/${facilityId}`})).data;
        let ward = await (await FhirApi({url:`/${facility.partOf.reference}`})).data;
        let subCounty = await (await FhirApi({url:`/${ward.partOf.reference}`})).data;
        let county = await (await FhirApi({url:`/${subCounty.partOf.reference}`})).data;
        console.log(practitioner.extension[0].valueReference.reference, facilityId);
        if(practitioner.extension[0].valueReference.reference !== facilityId){
        let newLocation =  [{"url": "http://example.org/location","valueReference": {"reference": `Location/${facility.id}`,"display": facility.name}}]
        practitioner = await (await FhirApi({url:`/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}`, 
            method:"PUT", data: JSON.stringify({...practitioner, extension: newLocation})})).data;
        }
        res.statusCode = 200;
        res.json({ status: "success", user:{ firstName: userInfo.firstName,lastName: userInfo.lastName,
            fhirPractitionerId:userInfo.attributes.fhirPractitionerId[0], 
            practitionerRole: userInfo.attributes.practitionerRole[0],
            id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name,
            phone: (userInfo.attributes?.phone ? userInfo.attributes?.phone[0] : null) , email: userInfo.email ?? null,
            facility: facilityId, facilityName: facility.name, ward: "Location/" + ward.id, wardName: ward.name,
            subCounty: "Location/" + subCounty.id, subCountyName: subCounty.name, county: "Location/" + county.id, countyName: county.name
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
        let {phone, email, facilityCode} = req.body;
        let currentUser = await getCurrentUserInfo(accessToken);
        if(!currentUser){
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided"  });
            return;
        }
        let response = await updateUserProfile(currentUser.preferred_username, phone, email, null);
        // console.log(response);
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        let practitioner = await (await FhirApi({url:`/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}`})).data;

        
        if(facilityCode){
            let facility = await (await FhirApi({url:`/Location/${facilityCode}`})).data;
            console.log(facility);
            let newLocation =  [{"url": "http://example.org/location","valueReference": {"reference": `Location/${facility.id}`,"display": facility.name}}]
            practitioner = await (await FhirApi({url:`/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}`, 
            method:"PUT", data: JSON.stringify({...practitioner, extension: newLocation})})).data;
            // console.log(practitioner);
        }
        // console.log(practitioner.extension);
        let facilityId = practitioner.extension[0].valueReference.reference ?? null;
        // if(!facilityId && userInfo.attributes.practitionerRole[0]){
        //     res.statusCode = 401;
        //     res.json({ status: "error", error: "Provide must be assigned to a facility first"  });
        //     return;
        // }
        let facility = await (await FhirApi({url:`/${facilityId}`})).data;
        let ward = await (await FhirApi({url:`/${facility.partOf.reference}`})).data;
        let subCounty = await (await FhirApi({url:`/${ward.partOf.reference}`})).data;
        let county = await (await FhirApi({url:`/${subCounty.partOf.reference}`})).data;
        res.statusCode = 200;
        res.json({ status: "success", user:{ firstName: userInfo.firstName,lastName: userInfo.lastName,
            fhirPractitionerId:userInfo.attributes.fhirPractitionerId[0], 
            practitionerRole: userInfo.attributes.practitionerRole[0],
            id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name,
            phone: (userInfo.attributes?.phone ? userInfo.attributes?.phone[0] : null) , email: userInfo.email ?? null,
            facility: facilityId, facilityName: facility.name, ward: "Location/" + ward.id, wardName: ward.name,
            subCounty: "Location/" + subCounty.id, subCountyName: subCounty.name, county: "Location/" + county.id, countyName: county.name 
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
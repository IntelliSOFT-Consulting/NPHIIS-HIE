import express, { Request, Response } from "express";
import { FhirApi } from "../lib/utils";
import { deleteResetCode, findKeycloakUser, getCurrentUserInfo, getKeycloakUserToken, getKeycloakUsers, registerKeycloakUser, updateUserPassword, updateUserProfile, validateResetCode, refreshToken } from './../lib/keycloak'
import { v4 } from "uuid";
import { sendPasswordResetEmail, sendRegistrationConfirmationEmail } from "../lib/email";
import { getSupersetGuestToken } from "../lib/superset";

const router = express.Router();
router.use(express.json());

const allowedRoles = [
    "ADMINISTRATOR", "NATIONAL_SYSTEM_ADMINISTRATOR", "COUNTY_SYSTEM_ADMINISTRATOR",
    "SUB_COUNTY_SYSTEM_ADMINISTRATOR", "SUB_COUNTY_STORE_MANAGER", "FACILITY_SYSTEM_ADMINISTRATOR", "FACILITY_STORE_MANAGER", "CLERK", "NURSE"];

const heirachy = [
    { country: "COUNTRY" },
    { county: "COUNTY" },
    { subCounty: "SUB-COUNTY" },
    { ward: "WARD" },
    { facility: "FACILITY" }
]

const generatePassword = (length: number) =>
    Array.from({ length }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-='.charAt(Math.floor(Math.random() * 94))).join('');

router.post("/register", async (req: Request, res: Response) => {
    try {
        // get id number and unique code
        let { firstName, lastName, idNumber, password, role, email, phone, facility } = req.body;
        if (!password) {
            password = generatePassword(12);
        }

        role = String(role).toUpperCase();

        if (allowedRoles.indexOf(role) < 0) {
            res.statusCode = 400;
            res.json({ status: "error", error: `invalid role provided. Allowed roles: ${allowedRoles.join(",")}` });
            return;
        }
        console.log(req.body);
        if (!idNumber || !firstName || !lastName || !role || !email) {

        }
        let practitionerId = v4();
        let location = await (await FhirApi({ url: `/Location/${facility || '0'}` })).data;
        console.log(location);
        if (role !== "ADMINISTRATOR" && location.resourceType !== "Location") {
            res.statusCode = 400;
            res.json({ status: "error", error: "Failed to register client user. Invalid location provided" });
            return;
        }
        console.log(practitionerId);
        let practitionerResource = {
            "resourceType": "Practitioner",
            "meta": { "tag": [{ "system": "http://example.org/fhir/StructureDefinition/location", "code": `Location/${location.id}` }] },
            "id": practitionerId,
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
            // "telecom": [{"system": "phone","value": "123-456-7890"}]
        };
        let keycloakUser = await registerKeycloakUser(idNumber, email, phone, firstName,
            lastName, password, null, practitionerId, role);
        if (!keycloakUser) {
            res.statusCode = 400;
            res.json({ status: "error", error: "Failed to register client user" });
            return;
        }
        if (Object.keys(keycloakUser).indexOf('error') > -1) {
            res.statusCode = 400;
            res.json({ ...keycloakUser, status: "error" });
            return;
        }
        let practitioner = (await FhirApi({ url: `/Practitioner/${practitionerId}`, method: "PUT", data: JSON.stringify(practitionerResource) })).data;
        console.log(practitioner);
        sendRegistrationConfirmationEmail(email, password, idNumber);
        res.statusCode = 201;
        res.json({ response: keycloakUser.success, status: "success" });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status: "error" });
        return;
    }
});

router.post("/login", async (req: Request, res: Response) => {
    try {
        let { idNumber, password } = req.body;
        let token = await getKeycloakUserToken(idNumber, password);
        if (!token) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Incorrect ID Number or Password provided" });
            return;
        }
        if (Object.keys(token).indexOf('error') > -1) {
            res.statusCode = 401;
            res.json({ status: "error", error: `${token.error} - ${token.error_description}` })
            return;
        }

        let userInfo = await findKeycloakUser(idNumber);
        if (!userInfo) {
            res.statusCode = 401;
            res.json({ status: "error", error: "User not found" });
            return;
        }
        let practitioner = await (await FhirApi({ url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}` })).data;

        if (!practitioner || !practitioner.active) {
            res.statusCode = 401;
            res.json({ status: "error", error: "User not found or not active" });
            return;
        }

        res.statusCode = 200;
        res.json({ ...token, status: "success" });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status: "error" });
        return;
    }
});

router.post("/refresh_token", async (req: Request, res: Response) => {
    try {
        let { refresh_token } = req.body;
        let token = await refreshToken(refresh_token);
        if (!token) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid refresh token provided" });
            return;
        }
        res.statusCode = 200;
        res.json({ ...token, status: "success" });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "Invalid refresh token provided", status: "error" });
        return;
    }
});

router.get("/me", async (req: Request, res: Response) => {
    try {
        const accessToken = req.headers.authorization?.split(' ')[1] || null;
        if (!accessToken || req.headers.authorization?.split(' ')[0] != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        let currentUser = await getCurrentUserInfo(accessToken);
        if (!currentUser) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided" });
            return;
        }
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        let practitioner = await (await FhirApi({ url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}` })).data;
        let locationInfo = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };
        if (userInfo.attributes.practitionerRole[0] !== "ADMINISTRATOR") {
            let fhirLocation = practitioner.extension[0].valueReference.reference;
            fhirLocation = await (await FhirApi({ url: `/${fhirLocation}` })).data;
            let locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;
            let root;
            for (let location of heirachy) {
                let l: any = location
                if (locationType === l[Object.keys(location)[0]]) {
                    // start here
                    root = locationType;
                }
            }

            let _locationInfo: any = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };
            let _locs = heirachy.map((x: any) => {
                return x[Object.keys(x)[0]]
            })
            let _locKeys = heirachy.map((x: any) => {
                return Object.keys(x)[0]
            })
            let indexOfRoot = _locs.indexOf(root);
            let previous = fhirLocation.id;
            for (let i of _locKeys.slice(0, indexOfRoot + 1).reverse()) {
                let _fhirlocation = await (await FhirApi({ url: `/Location/${previous}` })).data;
                _locationInfo[i] = _fhirlocation.id;
                _locationInfo[`${i}Name`] = _fhirlocation.name;
                if (_fhirlocation?.partOf) {
                    previous = (_fhirlocation?.partOf?.reference).split("/")[1];
                }
            }
            locationInfo = _locationInfo;

        }

        // console.log(practitioner.extension[0].valueReference.reference, facilityId);

        res.statusCode = 200;
        res.json({
            status: "success", user: {
                firstName: userInfo.firstName, lastName: userInfo.lastName,
                fhirPractitionerId: userInfo.attributes.fhirPractitionerId[0],
                practitionerRole: userInfo.attributes.practitionerRole[0],
                id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name,
                phone: (userInfo.attributes?.phone ? userInfo.attributes?.phone[0] : null), email: userInfo.email ?? null,
                ...locationInfo
            }
        });
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status: "error" });
        return;
    }
});

router.post("/me", async (req: Request, res: Response) => {
    try {
        const accessToken = req.headers.authorization?.split(' ')[1] || null;
        if (!accessToken || req.headers.authorization?.split(' ')[0] != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        let currentUser = await getCurrentUserInfo(accessToken);
        if (!currentUser) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided" });
            return;
        }
        // allow phone number & email
        let { phone, email, facilityCode, county, subCounty, role } = req.body;
        let location = county || subCounty || facilityCode;
        role = String(role).toUpperCase();
        if (allowedRoles.indexOf(role) < 0) {
            res.statusCode = 401;
            res.json({ status: "error", error: `Invalid role ${role} provided` });
            return;
        }
        let fhirLocation = await (await FhirApi({ url: `/Location/${location}` })).data;
        console.log(fhirLocation);
        let locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;
        console.log(locationType);

        switch (role) {
            case "ADMINISTRATOR" || "NATIONAL_SYSTEM_ADMINISTRATOR":
                location = null;
            case "SUB_COUNTY_SYSTEM_ADMINISTRATOR" || "SUB_COUNTY_STORE_MANAGER":
                console.log(locationType)
                if (String(locationType) !== String("SUB-COUNTY")) {
                    res.statusCode = 400;
                    res.json({ status: "error", error: `Invalid location provided for ${role}` });
                    return;
                }
                break;
            case "COUNTY_SYSTEM_ADMINISTRATOR":
                if (locationType !== "COUNTY") {
                    res.statusCode = 400;
                    res.json({ status: "error", error: `Invalid location provided for ${role}` });
                    return;
                }
                break;
            case "FACILITY_SYSTEM_ADMINISTRATOR" || "FACILITY_STORE_MANAGER" || "NURSE" || "CLERK":
                if (locationType !== "FACILITY") {
                    res.statusCode = 400;
                    res.json({ status: "error", error: `Invalid location provided for ${role}` });
                    return;
                }
                break;
        }

        let response = await updateUserProfile(currentUser.preferred_username, phone, email, null, role);
        // console.log(response);
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        let practitioner = await (await FhirApi({ url: `/Practitioner/${userInfo.attributes.fhirPractitionerId?.[0]}` })).data;


        if (location) {
            // let fhirLocation = await (await FhirApi({ url: `/Location/${location}` })).data;
            console.log(fhirLocation);
            // remove meta tag
            const meta = {
                resourceType: 'Parameters',
                parameter: [
                    {
                        name: 'meta',
                        valueMeta: {
                            tag: practitioner.meta.tag
                        },
                    },
                ],
            }

            await (await FhirApi({ url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}/$meta-delete`, method: "POST", data: JSON.stringify(meta) })).data;

            delete practitioner.meta;

            let newLocation = [
                { "url": "http://example.org/location", "valueReference": { "reference": `Location/${fhirLocation.id}`, "display": fhirLocation.name } },
                { "url": "http://example.org/fhir/StructureDefinition/role-group", "valueString": userInfo?.attributes?.practitionerRole[0] }
            ]
            practitioner = await (await FhirApi({
                url: `/Practitioner/${userInfo.attributes.fhirPractitionerId[0]}`,
                method: "PUT", data: JSON.stringify({
                    ...practitioner, extension: location ? newLocation : [
                        { "url": "http://example.org/fhir/StructureDefinition/role-group", "valueString": userInfo?.attributes?.practitionerRole[0] }
                    ],
                    meta: { tag: [{ system: "http://example.org/fhir/StructureDefinition/location", code: `Location/${fhirLocation.id}` }] }
                })
            })).data;
            // console.log(practitioner);
        }
        // console.log(practitioner.extension);
        let facilityId = practitioner.extension[0].valueReference.reference ?? null;

        let locationInfo = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };
        let assignedLocationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;
        let root;

        for (let location of heirachy) {
            let l: any = location
            if (assignedLocationType === l[Object.keys(location)[0]]) {
                // start here
                root = assignedLocationType;
            }
        }

        let _locationInfo: any = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };



        let _locs = heirachy.map((x: any) => {
            return x[Object.keys(x)[0]]
        })
        let _locKeys = heirachy.map((x: any) => {
            return Object.keys(x)[0]
        })
        let indexOfRoot = _locs.indexOf(root);
        let previous = fhirLocation.id;
        console.log("-----", root, indexOfRoot);
        for (let i of _locKeys.slice(0, indexOfRoot + 1).reverse()) {
            // console.log(i)
            let _fhirlocation = await (await FhirApi({ url: `/Location/${previous}` })).data;
            console.log(_fhirlocation);
            _locationInfo[i] = _fhirlocation.id;
            _locationInfo[`${i}Name`] = _fhirlocation.name;
            if (_fhirlocation?.partOf) {
                previous = (_fhirlocation?.partOf?.reference).split("/")[1];
            }
        }
        console.log(_locationInfo);
        if (userInfo.attributes.practitionerRole[0] !== "ADMINISTRATOR") {
            locationInfo = _locationInfo;
        }

        res.statusCode = 200;
        res.json({
            status: "success", user: {
                firstName: userInfo.firstName, lastName: userInfo.lastName,
                fhirPractitionerId: userInfo.attributes.fhirPractitionerId[0],
                practitionerRole: userInfo.attributes.practitionerRole[0],
                id: userInfo.id, idNumber: userInfo.username, fullNames: currentUser.name,
                phone: (userInfo.attributes?.phone ? userInfo.attributes?.phone[0] : null), email: userInfo.email ?? null,
                ...locationInfo
            }
        });
        return;
    }
    catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status: "error" });
        return;
    }
});

router.get("/user/:username", async (req: Request, res: Response) => {
    try {
        const username = req.params.username;
        const accessToken = req.headers.authorization?.split(' ')[1] || null;
        // only admin can view other users
        if (!accessToken || req.headers.authorization?.split(' ')[0] != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        let currentUser = await getCurrentUserInfo(accessToken);
        if (!currentUser) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided" });
            return;
        }
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        if (!userInfo.attributes?.practitionerRole[0].includes("ADMINISTRATOR")) {
            res.statusCode = 401;
            res.json({ error: "Unauthorized access", status: "error" });
            return;
        }
        let user = await findKeycloakUser(username);
        if (!user) {
            res.statusCode = 404;
            res.json({ status: "error", error: "User not found" });
            return;
        }
        let practitioner = await (await FhirApi({ url: `/Practitioner/${user.attributes.fhirPractitionerId[0]}` })).data;
        let locationInfo = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };
        if (user.attributes.practitionerRole[0] !== "ADMINISTRATOR") {
            let fhirLocation = practitioner.extension[0].valueReference.reference;
            fhirLocation = await (await FhirApi({ url: `/${fhirLocation}` })).data;
            let locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;
            let root;
            for (let location of heirachy) {
                let l: any = location
                if (locationType === l[Object.keys(location)[0]]) {
                    root = locationType;
                }
            }

            let _locationInfo: any = { facility: "", facilityName: "", ward: "", wardName: "", subCounty: "", subCountyName: "", county: "", countyName: "" };
            let _locs = heirachy.map((x: any) => {
                return x[Object.keys(x)[0]]
            })
            let _locKeys = heirachy.map((x: any) => {
                return Object.keys(x)[0]
            })
            let indexOfRoot = _locs.indexOf(root);
            let previous = fhirLocation.id;
            for (let i of _locKeys.slice(0, indexOfRoot + 1).reverse()) {
                let _fhirlocation = await (await FhirApi({ url: `/Location/${previous}` })).data;
                _locationInfo[i] = _fhirlocation.id;
                _locationInfo[`${i}Name`] = _fhirlocation.name;
                if (_fhirlocation?.partOf) {
                    previous = (_fhirlocation?.partOf?.reference).split("/")[1];
                }
            }
            locationInfo = _locationInfo;

        }
        res.statusCode = 200;
        res.json({
            status: "success", user: {
                firstName: practitioner.name[0].given[0] || user.firstName || user.attributes.firstName,
                lastName: practitioner.name[0].family || user.lastName || user.attributes.lastName,
                fhirPractitionerId: user.attributes.fhirPractitionerId[0],
                practitionerRole: user.attributes.practitionerRole[0],
                id: user.id, idNumber: user.username,
                fullNames: `${practitioner.name[0].given[0] || user.firstName || user.attributes.firstName} ${practitioner.name[0].family || user.lastName || user.attributes.lastName}`,
                phone: (user.attributes?.phone ? user.attributes?.phone[0] : null), email: user.email ?? null,
                ...locationInfo
            }
        });
        return;


    } catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error, status: "error" });
        return;
    }
});


router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        let { idNumber, password, resetCode } = req.body;
        let resetResp = await validateResetCode(idNumber, resetCode)
        if (!resetResp) {
            res.statusCode = 401;
            res.json({ error: "Failed to update new password. Try again", status: "error" });
            return;
        }
        let resp = updateUserPassword(idNumber, password);
        deleteResetCode(idNumber);
        if (!resp) {
            res.statusCode = 401;
            res.json({ error: "Failed to update new password. Try again", status: "error" });
            return;
        }
        res.statusCode = 200;
        res.json({ response: "Password updated successfully", status: "success" });
        return;
    } catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status: "error" });
        return;
    }
});


router.get('/reset-password', async (req: Request, res: Response) => {
    try {
        let { idNumber, email } = req.query;
        // console.log(encodeURIComponent(String(email)))
        let userInfo = await findKeycloakUser(String(idNumber));
        console.log(userInfo);
        if (userInfo.email.toLowerCase() !== String(email).toLowerCase()) {
            res.statusCode = 400;
            res.json({ status: "error", error: "Failed to initiate password reset. Invalid account details." })
            return;
        }
        idNumber = String(idNumber);
        let resp = await sendPasswordResetEmail(idNumber);
        if (!resp) {
            res.statusCode = 400;
            res.json({ status: "error", error: "Failed to initiate password reset. Try again." })
            return;
        }
        res.statusCode = 200;
        res.json({ status: "success", response: "Check your email for the password reset code sent." })
        return;
    } catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Failed to initiate password reset", status: "error" });
        return;
    }
});

router.get("/users", async (req: Request, res: Response) => {
    try {
        const accessToken = req.headers.authorization?.split(' ')[1] || null;
        if (!accessToken || req.headers.authorization?.split(' ')[0] != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        let currentUser = await getCurrentUserInfo(accessToken);
        if (!currentUser) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided" });
            return;
        }
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        // console.log(userInfo);
        if (!userInfo.attributes?.practitionerRole[0].includes("ADMINISTRATOR")) {
            res.statusCode = 401;
            res.json({ error: "Unauthorized access", status: "error" });
            return;
        }
        // if(userInfo.r)
        let users = await getKeycloakUsers();
        // console.log(users);
        res.statusCode = 200;
        res.json({ users, status: "success" });
        return;

    } catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error, status: "error" });
        return;
    }
})

router.put("/user/:username", async (req: Request, res: Response) => {
    try {
        const username = req.params.username;
        const accessToken = req.headers.authorization?.split(' ')[1] || null;
        if (!accessToken || req.headers.authorization?.split(' ')[0] != "Bearer") {
            res.statusCode = 401;
            res.json({ status: "error", error: "Bearer token is required but not provided" });
            return;
        }
        let currentUser = await getCurrentUserInfo(accessToken);
        if (!currentUser) {
            res.statusCode = 401;
            res.json({ status: "error", error: "Invalid Bearer token provided" });
            return;
        }
        let userInfo = await findKeycloakUser(currentUser.preferred_username);
        if (!userInfo.attributes?.practitionerRole[0].includes("ADMINISTRATOR")) {
            res.statusCode = 401;
            res.json({ error: "Unauthorized access", status: "error" });
            return;
        }
        let { phone, email, facilityCode, county, subCounty, role, idNumber } = req.body;
        let location = facilityCode || subCounty || county;
        role = String(role).toUpperCase();
        if (allowedRoles.indexOf(role) < 0) {
            res.statusCode = 401;
            res.json({ status: "error", error: `Invalid role ${role} provided` });
            return;
        }
        let fhirLocation = await (await FhirApi({ url: `/Location/${location}` })).data;
        let locationType = fhirLocation?.type?.[0]?.coding?.[0]?.code;
        switch (role) {
            case "ADMINISTRATOR" || "NATIONAL_SYSTEM_ADMINISTRATOR":
                location = null;
            case "SUB_COUNTY_SYSTEM_ADMINISTRATOR" || "SUB_COUNTY_STORE_MANAGER":
                if (String(locationType) !== String("SUB-COUNTY")) {
                    res.statusCode = 400;
                    res.json({ status: "error", error: `Invalid location provided for ${role}` });
                    return;
                }
                break;
            case "COUNTY_SYSTEM_ADMINISTRATOR":
                if (locationType !== "COUNTY") {
                    res.statusCode = 400;
                    res.json({ status: "error", error: `Invalid location provided for ${role}` });
                    return;
                }
                break;
            case "FACILITY_SYSTEM_ADMINISTRATOR" || "FACILITY_STORE_MANAGER" || "NURSE" || "CLERK":
                if (locationType !== "FACILITY") {
                    res.statusCode = 400;
                    res.json({ status: "error", error: `Invalid location provided for ${role}` });
                    return;
                }
                break;
        }
        let response = await updateUserProfile(idNumber, phone, email, null, role);
        let user = await findKeycloakUser(idNumber);
        let practitioner = await (await FhirApi({ url: `/Practitioner/${user.attributes.fhirPractitionerId[0]}` })).data;

        if (location) {
            // let fhirLocation = await (await FhirApi({ url: `/Location/${location}` })).data;
            console.log(fhirLocation);
            // remove meta tag
            const meta = {
                resourceType: 'Parameters',
                parameter: [
                    {
                        name: 'meta',
                        valueMeta: {
                            tag: practitioner.meta.tag
                        },
                    },
                ],
            }

            await (await FhirApi({ url: `/Practitioner/${user.attributes.fhirPractitionerId[0]}/$meta-delete`, method: "POST", data: JSON.stringify(meta) })).data;

            delete practitioner.meta;

            let newLocation = [
                { "url": "http://example.org/location", "valueReference": { "reference": `Location/${fhirLocation.id}`, "display": fhirLocation.name } },
                { "url": "http://example.org/fhir/StructureDefinition/role-group", "valueString": user?.attributes?.practitionerRole[0] }
            ]
            practitioner = await (await FhirApi({
                url: `/Practitioner/${user.attributes.fhirPractitionerId[0]}`,
                method: "PUT", data: JSON.stringify({
                    ...practitioner,
                    extension: location ? newLocation : [
                        { "url": "http://example.org/fhir/StructureDefinition/role-group", "valueString": user?.attributes?.practitionerRole[0] }
                    ],
                    meta: { tag: [{ system: "http://example.org/fhir/StructureDefinition/location", code: `Location/${fhirLocation.id}` }] },
                    identifier: [{ system: "http://hl7.org/fhir/administrative-identifier", value: idNumber }],
                })
            })).data;
        }

        return res.json({ status: "success", response: "User updated successfully" });
    } catch (error) {
        console.error(error);
        res.statusCode = 401;
        res.json({ error: "Invalid Bearer token provided", status: "error" });
        return;
    }
});

router.get("/superset-token", async (req: Request, res: Response) => {
    try {
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
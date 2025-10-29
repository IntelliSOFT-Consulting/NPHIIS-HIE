import express, { Request, Response } from "express";
import { computeMOH710 } from '../lib/reports'
import { getKeycloakUsers } from "../lib/keycloak";
import { FhirApi } from "../lib/utils";
const router = express.Router();
router.use(express.json());


router.get("/users", async (req: Request, res: Response) => {
    try {
        const users = await getKeycloakUsers();
        const response = [];
        if(!users){
            return res.status(400).json({ error: "Failed to retrieve users from Keycloak", status: "error" });
        }
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
            response,
            total: response.length,
            status: "success"
        });
    }
    catch (error) {
        console.log(error);
        return res.status(400).json({ error: "Failed to retrieve users", status: "error" });
    }
});

router.get("/roles", async (req: Request, res: Response) => {
    try {
        const roles = (process.env.USER_ROLES?.split(",") || []).map((role: string) => role.toUpperCase());
        return res.status(200).json({ roles, status: "success" });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to retrieve roles", status: "error" });
    }
});

export default router
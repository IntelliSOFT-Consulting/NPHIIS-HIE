import express, { Request, Response } from "express";
import { computeMOH710 } from '../lib/reports'
import { findKeycloakUser, getKeycloakUsers } from "../lib/keycloak";
import { authenticateUser } from "../lib/middleware";
import { getRoleFromPractitioner, isAdminPractitioner } from "../lib/practitioner-role";
import { getApplicationRoles } from "../lib/roles";
import { FhirApi } from "../lib/utils";
const router = express.Router();
router.use(express.json());


router.get("/users", authenticateUser, async (req: Request, res: Response) => {
    try {
        const caller = await findKeycloakUser((req as any).user.preferred_username);
        if (!caller?.id || !(await isAdminPractitioner(caller.id))) {
            return res.status(403).json({ error: "Administrator access required", status: "error" });
        }
        const keycloakResponse = await getKeycloakUsers();
        const response = [];
        if(!keycloakResponse || !keycloakResponse.users){
            return res.status(400).json({ error: "Failed to retrieve users from Keycloak", status: "error" });
        }
        for(let user of keycloakResponse.users){
            if(!user.id){
                continue;
            }
            const practitioner = await (await FhirApi({ url: `/Practitioner/${user.id}` })).data;
            const role = getRoleFromPractitioner(practitioner);
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
        const roles = getApplicationRoles();
        return res.status(200).json({ roles, status: "success" });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to retrieve roles", status: "error" });
    }
});

export default router
import express, { Request, response, Response } from "express";
import { createClient, FhirApi, getOpenHIMToken, installChannels, sendRequest } from "../lib/utils";
import { countries } from '../lib/countries.json'
import { parseOrganization } from "../lib/resources";

const router = express.Router();
router.use(express.json());



// Get all countries
router.get("/", async (req: Request, res: Response) => {
    try {
        let organizations = await (await FhirApi({ 'url': '/Organization' })).data
        console.log(organizations.entry)
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 400;
        res.json({ error: "incorrect email or password" });
        return;
    }
});

// Get Data Dictionary Data Elements.
router.post("/", async (req: Request, res: Response) => {
    try {
        let organization = req.body;
        if (!parseOrganization(organization)) {
            res.statusCode = 400;
            res.json({ status: "error", error: "Invalid Organization resource " });
            return;
        }
        let _organization = await (await FhirApi({ url: '/Organization', method: 'POST', data: JSON.stringify(organization) })).data
        res.statusCode = 200;
        res.json({ status: "success", organization: _organization.id });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 400;
        res.json({ error: error, status: "error" });
        return;
    }
});

export default router;
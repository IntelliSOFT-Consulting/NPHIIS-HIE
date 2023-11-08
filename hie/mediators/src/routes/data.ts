import express, { Request, response, Response } from "express";
import { createClient, getOpenHIMToken, installChannels, sendRequest } from "../lib/utils";
import { countries } from '../lib/countries.json'

const router = express.Router();
router.use(express.json());



// Get all countries
router.get("/countries", async (req: Request, res: Response) => {
    try {
        let _countries = countries.map((country: any) => {
            return country.name
        });
        res.json({ status: "success", countries: _countries });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password" });
        return;
    }
});

// Get Data Dictionary Data Elements.
router.get("/data_elements", async (req: Request, res: Response) => {
    try {
        let { code, concept } = req.query;
        res.json({ status: "success" });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status: "error" });
        return;
    }
});

export default router
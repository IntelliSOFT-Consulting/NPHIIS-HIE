import express, { Request, response, Response } from "express";
import { createClient, getOpenHIMToken, installChannels } from "../lib/utils";


const router = express.Router();
router.use(express.json());


router.get("/client", async (req: Request, res: Response) => {
    try {
        let token = await getOpenHIMToken();
        await installChannels()
        res.set(token);
        res.json({ status: "success", token });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password" });
        return;
    }
});





/*
  ____                   _    _ _____ __  __ _____             _            
 / __ \                 | |  | |_   _|  \/  |  __ \           | |           
| |  | |_ __   ___ _ __ | |__| | | | | \  / | |__) |___  _   _| |_ ___  ___ 
| |  | | '_ \ / _ \ '_ \|  __  | | | | |\/| |  _  // _ \| | | | __/ _ \/ __|
| |__| | |_) |  __/ | | | |  | |_| |_| |  | | | \ \ (_) | |_| | ||  __/\__ \
 \____/| .__/ \___|_| |_|_|  |_|_____|_|  |_|_|  \_\___/ \__,_|\__\___||___/
       | |                                                                  
       |_|                                                                  

*/
// Login
router.get("/token", async (req: Request, res: Response) => {
    try {
        let token = await getOpenHIMToken();
        await installChannels()
        res.set(token);
        res.json({ status: "success", token });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password" });
        return;
    }
});



// Login
router.post("/client", async (req: Request, res: Response) => {
    try {
        await getOpenHIMToken();
        let { name, password } = req.body;
        let response = await createClient(name, password);
        if (response === "Unauthorized" || response.indexOf("error") > -1) {
            res.statusCode = 401;
            res.json({ status: "error", error: response });
            return;
        }
        res.statusCode = 201;
        res.json({ status: "success", response });
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
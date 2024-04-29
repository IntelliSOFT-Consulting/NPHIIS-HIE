import express, { Request, Response } from "express";
import { computeMOH710 } from '../lib/reports'
const router = express.Router();
router.use(express.json());


router.get("/generate-710", async (req: Request, res: Response) => {
    try {
        let {data} = req.body;
        let report = await computeMOH710();
        
        // if (Object.keys(token).indexOf('error') > -1){
        //     res.statusCode = 401;
        //     res.json({status:"error", error: `${token.error} - ${token.error_description}`})
        //     return;
        // }
        res.statusCode = 200;
        res.json({ status: "success", report });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status:"error" });
        return;
    }
});

export default router
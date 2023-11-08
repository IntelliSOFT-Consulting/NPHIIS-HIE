import { getPatientSummary } from '../lib/utils';
import express, { Request, Response } from "express";


const router = express.Router();
router.use(express.json());

// Patient summary
router.get('/', async (req: Request, res: Response) => {
    try {
        let params = req.query;
        if (!params.crossBorderId) {
            res.statusCode = 400;
            res.json({ status: "error", error: "CrossBorder ID is required" });
            return;
        }
        let summary = await getPatientSummary(String(params.crossBorderId));
        res.json({ status: "success", summary });
        return;
    } catch (error) {
        console.error(error);
        res.statusCode = 400;
        res.json({ status: "error", error });
        return;
    }
});

export default router

import { Router } from "express";
import { Moh710Report, moh525Report, monitoringReport, defaulters } from "../controllers/reportsController";

const router = Router();

router.get("/moh_710_report", Moh710Report);
router.get("/moh_525_report", moh525Report);
router.get("/monitoring_report", monitoringReport);
router.get("/defaulters", defaulters);

export default router;

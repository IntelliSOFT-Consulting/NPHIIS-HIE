import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import logger from "morgan";
import dataRouter from "./routes/dataRoutes";
import reportRouter from "./routes/reportRoutes";
import cron from "node-cron";
import { jobManager } from "./services/jobManager";
import { executeJob } from "./routes/dataRoutes";

const app = express();

const port = process.env.PORT || 8000;

app.use(cors());
app.use(
  bodyParser.json({
    limit: "500mb",
  })
);
app.use(bodyParser.urlencoded({ limit: "500mb", extended: true }));
app.use(logger("dev"));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api/data", dataRouter);
app.use("/api", reportRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// script to run every day at 9:00 PM
cron.schedule("0 21 * * *", () => {
  const jobId = jobManager.createJob();

  executeJob(jobId).catch((error) => {
    console.error(`Job ${jobId} failed:`, error);
    jobManager.updateJobStatus(jobId, "failed", null, error.message);
  });
});

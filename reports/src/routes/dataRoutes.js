import { Router } from "express";
import { parseNestedJSON } from "../utils/helpers";
import { exec } from "child_process";
import { promisify } from "util";
import { jobManager } from "../services/jobManager";
import { importData } from "../services/dataImport";

const execAsync = promisify(exec);
const dataRouter = Router();
const currentPath = process.cwd()?.split("src")[0];
const pythonPath = `${currentPath}/app.py`;

// Start job endpoint
dataRouter.post("/analytics", (req, res) => {
  try {
    const jobId = jobManager.createJob();

    // Start the Python script execution in the background
    executeJob(jobId).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
      jobManager.updateJobStatus(jobId, "failed", null, error.message);
    });

    // Immediately return the job ID
    res.json({
      jobId,
      status: "pending",
      message: "Job started successfully",
      statusEndpoint: `/analytics/status/${jobId}`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Job status endpoint
dataRouter.get("/analytics/status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const jobStatus = jobManager.getJobStatus(jobId);

  if (!jobStatus) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json(jobStatus);
});

dataRouter.post("/hive", async (req, res) => {
  try {
    const data = parseNestedJSON(req.body);
    await importData(data);
    res.send("Data imported successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export async function executeJob(jobId) {
  try {
    jobManager.updateJobStatus(jobId, "running");

    const { stdout, stderr } = await execAsync(`python3 ${pythonPath}`);

    if (stderr) {
      console.warn(`Script warning output for job ${jobId}:`, stderr);
    }

    console.log(`Script output for job ${jobId}:`, stdout);
    jobManager.updateJobStatus(jobId, "completed", stdout);
  } catch (error) {
    console.error(`Error executing script for job ${jobId}:`, error);
    jobManager.updateJobStatus(jobId, "failed", null, error.message);
    throw error;
  }
}

export default dataRouter;

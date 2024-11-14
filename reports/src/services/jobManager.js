import { v4 as uuidv4 } from "uuid";

class JobManager {
  constructor() {
    this.jobs = new Map();
  }

  createJob() {
    const jobId = uuidv4();
    const jobStatus = {
      id: jobId,
      status: "pending",
      startTime: new Date(),
      error: null,
      result: null,
    };
    this.jobs.set(jobId, jobStatus);
    return jobId;
  }

  updateJobStatus(jobId, status, result = null, error = null) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.result = result;
      job.error = error;
      job.endTime = status === "completed" || status === "failed" ? new Date() : null;
    }
  }

  getJobStatus(jobId) {
    return this.jobs.get(jobId);
  }

  cleanupOldJobs(maxAgeHours = 24) {
    const now = new Date();
    for (const [jobId, job] of this.jobs.entries()) {
      const ageHours = (now - job.startTime) / (1000 * 60 * 60);
      if (ageHours > maxAgeHours) {
        this.jobs.delete(jobId);
      }
    }
  }
}

export const jobManager = new JobManager();
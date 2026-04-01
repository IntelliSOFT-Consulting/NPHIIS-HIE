import { Request, Response, NextFunction } from "express";

/**
 * Requires INTERNAL_SUBSCRIPTION_API_KEY and matching X-Internal-Api-Key header.
 */
export function requireInternalApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SUBSCRIPTION_API_KEY;
  if (!expected || !String(expected).trim()) {
    res.status(503).json({
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "exception", details: { text: "INTERNAL_SUBSCRIPTION_API_KEY is not configured" } }],
    });
    return;
  }
  const provided = req.headers["x-internal-api-key"];
  const key = Array.isArray(provided) ? provided[0] : provided;
  if (key !== expected) {
    res.status(401).json({
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "security", details: { text: "Unauthorized" } }],
    });
    return;
  }
  next();
}

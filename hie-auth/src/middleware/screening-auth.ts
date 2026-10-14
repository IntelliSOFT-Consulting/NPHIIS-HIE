import { timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { authenticateUser } from "../lib/middleware";

function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Auth for the screening service: a machine key in X-Screening-Api-Key
 * (SCREENING_API_KEY), or a normal provider Bearer token.
 * A supplied-but-wrong key is rejected rather than falling through to Bearer auth.
 */
export function requireScreeningAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["x-screening-api-key"];
  const provided = Array.isArray(header) ? header[0] : header;

  if (provided) {
    const expected = process.env.SCREENING_API_KEY?.trim();
    if (!expected) {
      return res.status(503).json({ status: "error", error: "SCREENING_API_KEY is not configured" });
    }
    if (!keyMatches(provided, expected)) {
      return res.status(401).json({ status: "error", error: "Invalid screening API key" });
    }
    (req as any).user = { preferred_username: "screening-service" };
    return next();
  }

  return authenticateUser(req, res, next);
}

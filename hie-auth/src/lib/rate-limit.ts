import { Request } from 'express';
import rateLimit from 'express-rate-limit';

const MINUTE = 60 * 1000;
const tooMany = { status: 'error', error: 'Too many requests, please try again later' };

/** The account a login or reset request is about, taken from the body or query. */
function accountKey(req: Request): string {
  const id = req.body?.idNumber ?? req.body?.username ?? req.query?.idNumber ?? '';
  return String(id).trim().toLowerCase();
}

/** Per-IP limit on login, registration, token refresh and password reset. */
export const authIpLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: Number(process.env.AUTH_RATE_LIMIT_PER_IP ?? 50),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

/**
 * Per-account limit on login and password reset, so guesses against one
 * account are capped even when they come from many IPs.
 */
export const authAccountLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: Number(process.env.AUTH_RATE_LIMIT_PER_ACCOUNT ?? 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
  keyGenerator: (req) => `acct:${accountKey(req)}`,
  skip: (req) => !accountKey(req),
});

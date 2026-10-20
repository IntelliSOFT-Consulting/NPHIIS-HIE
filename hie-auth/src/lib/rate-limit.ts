import { Request } from 'express';
import rateLimit, { type IncrementResponse, type Options, type Store } from 'express-rate-limit';
import { prisma } from './prisma';

const MINUTE = 60 * 1000;
const tooMany = { status: 'error', error: 'Too many requests, please try again later' };

/**
 * Adds one hit to `key` and returns the count in the current window. The
 * counter lives in Postgres so it survives restarts and is shared by every
 * hie-auth instance. Throws if the database can't be reached.
 */
export async function hitCounter(key: string, windowMs: number): Promise<{ hits: number; resetAt: Date }> {
  const resetAt = new Date(Date.now() + windowMs);
  const rows = await prisma.$queryRaw<{ hits: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "hits", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "hits"    = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN 1 ELSE "RateLimit"."hits" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "hits", "resetAt"`;
  return rows[0];
}

export async function clearCounter(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** express-rate-limit store backed by the RateLimit table. */
class PostgresStore implements Store {
  windowMs = 15 * MINUTE;
  constructor(public prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const { hits, resetAt } = await hitCounter(this.prefix + key, this.windowMs);
    return { totalHits: Number(hits), resetTime: resetAt };
  }

  async decrement(key: string) {
    await prisma.rateLimit.updateMany({
      where: { key: this.prefix + key, hits: { gt: 0 } },
      data: { hits: { decrement: 1 } },
    });
  }

  async resetKey(key: string) {
    await clearCounter(this.prefix + key);
  }
}

// Drop expired counters now and then.
setInterval(() => {
  prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } }).catch(() => {});
}, 10 * MINUTE).unref();

function normalise(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** The account a login or reset request is about, taken from the body or query. */
function accountKey(req: Request): string {
  return normalise(req.body?.idNumber ?? req.body?.username ?? req.query?.idNumber);
}

const common = {
  windowMs: 15 * MINUTE,
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  message: tooMany,
  // If the database is down, let requests through rather than block every login.
  passOnStoreError: true,
};

/**
 * Failed login / register / refresh / reset attempts per IP. Successful
 * requests aren't counted, so many users behind one facility NAT aren't blocked.
 */
export const authIpLimiter = rateLimit({
  ...common,
  limit: Number(process.env.AUTH_RATE_LIMIT_PER_IP ?? 50),
  skipSuccessfulRequests: true,
  store: new PostgresStore('ip:'),
});

/**
 * Failed logins per account *and* IP. Keying on both means someone spamming
 * wrong passwords for an account only blocks themselves, not the real user.
 */
export const loginLimiter = rateLimit({
  ...common,
  limit: Number(process.env.AUTH_RATE_LIMIT_PER_ACCOUNT ?? 10),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${accountKey(req)}|${req.ip}`,
  skip: (req) => !accountKey(req),
  store: new PostgresStore('login:'),
});

/**
 * Password-reset requests per account, from any IP. Counts every request, so
 * nobody can flood a user's inbox with reset emails. Code guesses are also
 * capped separately (see validateResetCode).
 */
export const resetLimiter = rateLimit({
  ...common,
  limit: Number(process.env.AUTH_RESET_LIMIT_PER_ACCOUNT ?? 5),
  keyGenerator: (req) => accountKey(req),
  skip: (req) => !accountKey(req),
  store: new PostgresStore('reset:'),
});

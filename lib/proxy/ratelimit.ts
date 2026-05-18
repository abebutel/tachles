import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { SafeError, SafeErrorCodes } from "./safe-error";

// Per-user and per-IP sliding-window rate limiters.
//
// Spec: docs/no-log-proxy-spec.md §Rate limiting and abuse prevention.
//
// Enforcement order at the route handler:
//   1. Verify JWT (cheap, no DB)
//   2. Check rate limit (this module) — BEFORE reading any body bytes
//   3. Check Content-Length against per-route byte ceiling
//   4. Stream body upstream
//
// Free vs paid: free-tier users get 30 req/hour; paid get 200/hour. We're
// in private beta and everyone is free, but the typed shape is here so the
// public-launch wiring is a one-line change.

type Tier = "free" | "paid";

const RATE_LIMIT_FREE_PER_HOUR = parseInt(process.env.RATE_LIMIT_FREE_PER_HOUR ?? "30", 10);
const RATE_LIMIT_PAID_PER_HOUR = parseInt(process.env.RATE_LIMIT_PAID_PER_HOUR ?? "200", 10);

// Lazy singleton — instantiating Redis at module load would crash any test
// or build where env vars are absent. We construct on first use, throw a
// SafeError if the env is missing, and reuse the instance afterwards.
let redisSingleton: Redis | null = null;

function getRedis(): Redis {
  if (redisSingleton) return redisSingleton;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new SafeError({
      code: "RATELIMIT_NOT_CONFIGURED",
      status: 500,
      message: "rate limiter env vars missing",
    });
  }
  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}

const limiters: Partial<Record<`${Tier}:user` | "ip", Ratelimit>> = {};

function getUserLimiter(tier: Tier): Ratelimit {
  const key = `${tier}:user` as const;
  let lim = limiters[key];
  if (!lim) {
    const max = tier === "paid" ? RATE_LIMIT_PAID_PER_HOUR : RATE_LIMIT_FREE_PER_HOUR;
    lim = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(max, "1 h"),
      analytics: false,
      prefix: `tachles:rl:${tier}:user`,
    });
    limiters[key] = lim;
  }
  return lim;
}

function getIpLimiter(): Ratelimit {
  let lim = limiters["ip"];
  if (!lim) {
    lim = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      analytics: false,
      prefix: "tachles:rl:ip",
    });
    limiters["ip"] = lim;
  }
  return lim;
}

export interface RateLimitResult {
  ok: true;
  remaining: number;
  resetUnixMs: number;
}

export interface RateLimitBlocked {
  ok: false;
  retryAfterSeconds: number;
}

export async function checkRateLimit(args: {
  userId: string;
  tier?: Tier;
  ip: string;
}): Promise<RateLimitResult | RateLimitBlocked> {
  const tier = args.tier ?? "free";

  const [userResult, ipResult] = await Promise.all([
    getUserLimiter(tier).limit(args.userId),
    getIpLimiter().limit(args.ip),
  ]);

  if (!userResult.success || !ipResult.success) {
    const reset = Math.max(userResult.reset, ipResult.reset);
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  }

  return {
    ok: true,
    remaining: Math.min(userResult.remaining, ipResult.remaining),
    resetUnixMs: Math.min(userResult.reset, ipResult.reset),
  };
}

// Convenience helper for route handlers — throws SafeError on block.
export async function enforceRateLimit(args: {
  userId: string;
  tier?: Tier;
  ip: string;
}): Promise<RateLimitResult> {
  const result = await checkRateLimit(args);
  if (!result.ok) {
    throw new SafeError({
      code: SafeErrorCodes.RATE_LIMITED,
      status: 429,
      message: `rate limited; retry after ${result.retryAfterSeconds}s`,
    });
  }
  return result;
}

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

/**
 * Rate limiting via Upstash Redis (sliding window).
 *
 * Env vars required (provided by the Upstash for Redis integration):
 *   - KV_REST_API_URL
 *   - KV_REST_API_TOKEN
 *
 * If Redis is not configured (e.g. local dev without env vars),
 * rate limiting is skipped so the app still works.
 */

const redisUrl = process.env.KV_REST_API_URL;
const redisToken = process.env.KV_REST_API_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

/** Login endpoints: 5 attempts per minute per IP (brute-force protection) */
const loginLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "rl:login",
      analytics: false,
    })
  : null;

/** General API writes: 60 requests per minute per IP */
const apiLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:api",
      analytics: false,
    })
  : null;

export function getClientIp(request: NextRequest): string {
  // Vercel sets x-forwarded-for; first entry is the client IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (for Retry-After header) */
  retryAfter: number;
}

async function check(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) {
    // Redis not configured — allow (fail open, but log so it's visible)
    if (process.env.NODE_ENV === "production") {
      console.warn("Rate limiting disabled: KV_REST_API_URL/KV_REST_API_TOKEN not set");
    }
    return { success: true, limit: 0, remaining: 0, retryAfter: 0 };
  }
  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    return {
      success,
      limit,
      remaining,
      retryAfter: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (err) {
    // Redis outage should not take down auth — fail open
    console.error("Rate limit check failed:", err);
    return { success: true, limit: 0, remaining: 0, retryAfter: 0 };
  }
}

/** Strict limit for login/auth endpoints: 5 attempts/min per IP */
export function checkLoginRateLimit(request: NextRequest) {
  return check(loginLimiter, getClientIp(request));
}

/** General limit for API endpoints: 60 req/min per IP */
export function checkApiRateLimit(request: NextRequest) {
  return check(apiLimiter, getClientIp(request));
}

/** Standard 429 response body + headers */
export function rateLimitResponseInit(result: RateLimitResult): ResponseInit {
  return {
    status: 429,
    headers: {
      "Retry-After": String(result.retryAfter),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
    },
  };
}

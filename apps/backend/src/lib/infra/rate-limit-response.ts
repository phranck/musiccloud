import type { FastifyReply } from "fastify";
import { createApiErrorResponse } from "./api-errors.js";
import type { RateLimitCheck } from "./rate-limiter.js";

const RATE_LIMITED_CODE = "MC-API-0003";

export function sendRateLimitError(reply: FastifyReply, check: RateLimitCheck) {
  const context = rateLimitContext(check);
  const body = createApiErrorResponse(RATE_LIMITED_CODE, { context });

  return reply.header("Retry-After", String(check.retryAfterSeconds)).status(429).send(body);
}

function rateLimitContext(check: RateLimitCheck): Record<string, number> {
  return {
    limit: check.limit,
    retryAfterSeconds: check.retryAfterSeconds,
    windowSeconds: check.windowSeconds,
  };
}

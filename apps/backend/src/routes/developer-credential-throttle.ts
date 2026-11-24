/**
 * @file The per-IP throttle every developer credential route shares.
 *
 * `/login`, `/request-reset`, `/confirm-email-change`, `/change-email` and the
 * Gravatar lookup count against one window. They live in `developer-auth.ts`
 * and `developer-profile.ts`, and both draw on the same
 * {@link credentialRateLimiter} instance.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";

/**
 * Dedicated per-IP throttle for credential endpoints (`/login`,
 * `/request-reset`): 10 requests per 60 seconds. Separate from the global
 * `apiRateLimiter` so portal brute-force protection has its own budget and does
 * not consume (or get consumed by) the public-API quota. Module-scoped so the
 * sliding window persists across requests for the lifetime of the process.
 */
const credentialRateLimiter = new RateLimiter(10, 60_000);

/**
 * `preHandler` that throttles credential endpoints per client IP via
 * {@link credentialRateLimiter}. On exhaustion it sends a `429` with the shared
 * rate-limit envelope and `Retry-After` header; otherwise it passes through.
 *
 * @param request - incoming request; `request.ip` is the throttle key.
 * @param reply - responds with `429` when the per-IP window is exhausted.
 */
export async function throttleCredentials(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = credentialRateLimiter.check(request.ip);
  if (check.limited) {
    await sendRateLimitError(reply, check);
  }
}

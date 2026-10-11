/**
 * @file Tests for the budget behind the keyless `GET /api/v1/resolve`.
 *
 * The endpoint answers without a credential on purpose, so this budget is the
 * whole of its abuse defence. Two things have to hold. It must have a window
 * measured in days as well as one measured in minutes, because a per-minute
 * limit on its own admits somebody running a service on it. And it must not
 * share a bucket with the other public routes, because a visitor browsing
 * share pages would otherwise spend what a shortcut needs, and the other way
 * round.
 *
 * ## What is real vs. mocked
 *
 * - **Real:** the limiters, the route handler, and the error envelope.
 * - **Mocked:** the resolver and the persistence layer, so no request leaves
 *   the process. The resolve outcome is irrelevant here; only whether the
 *   handler was reached at all.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRateLimiter,
  checkKeylessResolveBudget,
  KEYLESS_RESOLVE_REQUESTS_PER_DAY,
  KEYLESS_RESOLVE_REQUESTS_PER_MINUTE,
} from "@/lib/infra/rate-limiter";

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(async () => ({})),
}));

vi.mock("../services/resolver.js", () => ({
  resolveQuery: vi.fn(),
  // Ambiguous is the cheapest outcome that reaches a reply: the handler
  // answers 400 without persisting anything.
  resolveTextSearchWithDisambiguation: vi.fn(async () => ({ kind: "disambiguation", candidates: [] })),
}));

import resolvePublicGetRoutes from "../routes/resolve-public-get.js";

/** A bare instance carrying the route under test and the error envelope schema. */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.addSchema({ $id: "ErrorResponse", type: "object", additionalProperties: true });
  app.addSchema({ $id: "UnifiedResolveSuccess", type: "object", additionalProperties: true });
  await app.register(resolvePublicGetRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  delete process.env.DISABLE_RATE_LIMIT;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the keyless resolve budget", () => {
  it("refuses the request once the minute window is spent", () => {
    vi.useFakeTimers();
    const clientIp = "198.51.100.1";

    for (let spent = 0; spent < KEYLESS_RESOLVE_REQUESTS_PER_MINUTE; spent++) {
      expect(checkKeylessResolveBudget(clientIp).limited).toBe(false);
    }

    expect(checkKeylessResolveBudget(clientIp)).toMatchObject({
      limited: true,
      limit: KEYLESS_RESOLVE_REQUESTS_PER_MINUTE,
      windowSeconds: 60,
    });
  });

  it("refuses the request once the day window is spent, however slowly it is spent", () => {
    vi.useFakeTimers();
    const clientIp = "198.51.100.2";

    // One request a minute never fills the minute window, so whatever refuses
    // at the end can only be the day window.
    for (let spent = 0; spent < KEYLESS_RESOLVE_REQUESTS_PER_DAY; spent++) {
      expect(checkKeylessResolveBudget(clientIp).limited).toBe(false);
      vi.advanceTimersByTime(60_000);
    }

    expect(checkKeylessResolveBudget(clientIp)).toMatchObject({
      limited: true,
      limit: KEYLESS_RESOLVE_REQUESTS_PER_DAY,
      windowSeconds: 24 * 60 * 60,
    });
  });

  it("keeps answering after the shared public bucket is spent", async () => {
    const app = await buildApp();
    const clientIp = "203.0.113.11";
    for (let spent = 0; spent < 20; spent++) apiRateLimiter.check(clientIp);
    expect(apiRateLimiter.check(clientIp).limited).toBe(true);

    const response = await app.inject({
      method: "GET",
      url: `${ENDPOINTS.v1.resolve}?query=bohemian%20rhapsody`,
      remoteAddress: clientIp,
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("does not spend the shared public bucket", async () => {
    const app = await buildApp();
    const clientIp = "203.0.113.10";

    await app.inject({
      method: "GET",
      url: `${ENDPOINTS.v1.resolve}?query=bohemian%20rhapsody`,
      remoteAddress: clientIp,
    });

    // The request above is the only thing that could have spent this key, and
    // the check itself is the first hit on it.
    expect(apiRateLimiter.check(clientIp)).toMatchObject({ limited: false, remaining: 9 });
    await app.close();
  });

  it("answers a spent budget with the standard envelope and Retry-After", async () => {
    const app = await buildApp();
    const clientIp = "203.0.113.12";
    for (let spent = 0; spent < KEYLESS_RESOLVE_REQUESTS_PER_MINUTE; spent++) {
      checkKeylessResolveBudget(clientIp);
    }

    const response = await app.inject({
      method: "GET",
      url: `${ENDPOINTS.v1.resolve}?query=bohemian%20rhapsody`,
      remoteAddress: clientIp,
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe("MC-API-0003");
    expect(response.headers["retry-after"]).toBeTruthy();
    await app.close();
  });
});

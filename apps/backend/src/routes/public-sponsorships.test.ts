/**
 * Route tests for `POST /api/v1/sponsorships` and `PUT
 * /api/v1/sponsorships/:reference`, driving the real handlers, the shared
 * request schema, the error envelope and the per-route rate limit through
 * `app.inject`, with the service mocked.
 */
import rateLimit from "@fastify/rate-limit";
import { buildCreditorReference, ENDPOINTS, type PendingSponsorshipInput } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";

/** A reference of musiccloud's own shape, as the service would issue it. */
const REFERENCE = vi.hoisted(() => "RF00MCSP000000000000");

vi.mock("../services/pending-sponsorships.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/pending-sponsorships.js")>()),
  createPendingSponsorship: vi.fn(),
  updatePendingSponsorship: vi.fn(),
}));

import { createPendingSponsorship, updatePendingSponsorship } from "../services/pending-sponsorships.js";
import { SPONSORSHIP_REQUESTS_PER_HOUR } from "./public-sponsorships.js";

/** A form that passes the schema. */
const VALID: PendingSponsorshipInput = {
  name: "Ada",
  link: "chaos.social/@ada",
  claim: "Music for everybody.",
  amountCents: 5_000,
  published: true,
};

/** A sound reference with musiccloud's tag, built for the path. */
const ISSUED = buildCreditorReference("MCSP7Q2K9X4M8T3B");

/** The stored request the mocked service answers with. */
const STORED = {
  id: "p1",
  reference: ISSUED,
  name: "Ada",
  socialMedia: [{ platform: "mastodon" as const, url: "https://chaos.social/@ada" }],
  claim: "Music for everybody.",
  amountCents: 5_000,
  published: true,
  createdAt: "2026-11-17T12:00:00.000Z",
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(createPendingSponsorship).mockResolvedValue({ ok: true, value: STORED });
  vi.mocked(updatePendingSponsorship).mockResolvedValue({ ok: true, value: STORED });
  app = Fastify({ logger: false });
  registerApiErrorHandling(app);
  // The server's global ceiling, so the routes' own limit is what this test sees.
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  const { default: publicSponsorshipRoutes } = await import("./public-sponsorships.js");
  await app.register(publicSponsorshipRoutes);
});

afterEach(async () => {
  await app.close();
  vi.clearAllMocks();
});

/**
 * Announces a form.
 *
 * @param payload - The body.
 * @param address - The caller's address, which the rate limit counts by.
 */
function announce(payload: unknown, address = "203.0.113.1") {
  return app.inject({
    method: "POST",
    url: ENDPOINTS.v1.sponsorships,
    payload: payload as never,
    remoteAddress: address,
  });
}

describe("POST /api/v1/sponsorships", () => {
  it("answers the reference, compact and in groups of four, and caches nothing", async () => {
    const res = await announce(VALID);

    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toEqual({
      reference: ISSUED,
      referenceFormatted: ISSUED.replace(/(.{4})/g, "$1 ").trim(),
    });
  });

  it("names the minimum when the amount is below it", async () => {
    vi.mocked(createPendingSponsorship).mockResolvedValue({ ok: false, reason: "amount_too_low", minimumCents: 4_000 });

    const res = await announce({ ...VALID, amountCents: 100 });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "MC-REQ-0012" });
    expect(res.json().message).toContain("€40");
    expect(typeof res.json().errorId).toBe("string");
  });

  it("refuses an address it cannot link with its own code", async () => {
    vi.mocked(createPendingSponsorship).mockResolvedValue({ ok: false, reason: "unusable" });

    expect((await announce(VALID)).json()).toMatchObject({ error: "MC-REQ-0013" });
  });

  it("answers 503 when no reference could be drawn", async () => {
    vi.mocked(createPendingSponsorship).mockResolvedValue({ ok: false, reason: "reference_unavailable" });

    const res = await announce(VALID);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "MC-SYS-0004" });
  });

  it("drops an unknown field before the service sees the form", async () => {
    // Fastify's validator removes properties `additionalProperties: false` does not name.
    await announce({ ...VALID, role: "admin" });

    expect(createPendingSponsorship).toHaveBeenCalledWith(VALID);
  });

  it.each([
    ["a name that is too long", { ...VALID, name: "A".repeat(161) }],
    ["an amount that is not whole cents", { ...VALID, amountCents: 1.5 }],
    ["a missing consent", { name: "Ada", link: "x", claim: "y", amountCents: 1 }],
  ])("refuses %s before the service sees it", async (_case, body) => {
    const res = await announce(body);

    expect(res.statusCode).toBe(400);
    expect(createPendingSponsorship).not.toHaveBeenCalled();
  });

  it("refuses a body above 4 KiB", async () => {
    const res = await announce({ ...VALID, claim: "x".repeat(5 * 1024) });

    expect(res.statusCode).toBe(413);
    expect(createPendingSponsorship).not.toHaveBeenCalled();
  });

  it("admits five requests an hour from one address, counting refused bodies too, and no more", async () => {
    for (let index = 0; index < SPONSORSHIP_REQUESTS_PER_HOUR; index++) {
      expect((await announce({}, "198.51.100.7")).statusCode).toBe(400);
    }

    const refused = await announce(VALID, "198.51.100.7");
    expect(refused.statusCode).toBe(429);
    expect(refused.headers["retry-after"]).toBeDefined();
    expect(refused.json()).toMatchObject({ error: "MC-API-0003" });

    // Another address still has its own five.
    expect((await announce(VALID, "198.51.100.8")).statusCode).toBe(201);
  });
});

describe("PUT /api/v1/sponsorships/:reference", () => {
  it("rewrites the request behind a reference and answers the same reference", async () => {
    const res = await app.inject({ method: "PUT", url: ENDPOINTS.v1.sponsorshipDetail(ISSUED), payload: VALID });

    expect(res.statusCode).toBe(200);
    expect(res.json().reference).toBe(ISSUED);
    expect(updatePendingSponsorship).toHaveBeenCalledWith(ISSUED, VALID);
  });

  it("answers 404 when no request carries the reference", async () => {
    vi.mocked(updatePendingSponsorship).mockResolvedValue({ ok: false, reason: "not_found" });

    const res = await app.inject({ method: "PUT", url: ENDPOINTS.v1.sponsorshipDetail(ISSUED), payload: VALID });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "MC-RES-0003" });
  });

  it.each([
    ["lmaa's tag", buildCreditorReference("SPON7Q2K9X4M8T3B")],
    ["a reference too short", REFERENCE.slice(0, 10)],
  ])("refuses a path with %s before the service sees it", async (_case, reference) => {
    const res = await app.inject({ method: "PUT", url: ENDPOINTS.v1.sponsorshipDetail(reference), payload: VALID });

    expect(res.statusCode).toBe(400);
    expect(updatePendingSponsorship).not.toHaveBeenCalled();
  });
});

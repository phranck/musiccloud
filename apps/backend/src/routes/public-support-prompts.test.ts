/**
 * Route tests for `GET /api/v1/support-prompts`, ported from the support prompt
 * cases of lmaa.space's `public-routes.test.ts`, with the prompts, the limits
 * and the site variables mocked. Which prompts the query lets through is
 * proven against Postgres in `support-prompts.integration.test.ts`.
 */
import { ENDPOINTS, SUPPORT_PROMPT_LIMIT_DEFAULTS, type SupportPrompt } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptMocks = vi.hoisted(() => ({ listPublishedSupportPrompts: vi.fn() }));
vi.mock("../services/support-prompts.js", () => promptMocks);

const limitMocks = vi.hoisted(() => ({ getSupportPromptLimits: vi.fn() }));
vi.mock("../services/support-prompt-limits.js", () => limitMocks);

vi.mock("../services/site-variables.js", () => ({
  resolveSiteVariableValues: vi.fn(async () => ({ freeRequestsPerDay: 10_000 })),
}));

/** A published prompt as the service returns it. */
const PROMPT: SupportPrompt = {
  id: "a",
  name: "Card",
  slot: "share-page",
  content: "Opened {views share|shares}\nand {freeRequestsPerDay} a day.",
  buttonLabel: "Support",
  buttonHref: "/support-me",
  buttonAlignment: "trailing",
  threshold: 3,
  thresholdBasis: "opened",
  startsAt: null,
  endsAt: "2026-12-31",
  priority: 2,
  published: true,
  updatedAt: "2026-11-17T00:00:00.000Z",
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  limitMocks.getSupportPromptLimits.mockResolvedValue(SUPPORT_PROMPT_LIMIT_DEFAULTS);
  app = Fastify({ logger: false });
  const { default: publicSupportPromptRoutes } = await import("./public-support-prompts.js");
  await app.register(publicSupportPromptRoutes);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await app.close();
});

describe("GET /api/v1/support-prompts", () => {
  it("asks for today's prompts and answers with them, rendered, and the limits", async () => {
    promptMocks.listPublishedSupportPrompts.mockResolvedValue([PROMPT]);

    const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.supportPrompts });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      prompts: [
        {
          id: "a",
          name: "Card",
          slot: "share-page",
          // Rendered through the page pipeline: the site variable is filled,
          // the line break kept, and the count placeholder left for the browser.
          html: "<p>Opened {views share|shares}<br>and 10,000 a day.</p>\n",
          buttonLabel: "Support",
          buttonHref: "/support-me",
          buttonAlignment: "trailing",
          threshold: 3,
          thresholdBasis: "opened",
          priority: 2,
        },
      ],
      limits: SUPPORT_PROMPT_LIMIT_DEFAULTS,
      devAlwaysShow: false,
    });

    // The window is tested against a day, not a moment, so a prompt does not
    // end part way through the day it names.
    const [day] = promptMocks.listPublishedSupportPrompts.mock.calls[0];
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carries neither the Markdown source nor the publication state", async () => {
    promptMocks.listPublishedSupportPrompts.mockResolvedValue([PROMPT]);

    const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.supportPrompts });

    const [delivered] = res.json().prompts;
    for (const field of ["content", "published", "startsAt", "endsAt", "updatedAt"]) {
      expect(delivered).not.toHaveProperty(field);
    }
  });

  it("passes the always-show switch on outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    promptMocks.listPublishedSupportPrompts.mockResolvedValue([]);
    limitMocks.getSupportPromptLimits.mockResolvedValue({ ...SUPPORT_PROMPT_LIMIT_DEFAULTS, devAlwaysShow: true });

    const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.supportPrompts });

    expect(res.json().devAlwaysShow).toBe(true);
  });

  it("refuses the always-show switch in production, whatever is stored", async () => {
    // A switch left on by accident must not reach a reader, so the decision
    // is made here rather than in the browser.
    vi.stubEnv("NODE_ENV", "production");
    promptMocks.listPublishedSupportPrompts.mockResolvedValue([]);
    limitMocks.getSupportPromptLimits.mockResolvedValue({ ...SUPPORT_PROMPT_LIMIT_DEFAULTS, devAlwaysShow: true });

    const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.supportPrompts });

    expect(res.json().devAlwaysShow).toBe(false);
  });

  it("lets a person edit without a deployment, so the answer may be revalidated", async () => {
    promptMocks.listPublishedSupportPrompts.mockResolvedValue([]);

    const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.supportPrompts });

    expect(res.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
  });
});

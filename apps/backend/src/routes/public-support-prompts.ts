/**
 * @file What may be shown inside the site today, `GET /api/v1/support-prompts`.
 *
 * Ported from lmaa.space's `GET /api/support-prompts` (`apps/backend/src/routes/public.ts`).
 * Only published prompts leave the server, and only those whose window covers
 * today. A prompt is rendered in the reader's browser, so anything delivered
 * here is readable by anyone, draft or not.
 *
 * musiccloud renders Markdown in the backend, so each prompt's content goes
 * through `renderEditorialBodyWith`, the pipeline a page body takes, and
 * leaves as sanitized HTML. Line breaks inside a paragraph are kept, as
 * lmaa.space renders a prompt.
 *
 * Public without a key, because the landing page and the share page read it
 * during SSR, and kept out of the developer reference (`hide`), because it is
 * not part of the API offered to developers. The global per-source rate limit
 * applies. The answer does not vary by caller.
 */

import {
  ContentContext,
  ENDPOINTS,
  type PublicSupportPrompt,
  type SupportPromptPayload,
  utcDay,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { renderEditorialBodyWith } from "../services/editorial-body.js";
import { resolveSiteVariableValues } from "../services/site-variables.js";
import { getSupportPromptLimits } from "../services/support-prompt-limits.js";
import { listPublishedSupportPrompts } from "../services/support-prompts.js";

/**
 * A person edits prompts without a deployment, so the answer is cached for a
 * minute and may be served stale for five more whilst it is revalidated.
 */
const SUPPORT_PROMPTS_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

/** The environment in which the always-show switch is never honoured. */
const PRODUCTION_ENV = "production";

/**
 * Registers the route at the root scope, outside every auth hook.
 *
 * @param app - The root Fastify instance.
 */
export default async function publicSupportPromptRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.v1.supportPrompts, { schema: { hide: true } }, async (_request, reply) => {
    const [stored, limits, siteValues] = await Promise.all([
      listPublishedSupportPrompts(utcDay()),
      getSupportPromptLimits(),
      resolveSiteVariableValues(),
    ]);

    // Rendering runs together rather than one after another, because no
    // prompt's text depends on another's.
    const prompts: PublicSupportPrompt[] = await Promise.all(
      stored.map(async (prompt) => ({
        id: prompt.id,
        name: prompt.name,
        slot: prompt.slot,
        html: await renderEditorialBodyWith(prompt.content, ContentContext.Frontend, siteValues, { breaks: true }),
        buttonLabel: prompt.buttonLabel,
        buttonHref: prompt.buttonHref,
        buttonAlignment: prompt.buttonAlignment,
        threshold: prompt.threshold,
        thresholdBasis: prompt.thresholdBasis,
        priority: prompt.priority,
      })),
    );

    // Whether the limits may be set aside is decided here rather than in the
    // browser, because this is where the environment is known for certain. In
    // production the answer is no, whatever is stored, so a switch left on by
    // accident cannot reach a reader.
    const devAlwaysShow = process.env.NODE_ENV !== PRODUCTION_ENV && limits.devAlwaysShow === true;

    const payload: SupportPromptPayload = { prompts, limits, devAlwaysShow };
    return reply.header("Cache-Control", SUPPORT_PROMPTS_CACHE_CONTROL).send(payload);
  });
}

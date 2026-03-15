import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isUrl, stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { resolveQuery } from "../services/resolver.js";

/**
 * GET /api/v1/redirect?url=<streaming-service-url>
 *
 * Resolves a streaming service URL and redirects to the corresponding share page.
 * On any failure (invalid URL, not resolvable, network error) redirects back to /.
 */
export default async function urlRedirectRoutes(app: FastifyInstance) {
  app.get("/api/v1/redirect", async (request, reply) => {
    const clientIp = request.ip;
    if (apiRateLimiter.isLimited(clientIp)) {
      return reply.redirect("/", 302);
    }

    const query = request.query as { url?: string };
    const rawUrl = query.url?.trim();

    if (!rawUrl || !isUrl(rawUrl)) {
      return reply.redirect("/", 302);
    }

    try {
      const result = await resolveQuery(rawUrl);
      const repo = await getRepository();

      const { trackId, shortId } = await repo.persistTrackWithLinks({
        sourceTrack: {
          ...result.sourceTrack,
          sourceUrl: result.sourceTrack.webUrl,
        },
        links: result.links.map((l) => ({
          service: l.service,
          url: stripTrackingParams(l.url),
          confidence: l.confidence,
          matchMethod: l.matchMethod,
          externalId: l.externalId,
        })),
      });

      if (result.inputUrl) {
        try {
          await repo.addTrackUrlAlias(result.inputUrl, trackId);
        } catch {
          // non-fatal
        }
      }

      return reply.redirect(`/${shortId}`, 302);
    } catch (err) {
      if (!(err instanceof ResolveError)) {
        log.error("UrlRedirect", "Unexpected error:", err instanceof Error ? err.message : String(err));
      }
      return reply.redirect("/", 302);
    }
  });
}

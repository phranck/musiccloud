/**
 * @file Public website behaviour analytics ingest.
 *
 * This endpoint is first-party website infrastructure, not the external
 * Public API. It accepts small batches of curated events and derives all
 * network/device keys server-side. The route is intentionally hidden from
 * the public API reference.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import {
  ingestWebsiteAnalyticsBatch,
  WEBSITE_ANALYTICS_EVENT_TYPES,
  type WebsiteAnalyticsBatchRequest,
  WebsiteAnalyticsConfigError,
} from "../services/website-analytics.js";

const WEBSITE_ANALYTICS_BODY_LIMIT = 64 * 1024;

export default async function websiteAnalyticsRoutes(app: FastifyInstance) {
  app.post<{ Body: WebsiteAnalyticsBatchRequest }>(
    ENDPOINTS.v1.analytics.websiteEvents,
    {
      bodyLimit: WEBSITE_ANALYTICS_BODY_LIMIT,
      config: {
        rateLimit: { max: 120, timeWindow: "1 minute" },
      },
      schema: {
        hide: true,
        tags: ["Analytics"],
        summary: "Ingest first-party website behaviour analytics events.",
        body: {
          type: "object",
          required: ["sessionId", "events"],
          additionalProperties: false,
          properties: {
            sessionId: { type: "string", format: "uuid" },
            visitorId: { type: ["string", "null"], minLength: 8, maxLength: 128 },
            events: {
              type: "array",
              minItems: 1,
              maxItems: 50,
              items: {
                type: "object",
                required: ["occurredAt", "eventType"],
                additionalProperties: false,
                properties: {
                  id: { type: "string", format: "uuid" },
                  occurredAt: { type: "string", format: "date-time" },
                  eventType: { type: "string", enum: WEBSITE_ANALYTICS_EVENT_TYPES },
                  path: { type: ["string", "null"], maxLength: 512 },
                  routeTemplate: { type: ["string", "null"], maxLength: 128 },
                  referrerDomain: { type: ["string", "null"], maxLength: 255 },
                  deviceClass: { type: ["string", "null"], maxLength: 32 },
                  browserFamily: { type: ["string", "null"], maxLength: 64 },
                  osFamily: { type: ["string", "null"], maxLength: 64 },
                  deviceModel: { type: ["string", "null"], maxLength: 96 },
                  platform: { type: ["string", "null"], maxLength: 64 },
                  mediaType: { type: ["string", "null"], maxLength: 32 },
                  shortId: { type: ["string", "null"], maxLength: 64 },
                  surface: { type: ["string", "null"], maxLength: 64 },
                  elementKey: { type: ["string", "null"], maxLength: 128 },
                  xPct: { type: ["number", "null"], minimum: 0, maximum: 100 },
                  yPct: { type: ["number", "null"], minimum: 0, maximum: 100 },
                  viewportBucket: { type: ["string", "null"], enum: ["mobile", "tablet", "desktop", null] },
                  eventData: {
                    type: ["object", "null"],
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
        response: {
          202: {
            type: "object",
            required: ["accepted"],
            properties: {
              accepted: { type: "integer", minimum: 0 },
            },
          },
          400: { $ref: "ErrorResponse#" },
          429: { $ref: "ErrorResponse#" },
          503: { $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await ingestWebsiteAnalyticsBatch(request.body, { ip: request.ip });
        return reply.code(202).send(result);
      } catch (err) {
        if (err instanceof WebsiteAnalyticsConfigError) {
          request.log.error({ err }, "website analytics ingest is not configured");
          return reply.code(503).send({
            error: "ANALYTICS_NOT_CONFIGURED",
            message: "Website analytics ingestion is not configured.",
          });
        }

        request.log.warn({ err }, "website analytics ingest rejected");
        return reply.code(400).send({
          error: "INVALID_ANALYTICS_EVENT",
          message: err instanceof Error ? err.message : "Invalid analytics payload",
        });
      }
    },
  );
}

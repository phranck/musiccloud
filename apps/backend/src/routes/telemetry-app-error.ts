/**
 * @file Apple-client telemetry ingest.
 *
 * Public, unauthenticated POST endpoint that receives structured error
 * events from the macOS/iOS app's Testflight builds. App Store builds do
 * not call this route (guarded client-side by BuildChannel.current).
 *
 * The route intentionally has no auth: the whole point is that an app
 * experiencing an error can still report even when the user has never
 * authenticated. Abuse is bounded by a stricter per-route rate-limit
 * than the global default, and by the 8 KB bodyLimit below.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { type AppTelemetryRequest, ingestAppTelemetryEvent } from "../services/telemetry-app.js";

const APP_ERROR_BODY_LIMIT = 8 * 1024;

export default async function telemetryAppErrorRoutes(app: FastifyInstance) {
  app.post<{ Body: AppTelemetryRequest }>(
    ENDPOINTS.v1.telemetry.appError,
    {
      bodyLimit: APP_ERROR_BODY_LIMIT,
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
      schema: {
        hide: true,
        tags: ["Telemetry"],
        summary: "Ingest an app-side error event (Apple client, Testflight).",
        body: {
          type: "object",
          required: [
            "eventType",
            "eventTime",
            "installId",
            "appVersion",
            "buildNumber",
            "platform",
            "osVersion",
            "deviceModel",
            "locale",
            "errorKind",
            "message",
          ],
          additionalProperties: false,
          properties: {
            eventType: {
              type: "string",
              enum: ["resolve_error", "network_error", "decode_error", "unknown_error"],
            },
            eventTime: { type: "string", format: "date-time" },
            installId: { type: "string", minLength: 8, maxLength: 64 },
            appVersion: { type: "string", maxLength: 32 },
            buildNumber: { type: "string", maxLength: 32 },
            platform: { type: "string", enum: ["ios", "macos"] },
            osVersion: { type: "string", maxLength: 64 },
            deviceModel: { type: "string", maxLength: 64 },
            locale: { type: "string", maxLength: 16 },
            sourceUrl: { type: ["string", "null"], maxLength: 2000 },
            service: { type: ["string", "null"], maxLength: 32 },
            errorKind: { type: "string", maxLength: 64 },
            httpStatus: { type: ["integer", "null"], minimum: 100, maximum: 599 },
            message: { type: "string", maxLength: 4000 },
          },
        },
        response: {
          204: { type: "null" },
          400: { $ref: "ErrorResponse#" },
          429: { $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      try {
        await ingestAppTelemetryEvent(request.body);
      } catch (err) {
        request.log.warn({ err }, "telemetry-app-error ingest failed");
        return reply.code(400).send({
          error: "INVALID_TELEMETRY",
          message: err instanceof Error ? err.message : "Invalid telemetry payload",
        });
      }
      return reply.code(204).send();
    },
  );
}

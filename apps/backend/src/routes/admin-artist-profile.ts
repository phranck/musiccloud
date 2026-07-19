import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getAdminCaller } from "../lib/admin-caller.js";
import { setApiFailureDiagnostic } from "../lib/infra/api-error-handler.js";
import { createApiErrorResponse, sanitizeErrorForLog } from "../lib/infra/api-errors.js";
import {
  AdminArtistProfileRefreshError,
  refreshAdminArtistProfile,
} from "../services/admin-artist-profile-refresh.js";

export default async function adminArtistProfileRoutes(app: FastifyInstance) {
  app.post<{ Params: { artistEntityId: string } }>(
    ROUTE_TEMPLATES.admin.artists.refreshProfile,
    {
      schema: {
        params: {
          type: "object",
          required: ["artistEntityId"],
          additionalProperties: false,
          properties: {
            artistEntityId: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]+$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const caller = await getAdminCaller(request);
      if (!caller) {
        return reply.status(403).send(
          createApiErrorResponse("MC-AUTH-0002", {
            overrideMessage: "Authenticated administrator account required.",
          }),
        );
      }

      try {
        return await refreshAdminArtistProfile({
          actorAdminId: caller.id,
          artistEntityId: request.params.artistEntityId,
          requestId: request.id,
        });
      } catch (error) {
        if (!(error instanceof AdminArtistProfileRefreshError)) throw error;
        setApiFailureDiagnostic(request, {
          cause: sanitizeErrorForLog(error.internalCause ?? error.auditCause, false),
          component: "AdminArtistProfileRefresh",
          operation: "artist_profile_manual_refresh",
          outcome: "refresh_failed",
          artistEntityId: request.params.artistEntityId,
        });
        return reply.status(error.statusCode).send(error.response);
      }
    },
  );
}

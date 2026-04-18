/**
 * @file Unauthenticated endpoint that returns a random existing short ID.
 *
 * Powers the frontend's "random example" feature (a discovery shortcut that
 * sends the user to an arbitrary previously-resolved track or album share
 * page). Registered unauthenticated in `server.ts` because it is called from
 * the public site.
 *
 * The repository draws uniformly across BOTH track and album short IDs,
 * which share one namespace by design (see `getRandomShortId` in the
 * Postgres adapter). A 404 here means the database genuinely has zero
 * resolved tracks or albums, which only happens on a fresh install.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";

export default async function randomExampleRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.randomExample,
    {
      schema: {
        tags: ["Services"],
        summary: "Random example share ID",
        description:
          "Returns one randomly-picked short ID drawn uniformly across the existing track and album namespaces. Used by the frontend to power a discovery shortcut.",
        response: {
          200: {
            description: "A short ID that can be appended to the site root to reach a share page.",
            type: "object",
            required: ["shortId"],
            properties: {
              shortId: { type: "string", description: "Short ID (track or album)." },
            },
            additionalProperties: false,
            example: { shortId: "aBc123x" },
          },
          404: {
            description: "No resolved tracks or albums exist (empty database).",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (_request, reply) => {
      const repo = await getRepository();
      const shortId = await repo.getRandomShortId();
      if (!shortId) return reply.code(404).send({ error: "No examples available" });
      return { shortId };
    },
  );
}

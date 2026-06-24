/**
 * @file Unauthenticated endpoint that returns a random existing CC track short ID.
 *
 * Powers the landing page's "live example" link in Creative-Commons mode: the
 * SSR-loaded short ID sends the user to an arbitrary previously-shared CC track
 * (with its audio player + license info). Mirrors `random-example.ts` but draws
 * from the CC track short-url namespace.
 *
 * Frontend consumption: `index.astro` fetches this alongside the commercial
 * example during SSR; the landing page uses the CC id when the resolve mode is
 * Creative Commons. A 404 (no CC tracks shared yet) is handled gracefully by the
 * frontend falling back to the commercial example.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getCcRepository } from "../db/index.js";

export default async function ccRandomExampleRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.ccRandomExample,
    {
      schema: {
        tags: ["CC"],
        summary: "Random CC example share ID",
        description:
          "Returns one randomly-picked Creative-Commons track short ID. Used by the landing page's live-example link in CC mode.",
        response: {
          200: {
            description: "A short ID that can be appended to the site root to reach a CC share page.",
            type: "object",
            required: ["shortId"],
            properties: {
              shortId: { type: "string", description: "CC track short ID." },
            },
            additionalProperties: false,
            example: { shortId: "aBc123x" },
          },
          404: {
            description: "No CC tracks have been shared yet (empty CC namespace).",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (_request, reply) => {
      const repo = await getCcRepository();
      const shortId = await repo.getRandomCcShortId();
      if (!shortId) return reply.code(404).send({ error: "No CC examples available" });
      return { shortId };
    },
  );
}

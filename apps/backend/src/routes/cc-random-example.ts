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
        description: "Returns one randomly selected existing Creative-Commons track share code.",
        response: {
          200: {
            description:
              "`CcRandomExampleResponse`. Pass its `shortId` to `GET /api/v1/share/{shortId}` or append it to `https://musiccloud.io/` to open the public share page.",
            $ref: "CcRandomExampleResponse#",
          },
          404: {
            description: "No persisted Creative Commons track share is currently available.",
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

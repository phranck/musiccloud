import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";

export default async function randomExampleRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.v1.randomExample, async (_request, reply) => {
    const repo = await getRepository();
    const shortId = await repo.getRandomShortId();
    if (!shortId) return reply.code(404).send({ error: "No examples available" });
    return { shortId };
  });
}

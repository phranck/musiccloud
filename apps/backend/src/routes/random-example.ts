import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";

export default async function randomExampleRoutes(app: FastifyInstance) {
  app.get("/api/v1/random-example", async (_request, reply) => {
    const repo = await getRepository();
    const shortId = await repo.getRandomShortId();
    if (!shortId) return reply.code(404).send({ error: "No examples available" });
    return { shortId };
  });
}

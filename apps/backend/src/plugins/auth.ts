import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    authenticateInternal: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticatePublic: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance) {
  const internalApiKey = process.env.INTERNAL_API_KEY;

  /**
   * X-API-Key authentication for internal (BFF) requests.
   * Used by the frontend proxy to call backend endpoints.
   */
  app.decorate("authenticateInternal", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!internalApiKey) {
      app.log.warn("INTERNAL_API_KEY not set, skipping auth check");
      return;
    }

    const apiKey = request.headers["x-api-key"];
    if (apiKey !== internalApiKey) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or missing API key." });
    }
  });

  /**
   * Bearer JWT or X-API-Key authentication for public API requests.
   * Accepts either an X-API-Key header (internal) or a Bearer JWT (public clients).
   */
  app.decorate("authenticatePublic", async (request: FastifyRequest, reply: FastifyReply) => {
    // Check X-API-Key first (internal)
    const apiKey = request.headers["x-api-key"];
    if (apiKey && internalApiKey && apiKey === internalApiKey) {
      return;
    }

    // Check Bearer JWT
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        await request.jwtVerify();
        return;
      } catch {
        return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
      }
    }

    return reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required." });
  });

  /**
   * Bearer JWT authentication for admin dashboard requests.
   * Requires a valid JWT with role: "admin" in the payload.
   */
  app.decorate("authenticateAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Authentication required." });
    }
    try {
      await request.jwtVerify();
      const payload = request.user as { role?: string };
      if (payload.role !== "admin") {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required." });
      }
    } catch {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
    }
  });
}

export default fp(authPlugin, { name: "auth" });

import type { FastifyInstance } from "fastify";

interface TokenRequestBody {
  client_id: string;
  client_secret: string;
  grant_type: string;
}

export default async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/token
   * OAuth 2.0 Client Credentials flow for public API consumers (iOS/macOS apps).
   */
  app.post("/api/auth/token", async (request, reply) => {
    const body = request.body as TokenRequestBody | null;

    if (!body || body.grant_type !== "client_credentials") {
      return reply.status(400).send({
        error: "invalid_grant",
        message: "grant_type must be 'client_credentials'.",
      });
    }

    const { client_id, client_secret } = body;

    if (!client_id || !client_secret) {
      return reply.status(400).send({
        error: "invalid_request",
        message: "client_id and client_secret are required.",
      });
    }

    // Validate client credentials against env vars
    // For MVP, support a single client configured via env
    const validClientId = process.env.API_CLIENT_ID;
    const validClientSecret = process.env.API_CLIENT_SECRET;

    if (!validClientId || !validClientSecret) {
      app.log.warn("API_CLIENT_ID or API_CLIENT_SECRET not configured");
      return reply.status(500).send({
        error: "server_error",
        message: "OAuth client credentials not configured.",
      });
    }

    if (client_id !== validClientId || client_secret !== validClientSecret) {
      return reply.status(401).send({
        error: "invalid_client",
        message: "Invalid client credentials.",
      });
    }

    // Issue JWT
    const token = app.jwt.sign(
      { sub: client_id, scope: "api" },
      { expiresIn: "1h" },
    );

    return reply.send({
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
    });
  });
}

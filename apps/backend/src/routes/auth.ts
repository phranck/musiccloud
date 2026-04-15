/**
 * @file OAuth 2.0 token issuance endpoint for public API consumers.
 *
 * Registered unauthenticated in `server.ts` (it has to be: the whole point
 * is to hand out the credential used on subsequent authenticated calls).
 * The issued JWT is what `authenticatePublic` accepts on routes in the
 * `protectedRoutes` block.
 *
 * ## Grant type
 *
 * Only `client_credentials` is accepted. There is no `authorization_code`
 * flow because musiccloud has no end-user login on the public API surface;
 * the clients are machine-to-machine (primarily the iOS / macOS apps),
 * acting in the name of the app publisher rather than any end user. Adding
 * another grant type means adding a user identity model first.
 *
 * ## Client registry
 *
 * A single client is configured via `API_CLIENT_ID` / `API_CLIENT_SECRET`
 * env vars. This is an explicit MVP simplification: a real client table
 * (with revocation, rotation, scopes) is a later build-out; until a second
 * consumer actually needs a token, the env-var form is enough.
 *
 * ## Token lifetime
 *
 * `expiresIn: "1h"` (matching `expires_in: 3600` in the response) balances
 * two concerns: short enough that a leaked token has limited exposure,
 * long enough that typical app sessions do not thrash the endpoint. The
 * client is expected to refresh by re-issuing with its credentials; there
 * is no refresh-token flow by design (client secret is long-lived).
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

interface TokenRequestBody {
  client_id: string;
  client_secret: string;
  grant_type: string;
}

export default async function authRoutes(app: FastifyInstance) {
  app.post(ENDPOINTS.auth.token, async (request, reply) => {
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

    const validClientId = process.env.API_CLIENT_ID;
    const validClientSecret = process.env.API_CLIENT_SECRET;

    // Missing credentials is a server misconfiguration, not a client
    // mistake: returning 401 would be misleading and invite the caller to
    // retry with different credentials. 500 makes the cause visible in
    // dashboards and in the client's error path.
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

    // JWT payload kept minimal: `sub` identifies the client for log
    // correlation, `scope: "api"` reserves room for a later split between
    // general API scope and narrower scopes (e.g. resolve-only, read-only)
    // without invalidating existing tokens.
    const token = app.jwt.sign({ sub: client_id, scope: "api" }, { expiresIn: "1h" });

    return reply.send({
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
    });
  });
}

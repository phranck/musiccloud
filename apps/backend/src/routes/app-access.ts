/**
 * @file The Apple app's own routes under `/api/app/`.
 *
 * Only a genuine build of the app can use them, because a session comes from
 * Apple's App Attest: the app attests a key once, renews its session with
 * assertions from that key, and sends the session token as a Bearer header.
 * None of the routes is public API: each one is hidden from the OpenAPI
 * document, and `PUBLIC_OPENAPI_PATHS` in `server.ts` does not list them.
 *
 * `challenge`, `attest` and `session` are public by design and carry their own
 * limit of {@link APP_HANDSHAKE_REQUESTS_PER_MINUTE} per IP. `resolve` is
 * exempt from every request limit for a caller whose session verifies, and
 * counts anybody else against {@link APP_RESOLVE_UNAUTHENTICATED_REQUESTS_PER_MINUTE}
 * per IP. That exemption is decided by verifying the token in the limiter's
 * `allowList`, never by the path.
 *
 * Every response carries `Cache-Control: no-store`. No log line holds the
 * attestation, the assertion, the token or the query: a request is logged by
 * the SHA-256 of its key id, its outcome and its duration.
 */
import { createHash } from "node:crypto";
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { replyWithApiError, setApiFailureDiagnostic } from "../lib/infra/api-error-handler.js";
import {
  type AppAccessResult,
  type AppAttestRequest,
  type AppSessionRequest,
  attestAppKey,
  renewAppSession,
  resolveAppSessionKey,
} from "../services/app-attest/access.js";
import { AppSessionUnconfiguredError } from "../services/app-attest/session-token.js";
import { issueAppAttestChallenge } from "../services/app-attest/store.js";
import { RESOLVE_SUCCESS_RESPONSE_SCHEMA, respondToResolveRequest } from "./resolve.js";

/** Requests per minute and IP on each of `challenge`, `attest` and `session`. */
export const APP_HANDSHAKE_REQUESTS_PER_MINUTE = 20;

/** Requests per minute and IP on `resolve` for a caller without a valid session. */
export const APP_RESOLVE_UNAUTHENTICATED_REQUESTS_PER_MINUTE = 10;

/** Largest body any of the routes accepts. The biggest is an attestation, a little under 11 KiB as base64. */
const APP_BODY_LIMIT_BYTES = 16 * 1024;

/** A key id: the base64 of the 32-byte SHA-256 of the public key, 44 characters with one `=`. */
const KEY_ID_SCHEMA = { type: "string", minLength: 44, maxLength: 44, pattern: "^[A-Za-z0-9+/]{43}=$" } as const;

/** A challenge: 32 random bytes as unpadded base64url, 43 characters. */
const CHALLENGE_SCHEMA = { type: "string", minLength: 43, maxLength: 43, pattern: "^[A-Za-z0-9_-]{43}$" } as const;

/**
 * Standard base64 of at most `decodedBytes` bytes. The length bound is the
 * base64 length of that many bytes, so the schema caps the decoded object.
 *
 * @param decodedBytes - The largest decoded size accepted.
 * @returns The string schema.
 */
function base64Schema(decodedBytes: number) {
  return {
    type: "string",
    minLength: 4,
    maxLength: 4 * Math.ceil(decodedBytes / 3),
    pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
  } as const;
}

/** An attestation object, at most 8 KiB once decoded. Apple's sample is 5.8 KiB. */
const ATTESTATION_SCHEMA = base64Schema(8 * 1024);

/** An assertion object, at most 2 KiB once decoded. One is about 150 bytes. */
const ASSERTION_SCHEMA = base64Schema(2 * 1024);

/** The longest query `resolve` accepts. */
const APP_RESOLVE_QUERY_MAX_LENGTH = 2048;

/** The longest `Authorization` header value read as a session token. A token is about 250 characters. */
const AUTHORIZATION_MAX_LENGTH = 2048;

const BEARER_PREFIX = "Bearer ";

/** The body of a session, both from `attest` and from `session`. */
const SESSION_RESPONSE_SCHEMA = {
  type: "object",
  required: ["token", "expiresAt"],
  additionalProperties: false,
  properties: {
    token: { type: "string", description: "The session token, sent as `Authorization: Bearer <token>`." },
    expiresAt: { type: "string", format: "date-time", description: "When the token stops being valid." },
  },
} as const;

/** What a request was refused or answered with, kept until its log line is written. */
interface AppAccessLogEntry {
  operation: "challenge" | "attest" | "session" | "resolve";
  outcome: string;
  keyIdHash?: string;
  reason?: string;
  details?: Record<string, unknown>;
}

const logEntries = new WeakMap<FastifyRequest, AppAccessLogEntry>();

/** The verified session of a request, computed once whether the limiter or the guard asks first. */
type SessionLookup = { keyId: string } | { missing: true } | { unconfigured: true };
const sessionLookups = new WeakMap<FastifyRequest, Promise<SessionLookup>>();

/**
 * A short, stable name for a key id in the logs. The key id is not secret, but
 * the log names no more of it than it needs to correlate lines.
 *
 * @param keyId - The key id.
 * @returns The first 16 hex digits of its SHA-256.
 */
function keyIdHash(keyId: string): string {
  return createHash("sha256").update(keyId, "utf8").digest("hex").slice(0, 16);
}

/**
 * Reads the bearer token from a request.
 *
 * @param request - The request.
 * @returns The token, or `null` when the header is missing, not a Bearer header, or implausibly long.
 */
function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > AUTHORIZATION_MAX_LENGTH || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length);
  return token.length > 0 ? token : null;
}

/**
 * Verifies the request's session once and remembers the answer.
 *
 * The rate limiter's `allowList` asks first and the route's guard asks after
 * it, so both read the same verification and the database is asked once.
 *
 * @param request - The request.
 * @returns The session's key, or why there is none.
 */
function lookUpSession(request: FastifyRequest): Promise<SessionLookup> {
  const existing = sessionLookups.get(request);
  if (existing) return existing;

  const lookup = (async (): Promise<SessionLookup> => {
    const token = bearerToken(request);
    if (!token) return { missing: true };
    try {
      const keyId = await resolveAppSessionKey(token, new Date());
      return keyId ? { keyId } : { missing: true };
    } catch (error) {
      if (error instanceof AppSessionUnconfiguredError) return { unconfigured: true };
      throw error;
    }
  })();
  sessionLookups.set(request, lookup);
  return lookup;
}

/**
 * Whether a request carries a valid app session, which is what exempts it from
 * the resolve route's limit. Used as the limiter's `allowList`.
 *
 * @param request - The request.
 * @returns `true` only for a verified token whose key is active.
 */
export async function hasValidAppSession(request: FastifyRequest): Promise<boolean> {
  return "keyId" in (await lookUpSession(request));
}

/**
 * Answers an attestation or a renewal.
 *
 * @param request - The request, for the log line.
 * @param reply - The reply to answer on.
 * @param result - What the flow produced.
 * @param entry - The log line's operation and key.
 * @returns The sent reply.
 */
function replyWithAccessResult(
  request: FastifyRequest,
  reply: FastifyReply,
  result: AppAccessResult,
  entry: Pick<AppAccessLogEntry, "operation" | "keyIdHash">,
): FastifyReply {
  if ("session" in result) {
    logEntries.set(request, { ...entry, outcome: "session_issued", details: { ...result.details } });
    return reply.send({ token: result.session.token, expiresAt: result.session.expiresAt.toISOString() });
  }

  logEntries.set(request, {
    ...entry,
    outcome: `refused_${result.refusal}`,
    reason: result.reason,
    details: result.details ? { ...result.details } : undefined,
  });
  setApiFailureDiagnostic(request, {
    component: "AppAccess",
    operation: entry.operation,
    outcome: `refused_${result.refusal}`,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(entry.keyIdHash ? { keyIdHash: entry.keyIdHash } : {}),
  });
  switch (result.refusal) {
    case "challenge":
      return replyWithApiError(reply, "MC-AUTH-0006");
    case "verification":
      return replyWithApiError(reply, "MC-AUTH-0007");
    case "unknown_key":
      return replyWithApiError(reply, "MC-AUTH-0008");
    case "already_attested":
      return replyWithApiError(reply, "MC-REQ-0009");
  }
}

/**
 * Runs an attestation or renewal and answers a missing session secret with
 * `MC-CFG-0001` rather than a generic server error.
 *
 * @param request - The request.
 * @param reply - The reply.
 * @param operation - Which flow this is, for the log line.
 * @param keyId - The key id the body names.
 * @param flow - The flow to run.
 * @returns The sent reply.
 */
async function runAccessFlow(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: "attest" | "session",
  keyId: string,
  flow: () => Promise<AppAccessResult>,
): Promise<FastifyReply> {
  const entry = { operation, keyIdHash: keyIdHash(keyId) };
  try {
    return replyWithAccessResult(request, reply, await flow(), entry);
  } catch (error) {
    if (!(error instanceof AppSessionUnconfiguredError)) throw error;
    logEntries.set(request, { ...entry, outcome: "unconfigured" });
    return replyWithApiError(reply, "MC-CFG-0001");
  }
}

/**
 * Registers the four app routes. Registered as an encapsulated plugin, so the
 * `no-store` header and the log hook apply to these routes and no others.
 *
 * @param app - The plugin's scope.
 */
export default async function appAccessRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });

  app.addHook("onResponse", async (request, reply) => {
    const entry = logEntries.get(request);
    request.log.info(
      {
        component: "AppAccess",
        operation: entry?.operation ?? request.routeOptions.url,
        outcome: entry?.outcome ?? (reply.statusCode < 400 ? "ok" : "rejected"),
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        ...(entry?.keyIdHash ? { keyIdHash: entry.keyIdHash } : {}),
        ...(entry?.reason ? { reason: entry.reason } : {}),
        ...(entry?.details ?? {}),
      },
      "app access request",
    );
  });

  const handshakeRateLimit = { max: APP_HANDSHAKE_REQUESTS_PER_MINUTE, timeWindow: "1 minute" };

  app.post(
    ENDPOINTS.app.challenge,
    {
      bodyLimit: APP_BODY_LIMIT_BYTES,
      config: { rateLimit: handshakeRateLimit },
      schema: {
        hide: true,
        response: {
          200: {
            type: "object",
            required: ["challenge", "expiresAt"],
            additionalProperties: false,
            properties: {
              challenge: CHALLENGE_SCHEMA,
              expiresAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (request) => {
      const issued = await issueAppAttestChallenge(new Date());
      logEntries.set(request, { operation: "challenge", outcome: "challenge_issued" });
      return { challenge: issued.challenge, expiresAt: issued.expiresAt.toISOString() };
    },
  );

  app.post<{ Body: AppAttestRequest }>(
    ENDPOINTS.app.attest,
    {
      bodyLimit: APP_BODY_LIMIT_BYTES,
      config: { rateLimit: handshakeRateLimit },
      schema: {
        hide: true,
        body: {
          type: "object",
          required: ["keyId", "attestation", "challenge"],
          additionalProperties: false,
          properties: { keyId: KEY_ID_SCHEMA, attestation: ATTESTATION_SCHEMA, challenge: CHALLENGE_SCHEMA },
        },
        response: { 200: SESSION_RESPONSE_SCHEMA },
      },
    },
    async (request, reply) =>
      runAccessFlow(request, reply, "attest", request.body.keyId, () => attestAppKey(request.body, new Date())),
  );

  app.post<{ Body: AppSessionRequest }>(
    ENDPOINTS.app.session,
    {
      bodyLimit: APP_BODY_LIMIT_BYTES,
      config: { rateLimit: handshakeRateLimit },
      schema: {
        hide: true,
        body: {
          type: "object",
          required: ["keyId", "assertion", "challenge"],
          additionalProperties: false,
          properties: { keyId: KEY_ID_SCHEMA, assertion: ASSERTION_SCHEMA, challenge: CHALLENGE_SCHEMA },
        },
        response: { 200: SESSION_RESPONSE_SCHEMA },
      },
    },
    async (request, reply) =>
      runAccessFlow(request, reply, "session", request.body.keyId, () => renewAppSession(request.body, new Date())),
  );

  app.post<{ Body: { query: string } }>(
    ENDPOINTS.app.resolve,
    {
      bodyLimit: APP_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: APP_RESOLVE_UNAUTHENTICATED_REQUESTS_PER_MINUTE,
          timeWindow: "1 minute",
          allowList: hasValidAppSession,
        },
      },
      // The guard runs in preValidation, after the limiter's onRequest hook, so
      // an anonymous caller is counted before it is refused, and before its body
      // is validated, so the schema never answers somebody without a session.
      preValidation: async (request, reply) => {
        const session = await lookUpSession(request);
        if ("unconfigured" in session) {
          logEntries.set(request, { operation: "resolve", outcome: "unconfigured" });
          return replyWithApiError(reply, "MC-CFG-0001");
        }
        if ("missing" in session) {
          logEntries.set(request, { operation: "resolve", outcome: "refused_session" });
          return replyWithApiError(reply, "MC-AUTH-0005");
        }
        logEntries.set(request, {
          operation: "resolve",
          outcome: "session_valid",
          keyIdHash: keyIdHash(session.keyId),
        });
      },
      schema: {
        hide: true,
        body: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: { query: { type: "string", minLength: 1, maxLength: APP_RESOLVE_QUERY_MAX_LENGTH } },
        },
        response: {
          200: RESOLVE_SUCCESS_RESPONSE_SCHEMA,
          "4xx": { $ref: "ErrorResponse#" },
          "5xx": { $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => respondToResolveRequest(reply, request.body, request.headers.origin),
  );
}

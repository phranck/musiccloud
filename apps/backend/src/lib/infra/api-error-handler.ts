import { randomUUID } from "node:crypto";
import { getErrorEntry } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  classifyUnhandledError,
  createApiErrorResponse,
  normalizeApiErrorPayload,
  sanitizeErrorForLog,
} from "./api-errors.js";

const normalizedRequests = new WeakSet<FastifyRequest>();
const internalErrors = new WeakMap<FastifyRequest, unknown>();
const internalDiagnostics = new WeakMap<FastifyRequest, Record<string, unknown>>();

/**
 * Attaches route-specific operational diagnostics to the request's single
 * canonical failure log. These details never become part of the public error
 * response and must already be safe for structured logging.
 */
export function setApiFailureDiagnostic(request: FastifyRequest, diagnostic: Record<string, unknown>): void {
  internalDiagnostics.set(request, diagnostic);
}

/**
 * Answers with an error from the registry: its code, its own status and its
 * message, rendered from `context`.
 *
 * A route that writes its own `{ error: "<sentence>" }` loses its code to the
 * normalizer, which reads `error` as the code and replaces anything that is not
 * one with the generic code for the status. Answering through the registry is
 * what keeps the code a client, an operator and the request log all see.
 *
 * @param reply - The reply to answer on.
 * @param code - The registry code, for example `MC-BILL-0004`.
 * @param options - `context` fills the message's `{placeholders}` and travels
 *   in the body; `extra` adds fields beside the envelope, such as a list the
 *   client renders.
 * @returns The reply, so a handler can `return` it.
 */
export function replyWithApiError(
  reply: FastifyReply,
  code: string,
  options: { context?: Record<string, string | number>; extra?: Record<string, unknown> } = {},
): FastifyReply {
  return reply
    .status(getErrorEntry(code).httpStatus)
    .send({ ...options.extra, ...createApiErrorResponse(code, { context: options.context }) });
}

export function registerApiErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const classified = classifyUnhandledError(error);
    internalErrors.set(request, error);
    return reply
      .status(classified.statusCode)
      .send(createApiErrorResponse(classified.code, { overrideMessage: classified.message }));
  });

  app.addHook("preSerialization", async (request, reply, payload) => {
    if (reply.statusCode < 400) return payload;

    const errorId = existingErrorId(payload) ?? randomUUID();
    const normalized = normalizeApiErrorPayload(payload, reply.statusCode, errorId);
    normalizedRequests.add(request);
    logApiFailure(request, reply.statusCode, normalized, internalErrors.get(request));
    internalErrors.delete(request);
    return normalized;
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode < 400 || normalizedRequests.has(request)) return payload;

    const input = typeof payload === "string" ? { message: payload } : payload;
    const normalized = normalizeApiErrorPayload(input, reply.statusCode, randomUUID());
    normalizedRequests.add(request);
    logApiFailure(request, reply.statusCode, normalized, internalErrors.get(request));
    internalErrors.delete(request);
    reply.type("application/json; charset=utf-8");
    return JSON.stringify(normalized);
  });
}

function logApiFailure(
  request: FastifyRequest,
  statusCode: number,
  response: { error: unknown; errorId: unknown; message: unknown },
  internalError: unknown,
): void {
  const fields = {
    ...(internalError ? { cause: sanitizeErrorForLog(internalError, process.env.NODE_ENV !== "production") } : {}),
    ...(internalDiagnostics.has(request) ? { diagnostic: internalDiagnostics.get(request) } : {}),
    errorCode: String(response.error),
    errorId: String(response.errorId),
    method: request.method,
    operation: "http_request",
    requestId: request.id,
    route: request.routeOptions.url,
    statusCode,
    userMessage: String(response.message),
  };

  if (statusCode >= 500) {
    request.log.error(fields, "request failed");
  } else {
    request.log.warn(fields, "request rejected");
  }
  internalDiagnostics.delete(request);
}

function existingErrorId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("errorId" in payload)) return undefined;
  return typeof payload.errorId === "string" && payload.errorId ? payload.errorId : undefined;
}

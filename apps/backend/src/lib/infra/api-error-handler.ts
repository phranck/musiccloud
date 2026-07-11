import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  classifyUnhandledError,
  createApiErrorResponse,
  normalizeApiErrorPayload,
  sanitizeErrorForLog,
} from "./api-errors.js";

const normalizedRequests = new WeakSet<FastifyRequest>();
const internalErrors = new WeakMap<FastifyRequest, unknown>();

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
}

function existingErrorId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("errorId" in payload)) return undefined;
  return typeof payload.errorId === "string" && payload.errorId ? payload.errorId : undefined;
}

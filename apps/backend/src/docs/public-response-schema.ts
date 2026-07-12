/**
 * Creates the canonical public API error envelope schema.
 *
 * A factory is used because Fastify may annotate registered schemas. Every
 * isolated app or test host therefore receives its own object while sharing
 * the exact production contract.
 */
export function createPublicErrorResponseSchema() {
  return {
    $id: "ErrorResponse",
    type: "object",
    additionalProperties: true,
    description: "Standard error envelope returned by every v1 endpoint on a non-2xx response.",
    required: ["error", "message", "errorId"],
    properties: {
      error: {
        type: "string",
        description: "Machine-readable canonical MC error code (e.g. MC-URL-0003, MC-API-0003, MC-RES-0001).",
      },
      message: { type: "string", description: "Human-readable error detail." },
      errorId: {
        type: "string",
        format: "uuid",
        description: "Unique incident reference included in the matching structured backend log entry.",
      },
      context: {
        type: "object",
        additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
        description:
          "Optional structured values for clients that localize errors themselves. For `MC-API-0003` rate-limit responses this currently contains `limit`, `windowSeconds`, and `retryAfterSeconds`.",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of allowed requests in the active rate-limit window. Current value: 10.",
          },
          windowSeconds: {
            type: "number",
            description: "Length of the active rate-limit window in seconds. Current value: 60.",
          },
          retryAfterSeconds: {
            type: "number",
            description: "Seconds until the client can retry after a `429 Too Many Requests` response.",
          },
        },
      },
    },
    example: {
      error: "MC-API-0003",
      errorId: "7d33e012-685f-4f11-94da-c6bc72918d7b",
      message:
        "Too many requests. You can make 10 requests per 60 seconds. Please try again in 42 seconds. (MC-API-0003)",
      context: {
        limit: 10,
        retryAfterSeconds: 42,
        windowSeconds: 60,
      },
    },
  } as const;
}

/**
 * Creates a documented Fastify response schema for one explicit public API
 * error branch.
 *
 * The shared `ErrorResponse` schema owns the stable `error`, `message`, and
 * `errorId` envelope. Routes provide only the branch-specific description so
 * the generated OpenAPI contract stays precise without duplicating the wire
 * format.
 */
export function publicErrorResponse(description: string) {
  return { description, $ref: "ErrorResponse#" } as const;
}

/**
 * Creates the successful response schema shared by public health probes.
 * Keeping this shape in one helper prevents six route declarations from
 * drifting while retaining Fastify response serialization.
 */
export function publicHealthSuccessResponse(description: string) {
  return {
    description,
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["ok"] },
    },
  } as const;
}

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
    additionalProperties: false,
    description:
      "Standard public error envelope. Route-specific error schemas add documented fields such as form validation issues or readiness details.",
    required: ["error", "message", "errorId"],
    properties: {
      error: {
        type: "string",
        description:
          "Stable musiccloud error code for programmatic handling, for example `MC-URL-0003`, `MC-API-0003`, or `MC-RES-0001`.",
      },
      message: {
        type: "string",
        description: "Safe English failure detail. The final parenthesized value repeats the `error` code.",
      },
      errorId: {
        type: "string",
        format: "uuid",
        description:
          "Unique incident identifier included in the matching backend log. Send it to musiccloud support when reporting the failure.",
      },
      context: {
        type: "object",
        additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
        description:
          "Optional structured values associated with the error code. For `MC-API-0003`, the object can contain the active limit, window, and retry delay. The key is omitted when no structured values apply.",
        properties: {
          limit: {
            type: "number",
            description:
              "Maximum requests allowed by the rate-limit rule that rejected this request. The key is omitted for non-rate-limit errors.",
          },
          windowSeconds: {
            type: "number",
            description:
              "Length in seconds of the rate-limit window that rejected this request. The key is omitted for non-rate-limit errors.",
          },
          retryAfterSeconds: {
            type: "number",
            description:
              "Seconds until the client can retry after a `429 Too Many Requests` response. The key is omitted when no retry delay applies.",
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
    $ref: "HealthStatusResponse#",
  } as const;
}

/** Creates a documented readiness-failure response with the safe public envelope. */
export function publicHealthUnavailableResponse(description: string) {
  return {
    description,
    $ref: "HealthUnavailableResponse#",
  } as const;
}

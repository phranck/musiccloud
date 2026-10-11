import {
  DEFAULT_STREAM_FORMAT,
  JAMENDO_FORMAT_ORDER,
  type JamendoAudioFormat,
  MC_ERROR_CODE_PATTERN,
} from "@musiccloud/shared";
import { ENTITY_ID_MAX_LENGTH, ID_PATTERN, SHORT_ID_MAX_LENGTH } from "../lib/short-id.js";

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
        pattern: MC_ERROR_CODE_PATTERN.source,
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

/**
 * A share code as a request parameter: one to {@link SHORT_ID_MAX_LENGTH}
 * characters of {@link ID_PATTERN}.
 *
 * Every route that takes a share code declares it through here, so the share
 * routes and `artist-info` accept exactly the same codes, and the public
 * OpenAPI document states one rule.
 *
 * @param description - Where the caller takes the code from on this route.
 * @returns The JSON schema for the parameter.
 */
export function shareCodeSchema(description: string) {
  return {
    type: "string",
    minLength: 1,
    maxLength: SHORT_ID_MAX_LENGTH,
    pattern: ID_PATTERN.source,
    description,
  } as const;
}

/**
 * A normalized artist entity id as a request parameter: one to
 * {@link ENTITY_ID_MAX_LENGTH} characters of {@link ID_PATTERN}.
 *
 * @param description - Where the caller takes the id from, for a public route.
 *   An admin route leaves it out.
 * @returns The JSON schema for the parameter.
 */
export function artistEntityIdSchema(description?: string) {
  return {
    type: "string",
    minLength: 1,
    maxLength: ENTITY_ID_MAX_LENGTH,
    pattern: ID_PATTERN.source,
    ...(description === undefined ? {} : { description }),
  } as const;
}

/** The longest Jamendo track id a route accepts. Jamendo ids are decimal numbers. */
const JAMENDO_ID_MAX_LENGTH = 32;

/**
 * A Jamendo track id as a path parameter, as the three Creative Commons routes
 * that take one declare it.
 *
 * @returns The JSON schema for the parameter.
 */
export function jamendoIdSchema() {
  return {
    type: "string",
    minLength: 1,
    maxLength: JAMENDO_ID_MAX_LENGTH,
    pattern: "^[0-9]+$",
    description:
      "Numeric Jamendo track ID. Read `track.jamendoId`, `album.tracks[].jamendoId`, or `artist.topTracks[].jamendoId` from a successful `POST /api/v1/cc/resolve` or `GET /api/v1/share/{shortId}` response.",
  } as const;
}

/**
 * What a format code delivers, for the codes whose name does not say it. The
 * other codes are listed by name alone.
 */
const JAMENDO_FORMAT_EXPLANATIONS: Partial<Record<JamendoAudioFormat, string>> = {
  mp31: "MP3 96 kbps",
  mp32: "MP3 about 256 kbps",
};

/**
 * The `format` query of the Creative Commons audio and download routes.
 *
 * It declares no `enum`, because an unknown value falls back to
 * {@link DEFAULT_STREAM_FORMAT} through `parseJamendoAudioFormat` rather than
 * being refused. The codes, their order and the default come from
 * `@musiccloud/shared`, so a format added there is documented here as well.
 *
 * @returns The JSON schema for the parameter.
 */
export function jamendoFormatSchema() {
  const codes = JAMENDO_FORMAT_ORDER.map((code) => {
    const explanation = JAMENDO_FORMAT_EXPLANATIONS[code];
    return explanation ? `\`${code}\` (${explanation})` : `\`${code}\``;
  });
  const listed = `${codes.slice(0, -1).join(", ")}, or ${codes[codes.length - 1]}`;
  return {
    type: "string",
    default: DEFAULT_STREAM_FORMAT,
    description: `Jamendo delivery format: ${listed}. Invalid values also fall back to \`${DEFAULT_STREAM_FORMAT}\`.\n\n**Default**: \`${DEFAULT_STREAM_FORMAT}\`.`,
  } as const;
}

/**
 * @file Parses a structured-search query for a resolve route and answers a
 * malformed one, so every route rejects the same syntax with the same reply.
 */
import type { FastifyReply } from "fastify";
import { createApiErrorResponse } from "../../lib/infra/api-errors.js";
import { type ParsedStructuredQuery, parseStructuredSearchQuery, StructuredSearchQueryParseError } from "./parser.js";

/** HTTP status of the reply to a malformed structured query. */
const MALFORMED_QUERY_STATUS = 400;

/** Error code of the reply to a malformed structured query. */
const MALFORMED_QUERY_CODE = "INVALID_URL";

/**
 * Parses a structured-search query, or answers the request when the query is
 * malformed.
 *
 * @param query - The trimmed query, already detected by `isStructuredSearchQuery`.
 * @param reply - The reply to answer on when the query is malformed.
 * @returns The parsed query, or `null` once the reply has been sent as a
 *   `400 INVALID_URL` carrying the parser's message. The caller returns the
 *   reply on `null`.
 * @throws Whatever the parser throws other than a `StructuredSearchQueryParseError`.
 */
export function parseStructuredQueryOrReply(query: string, reply: FastifyReply): ParsedStructuredQuery | null {
  try {
    return parseStructuredSearchQuery(query);
  } catch (error) {
    if (error instanceof StructuredSearchQueryParseError) {
      reply
        .status(MALFORMED_QUERY_STATUS)
        .send(createApiErrorResponse(MALFORMED_QUERY_CODE, { overrideMessage: error.message }));
      return null;
    }
    throw error;
  }
}

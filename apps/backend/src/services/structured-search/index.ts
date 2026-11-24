/**
 * @file Public entry point for the structured-search feature.
 *
 * Mirrors the bauform of services/genre-search/index.ts. Re-exports the
 * detector and the parser for the resolver layer, and the route-side
 * parse-or-reply helper for the resolve routes. Keep imports stable so callers
 * do not need to know whether the symbol lives in parser.ts or somewhere else.
 */

export { isStructuredSearchQuery, parseStructuredSearchQuery } from "./parser.js";
export { parseStructuredQueryOrReply } from "./reply.js";

/**
 * @file Public entry point for the structured-search feature.
 *
 * Mirrors the bauform of services/genre-search/index.ts. Re-exports the
 * parser, detector, and error class for use from routes and the resolver
 * layer. Keep imports stable so callers do not need to know whether the
 * symbol lives in parser.ts or somewhere else.
 */

export type { ParsedStructuredQuery } from "./parser.js";
export {
  isStructuredSearchQuery,
  parseStructuredSearchQuery,
  StructuredSearchQueryParseError,
} from "./parser.js";

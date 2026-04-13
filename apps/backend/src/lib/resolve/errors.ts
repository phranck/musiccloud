import type { ErrorCode, ServiceId } from "@musiccloud/shared";

export type { ErrorCode } from "@musiccloud/shared";
// Re-export shared error types for convenience
export { ERROR_STATUS_MAP, USER_MESSAGES } from "@musiccloud/shared";

export class ServiceError extends Error {
  constructor(
    public readonly service: ServiceId,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/**
 * Error thrown by the resolver / adapters when a user-facing failure needs to
 * be surfaced.
 *
 * `code` accepts either an MC error code (`MC-URL-0001`) from the registry in
 * `@musiccloud/shared/error-codes` or a legacy code (`UNSUPPORTED_SERVICE`,
 * `TRACK_NOT_FOUND`, …) for backwards compatibility during the Phase 2 sweep.
 *
 * `context` is an optional key/value map substituted into the registry's
 * templated `userMessage` (e.g. `{ storefront: "us", id: "123" }` feeds a
 * message like `"... in the {storefront} region"`).
 *
 * The optional `message` argument overrides the registry's default message
 * but still gets the canonical code appended by `formatUserMessage` in the
 * route handler.
 */
export class ResolveError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
    public readonly context?: Record<string, string | number>,
  ) {
    super(message ?? "");
    this.name = "ResolveError";
  }
}

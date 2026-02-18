import type { ErrorCode, ServiceId } from "@musiccloud/shared";

// Re-export shared error types for convenience
export { ERROR_STATUS_MAP, USER_MESSAGES } from "@musiccloud/shared";
export type { ErrorCode } from "@musiccloud/shared";

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

export class ResolveError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResolveError";
  }
}

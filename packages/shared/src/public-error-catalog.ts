import { ERROR_CODE_REGISTRY, type McErrorCode } from "./error-codes.js";

export { MC_ERROR_CODE_PATTERN } from "./error-codes.js";

export interface PublicErrorCodeEntry {
  readonly code: McErrorCode;
  readonly httpStatus: number;
  readonly message: string;
}

export const PUBLIC_ERROR_CODE_CATALOG: readonly PublicErrorCodeEntry[] = Object.freeze(
  Object.values(ERROR_CODE_REGISTRY)
    .map((entry) =>
      Object.freeze({
        code: entry.code,
        httpStatus: entry.httpStatus,
        message: entry.userMessage,
      }),
    )
    .sort((left, right) => left.code.localeCompare(right.code)),
);

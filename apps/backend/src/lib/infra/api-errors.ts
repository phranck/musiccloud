import { randomUUID } from "node:crypto";
import {
  type ApiErrorResponse,
  formatUserMessage,
  getErrorEntry,
  LEGACY_TO_MC,
  MC_ERROR_CODE_PATTERN,
  type McErrorCode,
} from "@musiccloud/shared";

export interface ClassifiedApiError {
  code: McErrorCode;
  message: string;
  statusCode: number;
}

type ErrorPayload = Record<string, unknown>;

const POSTGRES_SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

export function classifyUnhandledError(error: unknown): ClassifiedApiError {
  if (isObject(error) && Array.isArray(error.validation)) {
    return classified("MC-REQ-0001", 400);
  }

  const sqlState = postgresSqlState(error);
  if (sqlState === "42501") return classified("MC-DB-0001", 500);
  if (sqlState === "42P01") return classified("MC-DB-0002", 500);
  if (sqlState?.startsWith("08")) return classified("MC-DB-0003", 503);
  if (sqlState) return classified("MC-DB-0004", 500);

  const frameworkStatus = httpStatus(error);
  if (frameworkStatus) {
    return classified(canonicalPayloadCode(undefined, frameworkStatus), frameworkStatus);
  }

  return classified("MC-SYS-0001", 500);
}

export function normalizeApiErrorPayload(
  payload: unknown,
  statusCode: number,
  errorId: string,
): ApiErrorResponse & ErrorPayload {
  const objectPayload = isObject(payload) ? payload : {};
  const rawError = typeof objectPayload.error === "string" ? objectPayload.error : undefined;
  const code = canonicalPayloadCode(rawError, statusCode);
  const authoredMessage =
    typeof objectPayload.message === "string"
      ? objectPayload.message
      : rawError && !isMachineCode(rawError)
        ? rawError
        : undefined;
  const message = ensureCodeSuffix(authoredMessage ?? getErrorEntry(code).userMessage, code);
  const { error: _error, errorId: _errorId, message: _message, ...additional } = objectPayload;

  return { ...additional, error: code, errorId, message } as ApiErrorResponse & ErrorPayload;
}

export function createApiErrorResponse(
  code: string,
  options: {
    context?: Record<string, string | number>;
    errorId?: string;
    overrideMessage?: string;
  } = {},
): ApiErrorResponse {
  const entry = getErrorEntry(code);
  return {
    error: entry.code,
    errorId: options.errorId ?? randomUUID(),
    message: formatUserMessage(entry.code, options.context, options.overrideMessage),
    ...(options.context ? { context: options.context } : {}),
  };
}

export function sanitizeErrorForLog(
  error: unknown,
  includeStack: boolean,
): { code?: string; message: string; name: string; stack?: string } {
  const value = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const code = isObject(error) && typeof error.code === "string" ? error.code : undefined;
  const result: { code?: string; message: string; name: string; stack?: string } = {
    ...(code ? { code } : {}),
    message: redactSecrets(value.message),
    name: value.name,
  };
  if (includeStack && value.stack) result.stack = redactSecrets(value.stack);
  return result;
}

function classified(code: McErrorCode, statusCode: number): ClassifiedApiError {
  return { code, message: getErrorEntry(code).userMessage, statusCode };
}

function canonicalPayloadCode(rawError: string | undefined, statusCode: number): McErrorCode {
  if (rawError && (MC_ERROR_CODE_PATTERN.test(rawError) || rawError in LEGACY_TO_MC)) {
    return getErrorEntry(rawError).code;
  }
  if (statusCode === 401) return "MC-AUTH-0001";
  if (statusCode === 403) return "MC-AUTH-0002";
  if (statusCode === 404) return "MC-RES-0003";
  if (statusCode === 408) return "MC-API-0005";
  if (statusCode === 409) return "MC-REQ-0002";
  if (statusCode === 429) return "MC-API-0003";
  if (statusCode === 400 || statusCode === 405 || statusCode === 413 || statusCode === 415 || statusCode === 422) {
    return "MC-REQ-0001";
  }
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) return "MC-API-0001";
  return "MC-SYS-0001";
}

function ensureCodeSuffix(message: string, code: McErrorCode): string {
  return message.includes(`(${code})`) ? message : `${message} (${code})`;
}

function isMachineCode(value: string): boolean {
  return MC_ERROR_CODE_PATTERN.test(value) || value in LEGACY_TO_MC || /^[A-Z][A-Z0-9_]+$/.test(value);
}

function postgresSqlState(error: unknown): string | undefined {
  if (!isObject(error) || typeof error.code !== "string") return undefined;
  return POSTGRES_SQLSTATE_PATTERN.test(error.code) ? error.code : undefined;
}

function httpStatus(error: unknown): number | undefined {
  if (!isObject(error) || typeof error.statusCode !== "number") return undefined;
  return Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
    ? error.statusCode
    : undefined;
}

function redactSecrets(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/\b(password|passwd|token|secret|api[_-]?key)=([^\s&]+)/gi, "$1=[REDACTED]");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

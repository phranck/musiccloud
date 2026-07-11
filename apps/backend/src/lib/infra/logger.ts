/**
 * Dev/prod-aware logger with structured production output and redaction.
 *
 * Production warnings and errors are emitted as one JSON object per line so
 * Zerops log search can correlate component, operation, error code and outcome.
 * Stack traces and credentials never enter production records.
 */

const isDev = process.env.NODE_ENV !== "production";

export interface DeviationLogContext {
  component: string;
  errorCode: string;
  operation: string;
  outcome: string;
  [key: string]: unknown;
}

const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"']+/gi;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/-]+=*/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b(password|token|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi;
const LEGACY_DEVIATION_PATTERN = /\b(error|fail(?:ed|ure)?|missing|threw|timeout|unavailable)\b/i;

function redactString(value: string): string {
  return value
    .replace(DATABASE_URL_PATTERN, "[REDACTED_DATABASE_URL]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[REDACTED]");
}

function safeValue(value: unknown): unknown {
  if (value instanceof Error) return redactString(value.message);
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /password|token|secret|api.?key|authorization/i.test(key) ? "[REDACTED]" : safeValue(entry),
      ]),
    );
  }
  return value;
}

function printable(value: unknown): string {
  const safe = safeValue(value);
  if (typeof safe === "string") return safe;
  try {
    return JSON.stringify(safe);
  } catch {
    return String(safe);
  }
}

function normalizeLegacyArgs(args: unknown[]): { component: string; message: string; context?: unknown } {
  const [first, ...rest] = args;
  if (typeof first === "string") {
    return { component: first, message: rest.map(printable).join(" ") };
  }

  const [message, ...tail] = rest;
  return {
    component: "Backend",
    message: [message, ...tail].map(printable).join(" "),
    ...(first && typeof first === "object" ? { context: safeValue(first) } : {}),
  };
}

function emit(level: "warn" | "error", args: unknown[]): void {
  const normalized = normalizeLegacyArgs(args);
  if (isDev) {
    const target = level === "warn" ? console.warn : console.error;
    target(`[${normalized.component}]`, normalized.message, ...(normalized.context ? [normalized.context] : []));
    return;
  }

  const record = {
    timestamp: new Date().toISOString(),
    level,
    component: normalized.component,
    message: normalized.message,
    ...(normalized.context ? { context: normalized.context } : {}),
  };
  const target = level === "warn" ? console.warn : console.error;
  target(JSON.stringify(record));
}

export const log = {
  debug(tag: string, ...args: unknown[]): void {
    if (isDev) {
      console.log(`[${tag}]`, ...args.map(safeValue));
      return;
    }

    const message = args.map(printable).join(" ");
    if (LEGACY_DEVIATION_PATTERN.test(message)) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "warn",
          component: tag,
          errorCode: "MC-SYS-0001",
          operation: "legacy_debug_deviation",
          outcome: "fallback_or_omission",
          message,
        }),
      );
    }
  },
  warn(...args: unknown[]): void {
    emit("warn", args);
  },
  error(...args: unknown[]): void {
    emit("error", args);
  },
  deviation(context: DeviationLogContext, error?: unknown): void {
    const record = {
      timestamp: new Date().toISOString(),
      level: "warn",
      ...(safeValue(context) as DeviationLogContext),
      ...(typeof error === "undefined" ? {} : { cause: safeValue(error) }),
    };
    if (isDev) {
      console.warn(`[${context.component}]`, record);
    } else {
      console.warn(JSON.stringify(record));
    }
  },
};

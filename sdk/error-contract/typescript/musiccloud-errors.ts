export const MusiccloudErrorCode = {
  authenticationRequired: "MC-AUTH-0001",
  permissionDenied: "MC-AUTH-0002",
  rateLimited: "MC-API-0003",
  requestTimeout: "MC-API-0005",
  invalidRequest: "MC-REQ-0001",
  requestConflict: "MC-REQ-0002",
  resourceNotFound: "MC-RES-0003",
  unexpectedServerError: "MC-SYS-0001",
  backendUnavailable: "MC-SYS-0002",
} as const;

export type MusiccloudKnownErrorCode =
  (typeof MusiccloudErrorCode)[keyof typeof MusiccloudErrorCode];
export type MusiccloudErrorContext = Readonly<Record<string, string | number>>;
export type MusiccloudProtocolErrorReason =
  | "empty-body"
  | "unexpected-content-type"
  | "invalid-json"
  | "invalid-envelope";
export type MusiccloudTransportErrorKind =
  | "cancelled"
  | "timeout"
  | "dns"
  | "tls"
  | "network";

export interface MusiccloudErrorResponseInput {
  readonly status: number;
  readonly headers?: HeaderSource;
  readonly body: string;
}

type HeaderSource =
  | Readonly<Record<string, string>>
  | { forEach(callback: (value: string, key: string) => void): void };

const MC_ERROR_CODE_PATTERN = /^MC-(URL|API|AUTH|RES|DB|CFG|MAP|REQ|SYS)-\d{3,4}$/;
const ERROR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETRY_HEADER_NAMES = new Set([
  "retry-after",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
]);
const SENSITIVE_CONTEXT_KEY = /authorization|dpop|api[-_]?key|private[-_]?key|password|secret|token/i;

export class MusiccloudApiError extends Error {
  readonly code: string;
  readonly errorId: string;
  readonly status: number;
  readonly context?: MusiccloudErrorContext;
  readonly retryHeaders: Readonly<Record<string, string>>;

  constructor(options: {
    code: string;
    message: string;
    errorId: string;
    status: number;
    context?: MusiccloudErrorContext;
    retryHeaders?: Readonly<Record<string, string>>;
  }) {
    super(options.message);
    this.name = "MusiccloudApiError";
    this.code = options.code;
    this.errorId = options.errorId;
    this.status = options.status;
    this.context = options.context;
    this.retryHeaders = options.retryHeaders ?? Object.freeze({});
  }

  get isAuthenticationError(): boolean {
    return this.status === 401 || this.status === 403 || this.code.startsWith("MC-AUTH-");
  }

  get isRateLimitError(): boolean {
    return this.status === 429 || this.code === MusiccloudErrorCode.rateLimited;
  }

  get isRetryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }

  get retryAfterSeconds(): number | undefined {
    return parseNonNegativeNumber(this.retryHeaders["retry-after"] ?? this.context?.retryAfterSeconds);
  }

  override toString(): string {
    return `${this.name}: ${this.message} [${this.code}; errorId=${this.errorId}; status=${this.status}]`;
  }
}

export class MusiccloudProtocolError extends Error {
  readonly status: number;
  readonly reason: MusiccloudProtocolErrorReason;
  readonly bodyLength: number;
  readonly contentType?: string;

  constructor(status: number, reason: MusiccloudProtocolErrorReason, bodyLength: number, contentType?: string) {
    super(`MusicCloud returned an invalid error response (${reason}; status=${status}).`);
    this.name = "MusiccloudProtocolError";
    this.status = status;
    this.reason = reason;
    this.bodyLength = bodyLength;
    this.contentType = contentType;
  }
}

export class MusiccloudTransportError extends Error {
  readonly kind: MusiccloudTransportErrorKind;

  constructor(kind: MusiccloudTransportErrorKind) {
    super(`The MusicCloud request failed before an HTTP error response was received (${kind}).`);
    this.name = "MusiccloudTransportError";
    this.kind = kind;
  }
}

export function parseMusiccloudErrorResponse(
  input: MusiccloudErrorResponseInput,
): MusiccloudApiError | MusiccloudProtocolError {
  const headers = normalizeHeaders(input.headers);
  const contentType = headers["content-type"];
  const body = input.body.trim();
  if (body.length === 0) {
    return new MusiccloudProtocolError(input.status, "empty-body", input.body.length, contentType);
  }

  if (contentType !== undefined && !contentType.toLowerCase().includes("json")) {
    return new MusiccloudProtocolError(input.status, "unexpected-content-type", input.body.length, contentType);
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return new MusiccloudProtocolError(input.status, "invalid-json", input.body.length, contentType);
  }

  if (!isErrorEnvelope(value)) {
    return new MusiccloudProtocolError(input.status, "invalid-envelope", input.body.length, contentType);
  }

  return new MusiccloudApiError({
    code: value.error,
    message: value.message,
    errorId: value.errorId,
    status: input.status,
    context: sanitizeContext(value.context),
    retryHeaders: selectRetryHeaders(headers),
  });
}

export async function musiccloudErrorFromResponse(
  response: Response,
): Promise<MusiccloudApiError | MusiccloudProtocolError | MusiccloudTransportError> {
  let body: string;
  try {
    body = await response.text();
  } catch (cause) {
    return classifyMusiccloudTransportError(cause);
  }
  return parseMusiccloudErrorResponse({
    status: response.status,
    headers: response.headers,
    body,
  });
}

export function classifyMusiccloudTransportError(cause: unknown): MusiccloudTransportError {
  const markers = collectMarkers(cause);
  const names = markers.map((marker) => marker.name?.toUpperCase() ?? "");
  const codes = markers.map((marker) => marker.code?.toUpperCase() ?? "");

  if (names.some((name) => name === "ABORTERROR") || codes.some((code) => code === "ABORT_ERR")) {
    return new MusiccloudTransportError("cancelled");
  }
  if (names.some((name) => name === "TIMEOUTERROR") || codes.some((code) => code === "ETIMEDOUT" || code.includes("TIMEOUT"))) {
    return new MusiccloudTransportError("timeout");
  }
  if (codes.some((code) => code === "ENOTFOUND" || code === "EAI_AGAIN")) {
    return new MusiccloudTransportError("dns");
  }
  if (
    codes.some(
      (code) =>
        code.startsWith("CERT_") ||
        code.startsWith("ERR_TLS") ||
        code.startsWith("ERR_SSL") ||
        code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
        code === "DEPTH_ZERO_SELF_SIGNED_CERT",
    )
  ) {
    return new MusiccloudTransportError("tls");
  }
  return new MusiccloudTransportError("network");
}

function collectMarkers(value: unknown): Array<{ name?: string; code?: string }> {
  const markers: Array<{ name?: string; code?: string }> = [];
  const seen = new Set<object>();
  let current = value;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    markers.push({
      name: typeof record.name === "string" ? record.name : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
    });
    current = record.cause;
  }
  return markers;
}

function isErrorEnvelope(value: unknown): value is {
  error: string;
  message: string;
  errorId: string;
  context?: unknown;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.error === "string" &&
    MC_ERROR_CODE_PATTERN.test(record.error) &&
    typeof record.message === "string" &&
    record.message.length > 0 &&
    typeof record.errorId === "string" &&
    ERROR_ID_PATTERN.test(record.errorId) &&
    isValidContext(record.context)
  );
}

function isValidContext(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every((key) => {
    const item = record[key];
    return typeof item === "string" || typeof item === "number";
  });
}

function sanitizeContext(value: unknown): MusiccloudErrorContext | undefined {
  if (value === undefined || typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const context: Record<string, string | number> = {};
  for (const key of Object.keys(source)) {
    const item = source[key];
    if (SENSITIVE_CONTEXT_KEY.test(key)) continue;
    if (typeof item === "string" || typeof item === "number") context[key] = item;
  }
  return Object.keys(context).length === 0 ? undefined : Object.freeze(context);
}

function normalizeHeaders(source?: HeaderSource): Record<string, string> {
  const headers: Record<string, string> = {};
  if (source === undefined) return headers;
  if ("forEach" in source && typeof source.forEach === "function") {
    source.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return headers;
  }
  const record = source as Readonly<Record<string, string>>;
  for (const key of Object.keys(record)) headers[key.toLowerCase()] = record[key];
  return headers;
}

function selectRetryHeaders(headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const selected: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    if (RETRY_HEADER_NAMES.has(key)) selected[key] = headers[key];
  }
  return Object.freeze(selected);
}

function parseNonNegativeNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

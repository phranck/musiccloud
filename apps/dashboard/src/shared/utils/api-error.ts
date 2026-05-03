export interface ApiRequestError extends Error {
  status?: number;
  responseMessage?: string | null;
  details?: unknown[] | null;
}

interface HttpResponseLike {
  status: number;
  json: () => Promise<unknown>;
}

function getObjectValue(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== "object") return undefined;
  return key in payload ? (payload as Record<string, unknown>)[key] : undefined;
}

export function extractApiErrorMessage(payload: unknown): string | null {
  const error = getObjectValue(payload, "error");
  const directMessage = getObjectValue(error, "message");
  if (typeof directMessage === "string") {
    return directMessage;
  }

  const issues = getObjectValue(error, "issues");
  if (Array.isArray(issues)) {
    const firstIssue = issues[0];
    const issueMessage = getObjectValue(firstIssue, "message");
    if (typeof issueMessage === "string") {
      return issueMessage;
    }
  }

  const fallbackMessage = getObjectValue(payload, "message");
  return typeof fallbackMessage === "string" ? fallbackMessage : null;
}

export function extractApiErrorDetails(payload: unknown): unknown[] | null {
  const direct = getObjectValue(payload, "details");
  if (Array.isArray(direct)) return direct;
  const error = getObjectValue(payload, "error");
  const nested = getObjectValue(error, "details");
  if (Array.isArray(nested)) return nested;
  return null;
}

export async function createApiRequestError(
  response: HttpResponseLike,
  fallbackMessage?: string,
): Promise<ApiRequestError> {
  const payload = await response.json().catch(() => null);
  const responseMessage = extractApiErrorMessage(payload);
  const message = responseMessage ?? fallbackMessage ?? `HTTP ${response.status}`;
  const error = new Error(message) as ApiRequestError;
  error.status = response.status;
  error.responseMessage = responseMessage;
  error.details = extractApiErrorDetails(payload);
  return error;
}

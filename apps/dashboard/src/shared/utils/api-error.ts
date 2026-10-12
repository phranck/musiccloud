import { parseApiErrorResponse } from "@musiccloud/shared";

export interface ApiRequestError extends Error {
  status?: number;
  responseMessage?: string | null;
  details?: unknown[] | null;
  errorCode?: string | null;
  errorId?: string | null;
}

interface HttpResponseLike {
  status: number;
  json: () => Promise<unknown>;
}

/**
 * The `details` list a validation failure carries beside the error fields, such
 * as the entries a Developer Portal page was refused for.
 */
function extractApiErrorDetails(payload: unknown): unknown[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const details = (payload as Record<string, unknown>).details;
  return Array.isArray(details) ? details : null;
}

/**
 * Builds the error a dashboard request throws for a failed response.
 *
 * The code, the message and the error ID are read through the shared parser,
 * so the dashboard treats a missing or malformed field the way the site and the
 * developer portal do. A response without a message, such as a gateway's error
 * page, takes the caller's fallback and then the status line.
 *
 * @param response - The failed response, or anything with its status and body.
 * @param fallbackMessage - The message to use when the response carried none.
 * @returns The error, with the response's fields attached.
 */
export async function createApiRequestError(
  response: HttpResponseLike,
  fallbackMessage?: string,
): Promise<ApiRequestError> {
  const payload = await response.json().catch(() => null);
  const body = parseApiErrorResponse(payload);
  const responseMessage = body.message ?? null;
  const error = new Error(responseMessage ?? fallbackMessage ?? `HTTP ${response.status}`) as ApiRequestError;
  error.status = response.status;
  error.responseMessage = responseMessage;
  error.details = extractApiErrorDetails(payload);
  error.errorCode = body.error ?? null;
  error.errorId = body.errorId ?? null;
  return error;
}

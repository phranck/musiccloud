import { createApiRequestError } from "@/shared/utils/api-error";

const API_BASE = "/api";
const FETCH_TIMEOUT_MS = 30_000;
const ADMIN_STORAGE_KEY = "admin_token";

/**
 * Resolve a caller-supplied path to a full URL.
 *
 * - Paths from `@musiccloud/shared`'s ENDPOINTS already start with `/api/`
 *   and are used verbatim.
 * - Legacy callers that still pass a leading-slash path without the `/api`
 *   prefix (e.g. `"/admin/users"`) get the prefix prepended for backwards
 *   compatibility while the migration is in progress.
 */
function resolvePath(path: string): string {
  return path.startsWith("/api/") ? path : `${API_BASE}${path}`;
}

function getAuthHeaders(): Record<string, string> {
  try {
    const stored = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!stored) return {};
    const { token } = JSON.parse(stored) as { token: string };
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw await createApiRequestError(res);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: <T>(path: string): Promise<T> =>
    fetchWithTimeout(resolvePath(path), {
      headers: { ...getAuthHeaders() },
    }).then((r) => handleResponse<T>(r)),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    fetchWithTimeout(resolvePath(path), {
      method: "POST",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...getAuthHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r)),

  patch: <T>(path: string, body: unknown): Promise<T> =>
    fetchWithTimeout(resolvePath(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r)),

  put: <T>(path: string, body: unknown): Promise<T> =>
    fetchWithTimeout(resolvePath(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r)),

  delete: <T>(path: string, body?: unknown): Promise<T> =>
    fetchWithTimeout(resolvePath(path), {
      method: "DELETE",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...getAuthHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r)),

  upload: <T>(path: string, formData: FormData): Promise<T> =>
    fetchWithTimeout(resolvePath(path), {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    }).then((r) => handleResponse<T>(r)),
};

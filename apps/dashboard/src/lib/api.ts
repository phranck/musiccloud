import { createApiRequestError } from "@/shared/utils/api-error";

const API_BASE = "/api";
const FETCH_TIMEOUT_MS = 30_000;
const TOKEN_KEY = "admin_token";

function getAuthHeaders(): Record<string, string> {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
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
    fetchWithTimeout(`${API_BASE}${path}`, {
      headers: { ...getAuthHeaders() },
    }).then((r) => handleResponse<T>(r)),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    fetchWithTimeout(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r)),

  patch: <T>(path: string, body: unknown): Promise<T> =>
    fetchWithTimeout(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r)),

  put: <T>(path: string, body: unknown): Promise<T> =>
    fetchWithTimeout(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handleResponse<T>(r)),

  delete: <T>(path: string, body?: unknown): Promise<T> =>
    fetchWithTimeout(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...getAuthHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r)),

  upload: <T>(path: string, formData: FormData): Promise<T> =>
    fetchWithTimeout(`${API_BASE}${path}`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    }).then((r) => handleResponse<T>(r)),
};

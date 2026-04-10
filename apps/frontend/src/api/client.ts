import type { SharePageResponse } from "@musiccloud/shared";

const BACKEND_URL =
  (import.meta.env.BACKEND_URL as string | undefined) ?? process.env.BACKEND_URL ?? "http://localhost:4000";
const INTERNAL_API_KEY = (import.meta.env.INTERNAL_API_KEY as string | undefined) ?? process.env.INTERNAL_API_KEY ?? "";

function backendUrl(path: string): string {
  return `${BACKEND_URL}${path}`;
}

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function internalHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(INTERNAL_API_KEY ? { "X-API-Key": INTERNAL_API_KEY } : {}),
    ...extra,
  };
}

/** Fetch share page data (track or album) by shortId from the backend. */
export async function fetchShareData(shortId: string): Promise<SharePageResponse | null> {
  try {
    const res = await fetchWithTimeout(
      backendUrl(`/api/v1/share/${encodeURIComponent(shortId)}`),
      { headers: internalHeaders(), cache: "no-store" },
      5000,
    );
    if (!res.ok) return null;
    return res.json() as Promise<SharePageResponse>;
  } catch {
    return null;
  }
}

/** Forward a resolve request to the backend. */
export async function resolveTrack(
  body: { query?: string; selectedCandidate?: string },
  clientIp?: string,
): Promise<Response> {
  return fetchWithTimeout(
    backendUrl("/api/v1/resolve"),
    {
      method: "POST",
      headers: internalHeaders(clientIp ? { "X-Forwarded-For": clientIp } : undefined),
      body: JSON.stringify(body),
    },
    15000,
  );
}

/** Check if website tracking (Umami) is enabled via environment variable. */
export function isTrackingEnabled(): boolean {
  const val =
    (import.meta.env.TRACKING_ENABLED as string | undefined) ?? process.env.TRACKING_ENABLED ?? "true";
  return val === "true";
}

/** Fetch a random short ID from the backend for the landing page example teaser. */
export async function fetchRandomExample(): Promise<{ shortId: string } | null> {
  try {
    const res = await fetchWithTimeout(
      backendUrl("/api/v1/random-example"),
      { headers: internalHeaders() },
      3000,
    );
    if (!res.ok) return null;
    return res.json() as Promise<{ shortId: string }>;
  } catch {
    return null;
  }
}

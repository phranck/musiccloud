import type { SharePageResponse } from "@musiccloud/shared";

const BACKEND_URL = import.meta.env.BACKEND_URL ?? "http://localhost:4000";
const INTERNAL_API_KEY = import.meta.env.INTERNAL_API_KEY ?? "";

function backendUrl(path: string): string {
  return `${BACKEND_URL}${path}`;
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
  const res = await fetch(backendUrl(`/api/v1/share/${encodeURIComponent(shortId)}`), {
    headers: internalHeaders(),
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  return res.json() as Promise<SharePageResponse>;
}

/** Forward a resolve request to the backend. */
export async function resolveTrack(
  body: { query?: string; selectedCandidate?: string },
  clientIp?: string,
): Promise<Response> {
  return fetch(backendUrl("/api/v1/resolve"), {
    method: "POST",
    headers: internalHeaders(clientIp ? { "X-Forwarded-For": clientIp } : undefined),
    body: JSON.stringify(body),
  });
}

/** Forward an album resolve request to the backend. */
export async function resolveAlbum(
  body: { query?: string },
  clientIp?: string,
): Promise<Response> {
  return fetch(backendUrl("/api/v1/resolve-album"), {
    method: "POST",
    headers: internalHeaders(clientIp ? { "X-Forwarded-For": clientIp } : undefined),
    body: JSON.stringify(body),
  });
}

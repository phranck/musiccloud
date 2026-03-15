import type { APIRoute } from "astro";
import { resolveTrack } from "@/api/client";

export const prerender = false;

function isUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

export const GET: APIRoute = async ({ url, clientAddress }) => {
  const rawUrl = url.searchParams.get("url")?.trim();

  if (!rawUrl || !isUrl(rawUrl)) {
    return redirectTo("/");
  }

  try {
    const res = await resolveTrack({ query: rawUrl }, clientAddress);

    if (!res.ok) {
      return redirectTo("/");
    }

    const data = (await res.json()) as { shortUrl?: string };

    if (!data.shortUrl) {
      return redirectTo("/");
    }

    const shareUrl = new URL(data.shortUrl);
    return redirectTo(shareUrl.pathname);
  } catch {
    return redirectTo("/");
  }
};

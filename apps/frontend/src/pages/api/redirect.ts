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

export const GET: APIRoute = async ({ url, clientAddress }) => {
  const rawUrl = url.searchParams.get("url")?.trim();

  if (!rawUrl || !isUrl(rawUrl)) {
    return Response.redirect("/", 302);
  }

  try {
    const res = await resolveTrack({ query: rawUrl }, clientAddress);

    if (!res.ok) {
      return Response.redirect("/", 302);
    }

    const data = await res.json() as { shortUrl?: string; status?: string };

    if (data.status !== "success" || !data.shortUrl) {
      return Response.redirect("/", 302);
    }

    const shareUrl = new URL(data.shortUrl);
    return Response.redirect(shareUrl.pathname, 302);
  } catch {
    return Response.redirect("/", 302);
  }
};

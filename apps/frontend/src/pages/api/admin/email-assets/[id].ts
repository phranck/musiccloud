import type { APIRoute } from "astro";
import { fetchEmailAsset } from "@/api/client";

export const prerender = false;

/**
 * Astro proxy for backend `/api/admin/email-assets/:id` (MC-079).
 *
 * The backend is not publicly reachable in prod — every backend route the
 * public domain exposes goes through an Astro proxy like this one. Sent emails
 * embed `${PUBLIC_URL}/api/admin/email-assets/:id` as absolute image URLs
 * (header/footer/body images + the day/night page background), and a
 * recipient's mail client fetches those against the public domain. Without this
 * route that domain 404s them and every image renders broken. Streams the image
 * binary straight through, preserving the immutable Cache-Control so mail
 * clients and edge caches hold on to it.
 *
 * (Local test-sends to a real inbox still cannot show these images: the URL
 * then points at `localhost`, which the recipient's client — e.g. Apple Mail's
 * privacy proxy — cannot reach. That is inherent to URL-referenced images and
 * unrelated to this route.)
 */
export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? "";
  if (!id) return new Response(null, { status: 400 });

  try {
    const res = await fetchEmailAsset(id);
    if (!res.ok) return new Response(null, { status: res.status });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
        "Cache-Control": res.headers.get("Cache-Control") ?? "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};

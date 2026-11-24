import { resolveTrack } from "@/api/client";
import { createResolveRoute } from "@/api/proxy-response";

export const prerender = false;

/** Astro proxy for the backend's commercial resolve route, built by `createResolveRoute`. */
export const POST = createResolveRoute(resolveTrack);

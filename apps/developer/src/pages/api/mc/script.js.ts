/**
 * @file Serves the Umami script from the portal's own origin (`/api/mc/script.js`),
 * which the gate pages load too. The shared proxy says why tracking runs
 * through first-party paths.
 */
import { proxyUmamiScript } from "@musiccloud/shared";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = () => proxyUmamiScript();

/**
 * @file Accepts Umami events on the portal's own origin (`/api/mc/api/send`).
 * The shared proxy forwards them with the visitor's address where Umami reads
 * it, and its file header says why that takes vendor headers.
 */
import { proxyUmamiEvent } from "@musiccloud/shared";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = ({ request, clientAddress }) => proxyUmamiEvent(request, clientAddress);

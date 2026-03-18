import { defineMiddleware } from "astro:middleware";

const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url.pathname;

  // Proxy /api/ requests to backend
  if (url.startsWith("/api/")) {
    const backendPath = url + context.url.search;
    const proxyUrl = new URL(backendPath, backendUrl);

    try {
      const response = await fetch(proxyUrl.toString(), {
        method: context.request.method,
        headers: context.request.headers,
        body: context.request.method !== "GET" ? context.request.body : undefined,
      });

      return response;
    } catch (error) {
      console.error("[Middleware] Proxy error:", error);
      return new Response("Backend unavailable", { status: 503 });
    }
  }

  // Otherwise, serve the Astro app
  return next();
});

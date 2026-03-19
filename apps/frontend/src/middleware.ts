import { defineMiddleware } from "astro:middleware";

const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
const internalApiKey = process.env.INTERNAL_API_KEY || "";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url.pathname;

  // Proxy /api/ requests to backend
  if (url.startsWith("/api/")) {
    // Rewrite public API paths to include /v1/ prefix
    // (admin and auth routes already have their correct prefix)
    let backendPath = url;
    if (!url.startsWith("/api/v1/") && !url.startsWith("/api/admin/") && !url.startsWith("/api/auth/")) {
      backendPath = url.replace("/api/", "/api/v1/");
    }

    const proxyUrl = new URL(backendPath + context.url.search, backendUrl);

    try {
      // Build clean headers for the backend request
      const headers = new Headers();
      headers.set("Content-Type", context.request.headers.get("Content-Type") || "application/json");

      // Forward client IP for rate limiting
      const clientIp = context.request.headers.get("X-Forwarded-For") || context.clientAddress;
      if (clientIp) {
        headers.set("X-Forwarded-For", clientIp);
      }
      headers.set("X-Forwarded-Host", context.url.host);

      // Add internal API key for backend authentication
      if (internalApiKey) {
        headers.set("X-API-Key", internalApiKey);
      }

      const init: RequestInit = {
        method: context.request.method,
        headers,
      };

      // Read body as ArrayBuffer to avoid Node 22 duplex requirement
      if (context.request.method !== "GET" && context.request.method !== "HEAD") {
        init.body = await context.request.arrayBuffer();
      }

      return await fetch(proxyUrl.toString(), init);
    } catch (error) {
      console.error("[Middleware] Proxy error:", error);
      return new Response("Backend unavailable", { status: 503 });
    }
  }

  // Otherwise, serve the Astro app
  return next();
});

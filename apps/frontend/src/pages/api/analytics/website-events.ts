import type { APIRoute } from "astro";
import { sendWebsiteAnalyticsBatch } from "@/api/client";

export const prerender = false;

const DEVICE_HEADER_ALLOWLIST = [
  "user-agent",
  "sec-ch-ua",
  "sec-ch-ua-arch",
  "sec-ch-ua-bitness",
  "sec-ch-ua-form-factors",
  "sec-ch-ua-full-version-list",
  "sec-ch-ua-mobile",
  "sec-ch-ua-model",
  "sec-ch-ua-platform",
  "sec-ch-ua-platform-version",
  "sec-ch-ua-wow64",
] as const;

function analyticsDeviceHeaders(request: Request) {
  const headers: Record<string, string> = {};
  for (const name of DEVICE_HEADER_ALLOWLIST) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await request.text();
  const backendRes = await sendWebsiteAnalyticsBatch(body, clientAddress, analyticsDeviceHeaders(request));

  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: {
      "Accept-CH":
        "Sec-CH-UA, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Mobile, Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version",
      "Content-Type": "application/json",
    },
  });
};

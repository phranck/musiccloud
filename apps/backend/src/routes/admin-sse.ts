/**
 * @file Server-Sent Events (SSE) stream for the admin dashboard.
 *
 * The admin UI keeps this connection open to receive live updates when
 * tracks/albums/artists are added or deleted (see
 * `adminEventBroadcaster`'s event types). SSE is chosen over WebSockets
 * because the traffic is strictly server-to-client and SSE rides on
 * ordinary HTTP, which simplifies the proxy path.
 *
 * Registered inside the admin scope in `server.ts`, so the connection is
 * already JWT-authenticated by the time the handler runs.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { adminEventBroadcaster, type TypedEvent, websiteAnalyticsRealtimeBroadcaster } from "../lib/event-broadcaster.js";

type SseBroadcaster<TEvent extends TypedEvent<string, object>> = {
  subscribe(fn: (event: TEvent) => void): () => void;
};

async function streamSse<TEvent extends TypedEvent<string, object>>(
  request: FastifyRequest,
  reply: FastifyReply,
  broadcaster: SseBroadcaster<TEvent>,
) {
  // `reply.hijack()` tells Fastify to let go of this response. Without it,
  // Fastify's post-handler lifecycle would try to serialize a return value and
  // close the response, which would kill the long-lived SSE stream.
  reply.hijack();

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Nginx buffers proxied responses by default. SSE needs each event flushed
    // immediately; this disables the buffering on our ingress.
    "X-Accel-Buffering": "no",
  });

  // Lines starting with `:` are SSE comments. A comment on connect gives the
  // client an immediate signal that the socket is live.
  reply.raw.write(":connected\n\n");

  const unsubscribe = broadcaster.subscribe((event) => {
    // If the underlying socket has already been torn down, writing would throw.
    if (reply.raw.destroyed) return;
    reply.raw.write(`event: ${event.type}\n`);
    reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
  });

  // Heartbeats every 25 s. Many proxies and NAT gateways close idle TCP
  // connections after around 30 s; a periodic comment keeps the path warm
  // without triggering the client's event handler.
  const heartbeat = setInterval(() => {
    if (!reply.raw.destroyed) reply.raw.write(":heartbeat\n\n");
  }, 25_000);

  // Keep the Fastify handler alive for the life of the SSE stream.
  await new Promise<void>((resolve) => {
    request.raw.on("close", resolve);
  });

  clearInterval(heartbeat);
  unsubscribe();
}

export default async function adminSseRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.events, async (request, reply) => {
    await streamSse(request, reply, adminEventBroadcaster);
  });

  app.get(ENDPOINTS.admin.analytics.website.realtime, async (request, reply) => {
    await streamSse(request, reply, websiteAnalyticsRealtimeBroadcaster);
  });
}

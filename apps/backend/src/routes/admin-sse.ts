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
import { adminEventBroadcaster, type TypedEvent } from "../lib/event-broadcaster.js";

type SseBroadcaster<TEvent extends TypedEvent<string, object>> = {
  subscribe(fn: (event: TEvent) => void): () => void;
};

type SseWriter<TEvent extends TypedEvent<string, object>> = (event: TEvent) => void | Promise<void>;

async function streamSse<TEvent extends TypedEvent<string, object>>(
  request: FastifyRequest,
  reply: FastifyReply,
  broadcaster: SseBroadcaster<TEvent>,
  onConnect?: (write: SseWriter<TEvent>) => Promise<void>,
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

  const writeEvent: SseWriter<TEvent> = (event) => {
    // If the underlying socket has already been torn down, writing would throw.
    if (reply.raw.destroyed) return;
    reply.raw.write(`event: ${event.type}\n`);
    reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
  };

  // Lines starting with `:` are SSE comments. A comment on connect gives the
  // client an immediate signal that the socket is live.
  reply.raw.write(":connected\n\n");
  try {
    await onConnect?.(writeEvent);
  } catch (err) {
    request.log.warn({ err }, "SSE initial snapshot failed");
    if (!reply.raw.destroyed) reply.raw.write(":snapshot-error\n\n");
  }

  const unsubscribe = broadcaster.subscribe((event) => {
    writeEvent(event);
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

/**
 * Requests per minute per IP allowed on the SSE stream.
 *
 * Above the global ceiling rather than exempt from it. One dashboard tab opens
 * one connection and holds it, but `EventSource` reconnects on its own after
 * any network interruption, and an admin with several tabs on a flaky link can
 * produce a burst that a stricter figure would cut off mid-session.
 *
 * A ceiling still applies, because the previous arrangement exempted the path
 * in the global limiter's allow-list, which is evaluated before authentication
 * and therefore exempted unauthenticated callers too.
 */
const SSE_REQUESTS_PER_MINUTE = 120;

export default async function adminSseRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.admin.events,
    { config: { rateLimit: { max: SSE_REQUESTS_PER_MINUTE, timeWindow: "1 minute" } } },
    async (request, reply) => {
      await streamSse(request, reply, adminEventBroadcaster);
    },
  );
}

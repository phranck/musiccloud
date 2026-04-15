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
import type { FastifyInstance } from "fastify";
import { adminEventBroadcaster } from "../lib/event-broadcaster.js";

export default async function adminSseRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.events, async (request, reply) => {
    // `reply.hijack()` tells Fastify to let go of this response. Without it,
    // Fastify's post-handler lifecycle would try to serialize a return
    // value and close the response, which would kill the long-lived SSE
    // stream we are about to write to.
    reply.hijack();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default. SSE needs each event
      // flushed immediately; this disables the buffering on our ingress.
      "X-Accel-Buffering": "no",
    });

    // Lines starting with `:` are SSE comments (ignored by the client). A
    // comment on connect gives the client an immediate signal that the
    // socket is live so it can stop any "connecting" spinner.
    reply.raw.write(":connected\n\n");

    const unsubscribe = adminEventBroadcaster.subscribe((event) => {
      // If the underlying socket has already been torn down, writing would
      // throw. The broadcaster is a process-wide singleton and this handler
      // may lag behind the close signal by one tick.
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
    });

    // Heartbeats every 25 s. Many proxies and NAT gateways close idle TCP
    // connections after around 30 s; a periodic comment keeps the path
    // warm without triggering the client's event handler.
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(":heartbeat\n\n");
    }, 25_000);

    // Block the handler until the client disconnects. Awaiting here is how
    // we keep the Fastify handler alive for the life of the SSE stream;
    // returning early would let Fastify think the request is done.
    await new Promise<void>((resolve) => {
      request.raw.on("close", resolve);
    });

    clearInterval(heartbeat);
    unsubscribe();
  });
}

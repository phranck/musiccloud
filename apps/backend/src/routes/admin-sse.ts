import type { FastifyInstance } from "fastify";
import { adminEventBroadcaster } from "../lib/event-broadcaster.js";

export default async function adminSseRoutes(app: FastifyInstance) {
  app.get("/api/admin/events", async (request, reply) => {
    // Take over the raw response – Fastify must not touch it afterwards
    reply.hijack();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering for SSE
    });

    reply.raw.write(":connected\n\n");

    const unsubscribe = adminEventBroadcaster.subscribe((event) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
    });

    // Heartbeat every 25 s – keeps the connection alive through proxies and
    // NAT gateways that close idle TCP connections after ~30 s.
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(":heartbeat\n\n");
    }, 25_000);

    // Wait until the client disconnects, then clean up
    await new Promise<void>((resolve) => {
      request.raw.on("close", resolve);
    });

    clearInterval(heartbeat);
    unsubscribe();
  });
}

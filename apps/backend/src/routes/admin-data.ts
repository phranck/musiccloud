import type { FastifyInstance } from "fastify";
import { getAdminRepository, getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { adapters } from "../services/index.js";

export default async function adminDataRoutes(app: FastifyInstance) {
  app.get("/api/admin/tracks", async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string; sortBy?: string; sortDir?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;
    const sortDir = q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined;

    const repo = await getAdminRepository();
    return repo.listTracks({ page, limit, q: search, sortBy: q.sortBy, sortDir });
  });

  app.get("/api/admin/albums", async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string; sortBy?: string; sortDir?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;
    const sortDir = q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined;

    const repo = await getAdminRepository();
    return repo.listAlbums({ page, limit, q: search, sortBy: q.sortBy, sortDir });
  });

  app.get("/api/admin/tracks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = await getAdminRepository();
    const track = await repo.getTrackById(id);
    if (!track) return reply.status(404).send({ error: "Track not found" });
    return track;
  });

  app.patch("/api/admin/tracks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") data.title = body.title;
    if (Array.isArray(body.artists)) data.artists = body.artists;
    if (body.albumName !== undefined) data.albumName = body.albumName ?? null;
    if (body.isrc !== undefined) data.isrc = body.isrc ?? null;
    if (body.artworkUrl !== undefined) data.artworkUrl = body.artworkUrl ?? null;
    if (Object.keys(data).length === 0) return reply.status(400).send({ error: "No valid fields to update" });
    const repo = await getAdminRepository();
    await repo.updateTrack(id, data);
    return { ok: true };
  });

  app.delete("/api/admin/tracks", async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "ids array required" });
    }
    const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === "string");
    const repo = await getAdminRepository();
    await repo.deleteTracks(ids);
    return { deleted: ids.length };
  });

  app.patch("/api/admin/tracks/:shortId/featured", async (request, reply) => {
    const { shortId } = request.params as { shortId: string };
    const body = request.body as { featured?: unknown };
    if (typeof body?.featured !== "boolean") {
      return reply.status(400).send({ error: "featured (boolean) required" });
    }
    const repo = await getAdminRepository();
    await repo.setTrackFeatured(shortId, body.featured);
    return { ok: true };
  });

  app.patch("/api/admin/albums/:shortId/featured", async (request, reply) => {
    const { shortId } = request.params as { shortId: string };
    const body = request.body as { featured?: unknown };
    if (typeof body?.featured !== "boolean") {
      return reply.status(400).send({ error: "featured (boolean) required" });
    }
    const repo = await getAdminRepository();
    await repo.setAlbumFeatured(shortId, body.featured);
    return { ok: true };
  });

  app.post("/api/admin/artist-cache/clear", async (_request, reply) => {
    const repo = await getAdminRepository();
    const result = await repo.clearArtistCache();
    return reply.send(result);
  });

  app.get("/api/admin/data-counts", async (_request, reply) => {
    const repo = await getAdminRepository();
    const counts = await repo.countAllData();
    return reply.send(counts);
  });

  app.post("/api/admin/reset-all", async (_request, reply) => {
    const repo = await getAdminRepository();
    const result = await repo.resetAllData();
    return reply.send(result);
  });

  app.delete("/api/admin/albums", async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "ids array required" });
    }
    const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === "string");
    const repo = await getAdminRepository();
    await repo.deleteAlbums(ids);
    return { deleted: ids.length };
  });

  app.get("/api/admin/stats", async () => {
    const repo = await getAdminRepository();
    const counts = await repo.countAllData();
    const adminCount = await repo.countAdmins();
    return { tracks: counts.tracks, albums: counts.albums, users: adminCount };
  });

  // --- Temporary: Backfill missing service links (streams NDJSON) ---
  app.post("/api/admin/backfill", async (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });

    function send(data: Record<string, unknown>) {
      if (!reply.raw.destroyed) {
        reply.raw.write(`${JSON.stringify(data)}\n`);
      }
    }

    try {
      const repo = await getRepository();
      const adminRepo = await getAdminRepository();

      const qobuzAdapter = adapters.find((a) => a.id === "qobuz");
      if (!qobuzAdapter) {
        send({ type: "error", message: "Qobuz adapter not found" });
        reply.raw.end();
        return;
      }

      // Paginate through all tracks via admin list
      let page = 1;
      const pageSize = 50;
      let processed = 0;
      let added = 0;
      let skipped = 0;
      let failed = 0;
      let total = 0;

      while (true) {
        const batch = await adminRepo.listTracks({ page, limit: pageSize });
        if (page === 1) {
          total = batch.total;
          send({ type: "start", total });
        }
        if (batch.items.length === 0) break;

        for (const trackItem of batch.items) {
          processed++;

          // Load full cached track with links via ISRC or ID
          const cached = trackItem.isrc ? await repo.findTrackByIsrc(trackItem.isrc) : null;
          if (!cached) {
            skipped++;
            continue;
          }

          const hasQobuz = cached.links.some((l) => l.service === "qobuz");
          if (hasQobuz) {
            skipped++;
            continue;
          }

          const sourceTrack = cached.track;

          try {
            let link = null;

            // Strategy 1: ISRC
            if (qobuzAdapter.capabilities.supportsIsrc && sourceTrack.isrc) {
              const found = await qobuzAdapter.findByIsrc(sourceTrack.isrc);
              if (found) {
                link = {
                  service: "qobuz",
                  url: found.webUrl,
                  confidence: 1.0,
                  matchMethod: "isrc",
                  externalId: found.sourceId,
                };
              }
            }

            // Strategy 2: Search
            if (!link) {
              const result = await qobuzAdapter.searchTrack({
                title: sourceTrack.title,
                artist: sourceTrack.artists[0] ?? "",
                album: sourceTrack.albumName,
              });
              if (result.found && result.track) {
                link = {
                  service: "qobuz",
                  url: result.track.webUrl,
                  confidence: result.confidence,
                  matchMethod: result.matchMethod,
                  externalId: result.track.sourceId,
                };
              }
            }

            if (link) {
              await repo.addLinksToTrack(cached.trackId, [link]);
              added++;
              send({
                type: "added",
                track: sourceTrack.title,
                artist: sourceTrack.artists[0],
                method: link.matchMethod,
                confidence: link.confidence,
                processed,
                total,
              });
            } else {
              skipped++;
              send({
                type: "not-found",
                track: sourceTrack.title,
                artist: sourceTrack.artists[0],
                processed,
                total,
              });
            }

            // Rate limit: small delay between Qobuz API calls
            await new Promise((r) => setTimeout(r, 300));
          } catch (err) {
            failed++;
            send({
              type: "error",
              track: trackItem.title,
              message: err instanceof Error ? err.message : "Unknown error",
              processed,
              total,
            });
          }
        }

        if (batch.items.length < pageSize) break;
        page++;
      }

      send({ type: "done", processed, added, skipped, failed });
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      log.error("Backfill", err instanceof Error ? err.message : "Unknown error");
    }

    reply.raw.end();
  });
}

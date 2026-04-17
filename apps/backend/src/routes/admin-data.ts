/**
 * @file Admin data-management endpoints (tracks, albums, artists, caches).
 *
 * Registered inside the admin scope in `server.ts`; every handler runs
 * after `authenticateAdmin`.
 *
 * Grouped endpoints in this file:
 *
 * 1. **List + search** (tracks / albums / artists) - paginated, searchable,
 *    sortable. Heavy lifting is in `getAdminRepository().list*`.
 * 2. **Track detail GET + PATCH** - per-row view/edit for manual metadata
 *    fixes (wrong title, missing ISRC, bad artwork URL).
 * 3. **Bulk DELETE** - delete by `{ ids: string[] }` body across tracks,
 *    albums, artists.
 * 4. **Cache invalidation** - per-share (track/album/artist) plus a bulk
 *    "invalidate everything". Invalidation marks rows stale; it does not
 *    delete them, so the short URL keeps resolving while the next
 *    resolver call re-fetches the upstream data.
 * 5. **Meta** - `dataCounts`, `stats` (adds admin user count for the
 *    dashboard overview), and the destructive `resetAll`.
 *
 * ## Input hardening
 *
 * Query params arrive as strings and get coerced:
 *
 * - `page` is clamped to `>= 1` (invalid or `NaN` falls back to 1).
 * - `limit` is clamped to `1..100`. The upper cap is not arbitrary:
 *   larger pages both strain the list queries and stall the dashboard
 *   table render, so the server enforces it regardless of what the UI
 *   sends.
 * - `sortDir` is whitelisted to `asc | desc`; anything else becomes
 *   `undefined` so the repository can fall back to its default.
 *
 * ## PATCH semantics
 *
 * Track PATCH is a partial update with a two-tier rule set:
 *
 * - `title` / `artists` must be the correct type to be accepted; if
 *   wrong type, they are silently dropped (the 400 comes from "no
 *   fields to update").
 * - Optional fields (`albumName`, `isrc`, `artworkUrl`) accept either a
 *   value or `null`. Passing `null` clears the field, which is a
 *   deliberate way to wipe a bad auto-filled value (e.g. wrong artwork
 *   URL) without deleting the whole row.
 *
 * ## `resetAll` is destructive
 *
 * `POST /api/admin/reset-all` wipes all track / album / artist data. It
 * carries no confirmation body; the admin UI is expected to prompt the
 * operator before issuing the call. Treat this route the same as
 * `DROP TABLE` for review purposes.
 */
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getAdminRepository } from "../db/index.js";
import { clearAllArtworks } from "../services/genre-artwork/index.js";
import { resetBrowseCache } from "../services/genre-search/lastfm.js";

export default async function adminDataRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.tracks.list, async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string; sortBy?: string; sortDir?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;
    const sortDir = q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined;

    const repo = await getAdminRepository();
    return repo.listTracks({ page, limit, q: search, sortBy: q.sortBy, sortDir });
  });

  app.get(ENDPOINTS.admin.albums.list, async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string; sortBy?: string; sortDir?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;
    const sortDir = q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined;

    const repo = await getAdminRepository();
    return repo.listAlbums({ page, limit, q: search, sortBy: q.sortBy, sortDir });
  });

  app.get(ROUTE_TEMPLATES.admin.tracks.detail, async (request, reply) => {
    const { id } = request.params as { id: string };
    const repo = await getAdminRepository();
    const track = await repo.getTrackById(id);
    if (!track) return reply.status(404).send({ error: "Track not found" });
    return track;
  });

  app.patch(ROUTE_TEMPLATES.admin.tracks.detail, async (request, reply) => {
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

  app.delete(ENDPOINTS.admin.tracks.list, async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "ids array required" });
    }
    const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === "string");
    const repo = await getAdminRepository();
    await repo.deleteTracks(ids);
    return { deleted: ids.length };
  });

  app.post(ENDPOINTS.admin.cache.artistClear, async (_request, reply) => {
    const repo = await getAdminRepository();
    const result = await repo.clearArtistCache();
    return reply.send(result);
  });

  // Purge every stored genre artwork AND reset the in-memory browse-grid
  // cache. The next `genre:?` tile fetch refetches Last.fm top tags and
  // re-generates all tile JPEGs with the current generator settings.
  app.post(ENDPOINTS.admin.cache.genreClear, async (_request, reply) => {
    const result = await clearAllArtworks();
    resetBrowseCache();
    return reply.send(result);
  });

  // Per-share cache invalidation. Marks the underlying row as stale so the
  // next resolve of its URL re-fetches. The short URL itself stays intact,
  // so bookmarks and share links keep working through the re-fetch.
  app.post(ROUTE_TEMPLATES.admin.tracks.invalidateCache, async (request, reply) => {
    const { shortId } = request.params as { shortId: string };
    try {
      const repo = await getAdminRepository();
      const result = await repo.invalidateTrackCache(shortId);
      return reply.send(result);
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "Not found" });
    }
  });

  app.post(ROUTE_TEMPLATES.admin.albums.invalidateCache, async (request, reply) => {
    const { shortId } = request.params as { shortId: string };
    try {
      const repo = await getAdminRepository();
      const result = await repo.invalidateAlbumCache(shortId);
      return reply.send(result);
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "Not found" });
    }
  });

  app.post(ROUTE_TEMPLATES.admin.artists.invalidateCache, async (request, reply) => {
    const { shortId } = request.params as { shortId: string };
    try {
      const repo = await getAdminRepository();
      const result = await repo.invalidateArtistCache(shortId);
      return reply.send(result);
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "Not found" });
    }
  });

  // Bulk: stale every track + album + artist row.
  app.post(ENDPOINTS.admin.cache.invalidateAll, async (_request, reply) => {
    const repo = await getAdminRepository();
    const result = await repo.invalidateAllCaches();
    return reply.send(result);
  });

  app.get(ENDPOINTS.admin.dataCounts, async (_request, reply) => {
    const repo = await getAdminRepository();
    const counts = await repo.countAllData();
    return reply.send(counts);
  });

  app.post(ENDPOINTS.admin.resetAll, async (_request, reply) => {
    const repo = await getAdminRepository();
    const result = await repo.resetAllData();
    return reply.send(result);
  });

  app.get(ENDPOINTS.admin.artists.list, async (request) => {
    const q = request.query as { page?: string; limit?: string; q?: string; sortBy?: string; sortDir?: string };
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "20", 10) || 20));
    const search = q.q?.trim() || undefined;
    const sortDir = q.sortDir === "asc" || q.sortDir === "desc" ? q.sortDir : undefined;

    const repo = await getAdminRepository();
    return repo.listArtists({ page, limit, q: search, sortBy: q.sortBy, sortDir });
  });

  app.delete(ENDPOINTS.admin.artists.list, async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "ids array required" });
    }
    const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === "string");
    const repo = await getAdminRepository();
    await repo.deleteArtists(ids);
    return { deleted: ids.length };
  });

  app.delete(ENDPOINTS.admin.albums.list, async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: "ids array required" });
    }
    const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === "string");
    const repo = await getAdminRepository();
    await repo.deleteAlbums(ids);
    return { deleted: ids.length };
  });

  app.get(ENDPOINTS.admin.stats, async () => {
    const repo = await getAdminRepository();
    const counts = await repo.countAllData();
    const adminCount = await repo.countAdmins();
    return { tracks: counts.tracks, albums: counts.albums, artists: counts.artists, users: adminCount };
  });
}

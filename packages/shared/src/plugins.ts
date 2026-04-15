import type { ServiceId } from "./services.js";

/** Track-level capabilities reported by a resolve plugin. Mirrors the
 * backend `AdapterCapabilities` shape, duplicated here to avoid a
 * backend→shared dependency. */
export interface PluginCapabilities {
  supportsIsrc: boolean;
  supportsPreview: boolean;
  supportsArtwork: boolean;
}

/**
 * Shape returned by `GET /api/admin/plugins`: one entry per installed
 * plugin. Combines static manifest data (displayName, description,
 * requiredEnv, defaultEnabled) with runtime state (enabled, available,
 * missingEnv).
 */
export interface PluginInfo {
  id: ServiceId;
  displayName: string;
  description: string;
  /** Admin toggle state (DB override or manifest.defaultEnabled). */
  enabled: boolean;
  /** `adapter.isAvailable()`: credentials present / reachable. */
  available: boolean;
  requiredEnv: readonly string[];
  /** Subset of requiredEnv whose values are missing from process.env. */
  missingEnv: readonly string[];
  capabilities: PluginCapabilities;
  hasAlbumSupport: boolean;
  hasArtistSupport: boolean;
  defaultEnabled: boolean;
  docsUrl?: string;
}

/**
 * Shape returned by the public `GET /api/v1/services/active` endpoint.
 * Trimmed down: no secrets, no capability internals: only what the
 * public frontend (marquee, resolve pages) needs to render.
 */
export interface ActiveService {
  id: ServiceId;
  displayName: string;
  color: string;
}

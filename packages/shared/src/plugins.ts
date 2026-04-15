/**
 * Wire-format types for the plugin admin and public-active endpoints.
 *
 * Two shapes for two audiences:
 *
 * - `PluginInfo` is returned by `GET /api/admin/plugins` (JWT-protected).
 *   It exposes everything the Services dashboard page needs to render a
 *   toggle: runtime state, credential status, capabilities, defaults.
 *
 * - `ActiveService` is returned by the public `GET /api/v1/services/active`
 *   and is intentionally minimal: the marquee on the landing page is a
 *   public surface, so this type carries only what gets rendered (id,
 *   display name, brand color). No credential state, no capability flags,
 *   no environment hints that could help probe the server's configuration.
 */

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
 * Trimmed down: no secrets, no capability internals, only what the
 * public frontend (marquee, resolve pages) needs to render.
 */
export interface ActiveService {
  id: ServiceId;
  displayName: string;
  color: string;
}

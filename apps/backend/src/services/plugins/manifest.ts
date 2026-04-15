/**
 * @file Plugin manifest and plugin-bundle interfaces.
 *
 * Every adapter directory exports a `ServicePlugin` object combining a
 * static `PluginManifest` (what the admin UI and registry need to know
 * about the plugin) with the runtime `ServiceAdapter` (the code that
 * actually resolves tracks). This file defines only the shape; the
 * values live under each `services/plugins/<svc>/index.ts`.
 *
 * The separation between manifest and adapter matters at registration
 * time: `registry.ts` reads the manifest (synchronously, no I/O) to
 * render the Dashboard Services page, while resolve traffic reaches
 * for the adapter through a filtered view of the same list. Neither
 * path needs to pay for loading the other.
 */
import type { ServiceId } from "@musiccloud/shared";
import type { ServiceAdapter } from "../types.js";

/**
 * Static metadata describing a plugin. Contains no runtime state; the
 * registry computes "enabled" / "available" / "missingEnv" at request
 * time by combining this manifest with live adapter checks and the
 * `service_plugins` DB table.
 */
export interface PluginManifest {
  /** Stable identifier. Must match the adapter's `ServiceId`. */
  id: ServiceId;
  /** Human-readable name shown in the Dashboard. */
  displayName: string;
  /** Short one-liner describing what the plugin does. */
  description: string;
  /** Required env vars; if any is missing the adapter is "unavailable". */
  requiredEnv?: readonly string[];
  /** Optional env vars (improve behaviour but not strictly required). */
  optionalEnv?: readonly string[];
  /** Whether this plugin is on by default for fresh installs. */
  defaultEnabled: boolean;
  /** Plugin author / maintainer (free-form). */
  author?: string;
  /** Documentation URL for the underlying service's API. */
  docsUrl?: string;
}

/**
 * A plugin is a manifest + its adapter, bundled together. Each plugin
 * directory exports exactly one `<svc>Plugin: ServicePlugin`.
 */
export interface ServicePlugin {
  readonly manifest: PluginManifest;
  readonly adapter: ServiceAdapter;
}

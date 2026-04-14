import type { ServiceId } from "@musiccloud/shared";
import type { ServiceAdapter } from "../types.js";

/**
 * Static metadata describing a plugin. Does not hold runtime state — the
 * registry computes "enabled" / "available" / "missing env" at request time.
 */
export interface PluginManifest {
  /** Stable identifier — must match the adapter's ServiceId. */
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

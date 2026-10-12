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
 * registry computes "enabled", "available" and "missingEnv" at request time
 * from this manifest, the environment and the `service_plugins` DB table.
 *
 * The manifest is the only statement of which credentials a plugin needs, so
 * the badge on the Services page and the list of missing variables beneath it
 * come from one answer, {@link evaluatePluginEnv}.
 */
export interface PluginManifest {
  /** Stable identifier. Must match the adapter's `ServiceId`. */
  id: ServiceId;
  /** Human-readable name shown in the Dashboard. */
  displayName: string;
  /** Short one-liner describing what the plugin does. */
  description: string;
  /** Required env vars; if any is missing the plugin is unavailable, unless `alternativeEnv` is set in full. */
  requiredEnv?: readonly string[];
  /**
   * A second complete set of env vars that makes the plugin available as
   * well, such as a ready-made token in place of the keys that sign one.
   */
  alternativeEnv?: readonly string[];
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

/** Whether a plugin can serve traffic with the environment it runs in, and what it lacks if not. */
export interface PluginEnvEvaluation {
  /** `true` when every `requiredEnv` variable or every `alternativeEnv` variable is set. */
  available: boolean;
  /** The unset `requiredEnv` variables, or an empty list for an available plugin. */
  missingEnv: string[];
}

/**
 * Decides from a plugin's manifest whether its credentials are present.
 *
 * A plugin with no `requiredEnv` needs no credentials and is always
 * available. A variable set to an empty string counts as unset.
 *
 * @param manifest - The plugin's manifest.
 * @param env - The environment to read, `process.env` unless a test passes one.
 * @returns Whether the plugin is available and which required variables are missing.
 */
export function evaluatePluginEnv(manifest: PluginManifest, env: NodeJS.ProcessEnv = process.env): PluginEnvEvaluation {
  const isSet = (name: string) => Boolean(env[name]);
  const required = manifest.requiredEnv ?? [];
  const alternative = manifest.alternativeEnv ?? [];
  const available = required.every(isSet) || (alternative.length > 0 && alternative.every(isSet));
  return { available, missingEnv: available ? [] : required.filter((name) => !isSet(name)) };
}

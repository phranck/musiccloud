/**
 * @file Creem SDK client factory (MC-110). Provides one lazily-created client
 * per Creem environment, so the underlying HTTP client and connection pool are
 * shared across the process lifetime.
 *
 * There is a client per environment rather than one per process because test
 * and live are separate accounts and this backend may hold a key for both: the
 * tier editor maintains products in each, whilst the shop sells from whichever
 * one is switched on.
 */
import { Creem, ServerList, ServerProd, ServerTest } from "creem";
import { CreemMode, type CreemModeValue, requireCreemApiKey } from "../lib/creem-config.js";

/** One cached client per environment, filled on first use. */
const instances = new Map<CreemModeValue, Creem>();

/**
 * Maps one of our Creem environments onto the SDK's own server key.
 *
 * @param mode - The environment to reach.
 * @returns The key the SDK uses to look the base URL up.
 */
function serverKeyFor(mode: CreemModeValue): keyof typeof ServerList {
  return mode === CreemMode.Test ? ServerTest : ServerProd;
}

/**
 * Returns the Creem base URL for one environment.
 *
 * The value comes from the SDK's own `ServerList` rather than from a constant
 * of ours, so the operations we call directly reach exactly the host the SDK
 * would have used. `creem@1.5.3` covers 42 of the API's 55 operations, and
 * `products.update` and `products.archive` are among the missing ones.
 *
 * @param mode - The environment to reach.
 * @returns The base URL, without a trailing slash.
 */
export function getCreemBaseUrl(mode: CreemModeValue): string {
  return ServerList[serverKeyFor(mode)];
}

/**
 * Returns the shared Creem SDK client for one environment.
 *
 * The client is constructed on first use with that environment's key and the
 * matching server, and cached for the process lifetime, because the SDK keeps
 * an internal HTTP client with connection pooling.
 *
 * @param mode - The environment to talk to.
 * @returns The client for that environment.
 * @throws Error when this deployment holds no key for that environment. It
 *   never falls back to the other one, because reaching the wrong Creem
 *   account is the failure this whole split exists to prevent.
 */
export function getCreemClient(mode: CreemModeValue): Creem {
  const cached = instances.get(mode);
  if (cached) return cached;

  const client = new Creem({ server: serverKeyFor(mode), apiKey: requireCreemApiKey(mode) });
  instances.set(mode, client);
  return client;
}

/**
 * Drops every cached client, so the next call reads the environment again.
 *
 * Exported for tests, which change the configured keys between cases.
 */
export function resetCreemClients(): void {
  instances.clear();
}

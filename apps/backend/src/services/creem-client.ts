/**
 * @file Creem SDK client factory (MC-110). Provides a lazily-created singleton
 * instance of the Creem SDK client so that the underlying HTTP client and
 * connection pool are shared across the process lifetime.
 */
import { Creem, ServerList, ServerProd, ServerTest } from "creem";
import { CreemMode, type CreemModeValue, getCreemConfig } from "../lib/creem-config.js";

/** Module-level singleton. `null` until the first call to `getCreemClient`. */
let instance: Creem | null = null;

/**
 * Maps one of our Creem environments onto the SDK's own server key.
 *
 * @param mode - The environment the process is running in.
 * @returns The key the SDK uses to look the base URL up.
 */
function serverKeyFor(mode: CreemModeValue): keyof typeof ServerList {
  return mode === CreemMode.Test ? ServerTest : ServerProd;
}

/**
 * Returns the Creem base URL for the environment this process runs in.
 *
 * The value comes from the SDK's own `ServerList` rather than from a constant
 * of ours, so the operations we call directly reach exactly the host the SDK
 * would have used. `creem@1.5.3` covers 42 of the API's 55 operations, and
 * `products.update` and `products.archive` are among the missing ones.
 *
 * @returns The base URL, without a trailing slash.
 */
export function getCreemBaseUrl(): string {
  return ServerList[serverKeyFor(getCreemConfig().mode)];
}

/**
 * Returns the singleton Creem SDK client for this process.
 *
 * On the first call the function reads the runtime config via
 * `getCreemConfig()` and constructs a `Creem` instance with:
 * - `server`: set to `ServerTest` ("test") or `ServerProd` ("prod") based on
 *   `config.mode`. The mode is derived from the `CREEM_API_KEY` prefix
 *   (`creem_test_` means test mode, anything else means live), so a test key
 *   can never accidentally reach the live Creem API.
 * - `apiKey`: the raw value of `CREEM_API_KEY`, passed as the `x-api-key`
 *   authentication header by the SDK on every request.
 *
 * Subsequent calls return the cached instance without re-reading the config
 * or constructing a new client. The singleton is intentional: the Creem SDK
 * maintains an internal HTTP client with connection pooling, and re-creating
 * it on every call would waste resources and lose those benefits.
 *
 * @returns The shared `Creem` SDK client instance.
 */
export function getCreemClient(): Creem {
  if (instance) return instance;
  const { apiKey, mode } = getCreemConfig();
  instance = new Creem({
    server: serverKeyFor(mode),
    apiKey,
  });
  return instance;
}

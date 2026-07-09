/**
 * @file Creem SDK client factory (MC-110). Provides a lazily-created singleton
 * instance of the Creem SDK client so that the underlying HTTP client and
 * connection pool are shared across the process lifetime.
 */
import { Creem, ServerProd, ServerTest } from "creem";
import { getCreemConfig } from "../lib/creem-config.js";

/** Module-level singleton. `null` until the first call to `getCreemClient`. */
let instance: Creem | null = null;

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
    server: mode === "test" ? ServerTest : ServerProd,
    apiKey,
  });
  return instance;
}

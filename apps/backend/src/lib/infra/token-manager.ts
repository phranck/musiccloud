import { fetchWithTimeout } from "../../lib/infra/fetch";
import { ExpiringValueCache } from "./expiring-value-cache";

/** Milliseconds per second, for the provider's `expires_in`, which counts seconds. */
const MS_PER_SECOND = 1000;

/**
 * How long before its stated expiry a token is replaced: 60 s, because
 * upstreams reject a request with 401 at the second of expiry.
 */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/**
 * One token as the token endpoint issued it.
 *
 * @property accessToken - The bearer token.
 * @property expiresInSeconds - The `expires_in` of the answer: how many
 *   seconds the token is valid from the moment it arrived.
 */
interface IssuedToken {
  accessToken: string;
  expiresInSeconds: number;
}

interface TokenManagerConfig {
  serviceName: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

/**
 * Generic OAuth2 client-credentials token manager.
 *
 * Shared by adapters that need a server-to-server token (Spotify, Tidal,
 * potential future services). Adapter-specific JWT flows (Apple Music's
 * signed ES256 assertion, Qobuz's user login) are NOT this class; they live
 * inside the respective plugin directory because their shape is different.
 *
 * Two non-obvious behaviours enforced by project rules:
 *
 * 1. **Promise coalescing** (project rule "Use promise coalescing for token
 *    refresh"): without it, a burst of resolves arriving after token expiry
 *    each kicks off its own token POST. Upstreams then rate-limit the
 *    backend or, worse, invalidate earlier tokens once a new one is issued.
 *    The {@link ExpiringValueCache} holds the in-flight refresh; concurrent
 *    callers await the same promise.
 *
 * 2. **60s early-refresh buffer**: the cache is treated as stale `expires_in
 *    - 60s` ({@link TOKEN_REFRESH_MARGIN_MS}) to avoid handing out a token
 *    whose validity ends mid-upstream call.
 *
 * `reset()` exists for Vitest: token state is per-instance and tests share
 * module-level singletons, so isolation requires a manual clear between
 * cases. Production never calls it.
 */
export class TokenManager {
  /** The token and its lifetime, refreshed {@link TOKEN_REFRESH_MARGIN_MS} before it expires. */
  private readonly token = new ExpiringValueCache<IssuedToken>({
    load: () => this.fetchNewToken(),
    timeToLiveMs: (issued) => issued.expiresInSeconds * MS_PER_SECOND,
    refreshMarginMs: TOKEN_REFRESH_MARGIN_MS,
  });

  constructor(private config: TokenManagerConfig) {}

  /**
   * Answers a valid access token, requesting a new one when the cached one is
   * missing or within {@link TOKEN_REFRESH_MARGIN_MS} of its expiry.
   *
   * @returns The bearer token.
   * @throws When the credentials are missing or the token request fails.
   */
  async getAccessToken(): Promise<string> {
    return (await this.token.get()).accessToken;
  }

  /** Reset cached token. Test-only: production singletons must not be reset. */
  reset(): void {
    this.token.reset();
  }

  isConfigured(): boolean {
    return !!(process.env[this.config.clientIdEnv] && process.env[this.config.clientSecretEnv]);
  }

  /**
   * Requests a new token with the client-credentials grant.
   *
   * @returns The token and its lifetime as the provider states it.
   * @throws When the credentials are missing or the provider answers an error status.
   */
  private async fetchNewToken(): Promise<IssuedToken> {
    const clientId =
      process.env[this.config.clientIdEnv] || (process.env[this.config.clientIdEnv] as string | undefined);
    const clientSecret =
      process.env[this.config.clientSecretEnv] || (process.env[this.config.clientSecretEnv] as string | undefined);

    if (!clientId || !clientSecret) {
      console.error(`[${this.config.serviceName}] Missing required credentials`);
      throw new Error(`${this.config.clientIdEnv} and ${this.config.clientSecretEnv} must be set`);
    }

    const response = await fetchWithTimeout(
      this.config.tokenUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: "grant_type=client_credentials",
      },
      5000,
    );

    if (!response.ok) {
      throw new Error(`${this.config.serviceName} token request failed: ${response.status}`);
    }

    const data = await response.json();
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
  }
}

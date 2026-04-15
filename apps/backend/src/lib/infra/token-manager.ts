import { fetchWithTimeout } from "../../lib/infra/fetch";

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
 *    `tokenPromise` holds the in-flight refresh; concurrent callers await
 *    the same promise.
 *
 * 2. **60s early-refresh buffer**: the cache is treated as stale `expires_in
 *    - 60s` to avoid handing out a token whose validity ends mid-upstream
 *    call. Upstreams reject the request with 401 at the second of expiry,
 *    not a second before.
 *
 * `reset()` exists for Vitest: token state is per-instance and tests share
 * module-level singletons, so isolation requires a manual clear between
 * cases. Production never calls it.
 */
export class TokenManager {
  private cachedToken: { accessToken: string; expiresAt: number } | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(private config: TokenManagerConfig) {}

  async getAccessToken(): Promise<string> {
    // 60s buffer before `expiresAt` (see class-level doc for rationale).
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.accessToken;
    }

    // Coalesce: if a refresh is already in flight, every other caller awaits
    // the same promise instead of triggering a parallel POST.
    if (this.tokenPromise) return this.tokenPromise;

    this.tokenPromise = this.fetchNewToken().finally(() => {
      this.tokenPromise = null;
    });
    return this.tokenPromise;
  }

  /** Reset cached token. Test-only: production singletons must not be reset. */
  reset(): void {
    this.cachedToken = null;
    this.tokenPromise = null;
  }

  isConfigured(): boolean {
    return !!(process.env[this.config.clientIdEnv] && process.env[this.config.clientSecretEnv]);
  }

  private async fetchNewToken(): Promise<string> {
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

    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return this.cachedToken.accessToken;
  }
}

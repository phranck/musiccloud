import { fetchWithTimeout } from "../../lib/infra/fetch";

interface TokenManagerConfig {
  serviceName: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

/**
 * Generic OAuth2 client-credentials token manager with promise coalescing.
 * Prevents parallel token refresh requests and caches tokens until expiry.
 */
export class TokenManager {
  private cachedToken: { accessToken: string; expiresAt: number } | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(private config: TokenManagerConfig) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.accessToken;
    }

    if (this.tokenPromise) return this.tokenPromise;

    this.tokenPromise = this.fetchNewToken().finally(() => {
      this.tokenPromise = null;
    });
    return this.tokenPromise;
  }

  /** Reset cached token. For testing only. */
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

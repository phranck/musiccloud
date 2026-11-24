/**
 * @file Tidal OpenAPI v2 transport: the OAuth token lifecycle and the
 * authenticated JSON:API request shared by the adapter and the search document
 * handling.
 */
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { TokenManager } from "../../../lib/infra/token-manager";

const API_BASE = "https://openapi.tidal.com/v2";

const tokenManager = new TokenManager({
  serviceName: "Tidal",
  tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
  clientIdEnv: "TIDAL_CLIENT_ID",
  clientSecretEnv: "TIDAL_CLIENT_SECRET",
});

/** Reset token cache. For testing only. */
export function _resetTokenCache(): void {
  tokenManager.reset();
}

/**
 * Requests an endpoint of the Tidal OpenAPI v2 with a client-credentials token.
 *
 * @param endpoint - Path and query string below the API base.
 * @returns The raw response; the caller decides how a status maps to a result.
 */
export async function tidalFetch(endpoint: string): Promise<Response> {
  const token = await tokenManager.getAccessToken();
  return fetchWithTimeout(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
    },
  });
}

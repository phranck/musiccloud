/**
 * @file Apple Music developer token and the authenticated request boundary.
 *
 * Apple Music authenticates with a signed developer JWT rather than a
 * client_id / client_secret exchange. Required env vars:
 *
 * - `APPLE_MUSIC_KEY_ID`: 10-char key identifier from App Store Connect
 * - `APPLE_MUSIC_TEAM_ID`: 10-char team identifier
 * - `APPLE_MUSIC_PRIVATE_KEY`: the contents of the downloaded `.p8`
 *   private key (PKCS#8 PEM). Line breaks can be `\n`-escaped when
 *   the env var is set from a config UI; the loader handles both.
 *
 * `generateToken` signs with `jose`/ES256 or uses `APPLE_MUSIC_TOKEN`.
 * `getDevToken` owns the in-process cache and coalesces refreshes; its lifetime
 * and refresh margin are the constants beside that implementation, not a
 * catalog-cache lifetime. `warmAppleMusicToken` can prepare it at startup.
 *
 * The adapter and the `apple-music-charts` crawler source both send every
 * request through {@link appleMusicFetch}, so they share one token cache.
 */
import { importPKCS8, SignJWT } from "jose";
import { ExpiringValueCache } from "../../../lib/infra/expiring-value-cache";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { ResolveError } from "../../../lib/resolve/errors";

/** Base URL of the Apple Music API, which every endpoint path is appended to. */
const API_BASE = "https://api.music.apple.com/v1";

/** How long one Apple Music API request may take before it is aborted: five seconds. */
const APPLE_MUSIC_REQUEST_TIMEOUT_MS = 5000;

/** How long a signed developer JWT is valid, and how long the cache keeps any token: one hour. */
const TOKEN_LIFETIME_SECONDS = 3600;
/** How long before the end of {@link TOKEN_LIFETIME_SECONDS} a token is replaced: five minutes. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Milliseconds per second, for the lifetime the JWT states in seconds. */
const MS_PER_SECOND = 1000;

/**
 * Generates the static or signed developer token.
 *
 * @returns `APPLE_MUSIC_TOKEN` when it is set, else a JWT signed with the MusicKit key.
 * @throws {ResolveError} When the MusicKit settings are missing, the key cannot
 *   be parsed, or signing fails.
 */
async function generateToken(): Promise<string> {
  // Legacy: support pre-generated static token for development
  const staticToken = process.env.APPLE_MUSIC_TOKEN;
  if (staticToken) return staticToken;

  // Generate JWT from MusicKit credentials
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const privateKeyPem = process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKeyPem) {
    throw new ResolveError(
      "MC-CFG-1001",
      "Apple Music requires APPLE_MUSIC_KEY_ID + APPLE_MUSIC_TEAM_ID + APPLE_MUSIC_PRIVATE_KEY",
    );
  }

  // The private key may be base64-encoded or raw PEM.
  // Decode if it doesn't start with "-----BEGIN".
  // Also replace literal \n sequences (common in .env files) with actual newlines.
  const rawPem = privateKeyPem.startsWith("-----BEGIN")
    ? privateKeyPem
    : Buffer.from(privateKeyPem, "base64").toString("utf-8");
  const pem = rawPem.replace(/\\n/g, "\n");

  let privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  try {
    privateKey = await importPKCS8(pem, "ES256");
  } catch (err) {
    throw new ResolveError("MC-AUTH-1501", `Apple Music private key could not be parsed: ${(err as Error).message}`);
  }

  const now = Math.floor(Date.now() / 1000);
  let token: string;
  try {
    token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
      .sign(privateKey);
  } catch (err) {
    throw new ResolveError("MC-AUTH-1501", `Apple Music JWT signing failed: ${(err as Error).message}`);
  }

  return token;
}

/** The developer token, shared by every request and refreshed {@link TOKEN_REFRESH_MARGIN_MS} early. */
const devToken = new ExpiringValueCache<string>({
  load: generateToken,
  timeToLiveMs: TOKEN_LIFETIME_SECONDS * MS_PER_SECOND,
  refreshMarginMs: TOKEN_REFRESH_MARGIN_MS,
});

/**
 * Answers the cached developer token, generating one when it is missing or stale.
 *
 * @returns The bearer token for the Apple Music API.
 * @throws {ResolveError} When no token can be generated.
 */
function getDevToken(): Promise<string> {
  return devToken.get();
}

/**
 * Pre-warm the developer token at startup to avoid first-request latency.
 * The caller checks that the plugin is available, so this never tries to
 * sign a token without keys.
 */
export async function warmAppleMusicToken(): Promise<void> {
  try {
    await assertAppleMusicDeveloperToken();
    console.log("[Apple Music] Developer token pre-warmed");
  } catch (e) {
    console.error("[Apple Music] Token pre-warm failed:", (e as Error).message);
  }
}

/**
 * Verifies that the configured static or signed developer-token profile is
 * usable without making a catalog request. Crawler enablement uses this so a
 * malformed key cannot defer discovery until after network work begins.
 */
export async function assertAppleMusicDeveloperToken(): Promise<void> {
  await getDevToken();
}

/**
 * Authenticated request against the Apple Music API, shared by the adapter and
 * the `apple-music-charts` crawler source
 * (`services/crawler/sources/apple-music-charts.ts`), so both reuse one token
 * cache and timeout.
 *
 * @param endpoint - API path below {@link API_BASE}, starting with `/`.
 * @returns The raw response; the caller checks its status.
 * @throws {ResolveError} When no developer token can be generated.
 */
export async function appleMusicFetch(endpoint: string): Promise<Response> {
  const token = await getDevToken();
  return fetchWithTimeout(
    `${API_BASE}${endpoint}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
    APPLE_MUSIC_REQUEST_TIMEOUT_MS,
  );
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.hoisted(() => vi.fn());
const importPKCS8Mock = vi.hoisted(() => vi.fn());
const signMock = vi.hoisted(() => vi.fn());
const testPrivateKeyHeader = "-----BEGIN " + "PRIVATE KEY-----";
const testPrivateKeyFooter = "-----END " + "PRIVATE KEY-----";
const testPrivateKey = `${testPrivateKeyHeader}\\nfixture\\n${testPrivateKeyFooter}`;
const normalizedTestPrivateKey = `${testPrivateKeyHeader}\nfixture\n${testPrivateKeyFooter}`;

class MockSignJWT {
  setProtectedHeader(): this {
    return this;
  }

  setIssuer(): this {
    return this;
  }

  setIssuedAt(): this {
    return this;
  }

  setExpirationTime(): this {
    return this;
  }

  sign(): Promise<string> {
    return signMock();
  }
}

vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
}));

vi.mock("jose", () => ({
  importPKCS8: (...args: unknown[]) => importPKCS8Mock(...args),
  SignJWT: MockSignJWT,
}));

const originalEnvironment = {
  token: process.env.APPLE_MUSIC_TOKEN,
  keyId: process.env.APPLE_MUSIC_KEY_ID,
  teamId: process.env.APPLE_MUSIC_TEAM_ID,
  privateKey: process.env.APPLE_MUSIC_PRIVATE_KEY,
};

function restoreEnvironment(): void {
  if (originalEnvironment.token === undefined) delete process.env.APPLE_MUSIC_TOKEN;
  else process.env.APPLE_MUSIC_TOKEN = originalEnvironment.token;
  if (originalEnvironment.keyId === undefined) delete process.env.APPLE_MUSIC_KEY_ID;
  else process.env.APPLE_MUSIC_KEY_ID = originalEnvironment.keyId;
  if (originalEnvironment.teamId === undefined) delete process.env.APPLE_MUSIC_TEAM_ID;
  else process.env.APPLE_MUSIC_TEAM_ID = originalEnvironment.teamId;
  if (originalEnvironment.privateKey === undefined) delete process.env.APPLE_MUSIC_PRIVATE_KEY;
  else process.env.APPLE_MUSIC_PRIVATE_KEY = originalEnvironment.privateKey;
}

beforeEach(() => {
  vi.resetModules();
  fetchWithTimeoutMock.mockReset();
  importPKCS8Mock.mockReset();
  signMock.mockReset();
  delete process.env.APPLE_MUSIC_TOKEN;
  process.env.APPLE_MUSIC_KEY_ID = "test-key-id";
  process.env.APPLE_MUSIC_TEAM_ID = "test-team-id";
  process.env.APPLE_MUSIC_PRIVATE_KEY = testPrivateKey;
});

afterEach(() => {
  restoreEnvironment();
});

describe("Apple Music authenticated request boundary", () => {
  it("uses an existing static developer token without signing another token", async () => {
    process.env.APPLE_MUSIC_TOKEN = "static-test-token";
    fetchWithTimeoutMock.mockResolvedValue(new Response(null, { status: 200 }));
    const { appleMusicFetch } = await import("../adapter.js");

    await appleMusicFetch("/catalog/us/charts?types=songs");

    expect(importPKCS8Mock).not.toHaveBeenCalled();
    expect(signMock).not.toHaveBeenCalled();
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/us/charts?types=songs",
      { headers: { Authorization: "Bearer static-test-token" } },
      5000,
    );
  });

  it("signs a developer token once and reuses it for the crawler request boundary", async () => {
    importPKCS8Mock.mockResolvedValue({});
    signMock.mockResolvedValue("signed-test-token");
    fetchWithTimeoutMock.mockResolvedValue(new Response(null, { status: 200 }));
    const { appleMusicFetch, assertAppleMusicDeveloperToken } = await import("../adapter.js");

    await assertAppleMusicDeveloperToken();
    await appleMusicFetch("/catalog/at/charts?types=songs");

    expect(importPKCS8Mock).toHaveBeenCalledWith(
      normalizedTestPrivateKey,
      "ES256",
    );
    expect(signMock).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/at/charts?types=songs",
      { headers: { Authorization: "Bearer signed-test-token" } },
      5000,
    );
  });
});

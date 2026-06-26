/**
 * @file Unit tests for the GitHub OAuth HTTP layer (`developer-github.ts`,
 * MC-065). Exercises the pure service in isolation: `fetch` is stubbed
 * globally (mirroring `email-provider.test.ts`) and the three required env
 * vars are stubbed via `vi.stubEnv`, so no network and no real config are
 * touched. The route layer's state/session/account logic is out of scope here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGitHubAuthorizeUrl, exchangeGitHubCode, fetchGitHubProfile, GitHubOAuth } from "./developer-github.js";

const fetchMock = vi.fn();

/** Developer Astro app base URL stubbed for the redirect_uri assertions. */
const DEVELOPER_URL = "https://developer.musiccloud.io";

describe("developer-github service (MC-065)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "client-id-123");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "client-secret-456");
    vi.stubEnv("DEVELOPER_URL", DEVELOPER_URL);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("buildGitHubAuthorizeUrl", () => {
    it("builds the authorize URL with client_id, scope, redirect_uri and the round-tripped state", () => {
      const url = new URL(buildGitHubAuthorizeUrl("st"));

      expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
      expect(url.searchParams.get("client_id")).toBe("client-id-123");
      expect(url.searchParams.get("scope")).toBe(GitHubOAuth.Scope);
      expect(url.searchParams.get("redirect_uri")).toBe(`${DEVELOPER_URL}/auth/github/callback`);
      expect(url.searchParams.get("state")).toBe("st");
      // The raw query string carries the URL-encoded scope (read%3Auser …).
      expect(buildGitHubAuthorizeUrl("st")).toContain("scope=read%3Auser");
    });
  });

  describe("exchangeGitHubCode", () => {
    it("returns the access token on a 200 with { access_token }", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: "gho_token" }) });

      await expect(exchangeGitHubCode("code-1")).resolves.toBe("gho_token");

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://github.com/login/oauth/access_token");
      const body = JSON.parse(options.body as string);
      expect(body.client_id).toBe("client-id-123");
      expect(body.client_secret).toBe("client-secret-456");
      expect(body.code).toBe("code-1");
      expect(body.redirect_uri).toBe(`${DEVELOPER_URL}/auth/github/callback`);
    });

    it("throws when GitHub returns a non-2xx response", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

      await expect(exchangeGitHubCode("code-1")).rejects.toThrow(/token exchange failed \(401\)/);
    });

    it("throws when a 200 response carries an error and no token", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: "bad_verification_code" }) });

      await expect(exchangeGitHubCode("code-1")).rejects.toThrow(/no token: bad_verification_code/);
    });
  });

  describe("fetchGitHubProfile", () => {
    /** Builds a fake `Response`-like object the fetch mock resolves to. */
    function jsonResponse(ok: boolean, status: number, payload: unknown) {
      return { ok, status, json: async () => payload };
    }

    it("maps the /user fields and takes the verified primary email from /user/emails", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(true, 200, {
            id: 42,
            login: "octocat",
            name: "The Octocat",
            avatar_url: "https://avatars.example/octocat.png",
            email: null,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(true, 200, [
            { email: "secondary@example.com", primary: false, verified: true },
            { email: "primary@example.com", primary: true, verified: true },
          ]),
        );

      const profile = await fetchGitHubProfile("gho_token");

      expect(profile).toEqual({
        id: "42",
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://avatars.example/octocat.png",
        email: "primary@example.com",
      });
      // The /user call carries the Bearer token.
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>).Authorization).toBe("Bearer gho_token");
    });

    it("resolves email to null when no primary email is verified", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(true, 200, { id: 7, login: "noverify", name: null, avatar_url: null, email: null }),
        )
        .mockResolvedValueOnce(
          jsonResponse(true, 200, [{ email: "primary@example.com", primary: true, verified: false }]),
        );

      const profile = await fetchGitHubProfile("gho_token");

      expect(profile.email).toBeNull();
      expect(profile.id).toBe("7");
      expect(profile.name).toBeNull();
      expect(profile.avatarUrl).toBeNull();
    });

    it("throws when the /user call returns a non-2xx response", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(false, 403, {}));

      await expect(fetchGitHubProfile("gho_token")).rejects.toThrow(/user fetch failed \(403\)/);
    });
  });
});

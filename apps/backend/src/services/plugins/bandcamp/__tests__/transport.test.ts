import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable";
import { bandcampTransport, curlRunner, isBandcampUrl, isClientChallenge } from "../transport";

/** A request budget long enough that no test depends on it. */
const TIMEOUT_MS = 8000;

/** An album page address on an artist subdomain. */
const ALBUM_URL = "https://someartist.bandcamp.com/album/cool-album";

/** What `curl` writes to stderr for an answer, in the order `--write-out` asks for. */
function curlStderr(status: number, redirectUrl = "", contentType = "text/html; charset=UTF-8"): string {
  return `${status}\n${redirectUrl}\n${contentType}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Bandcamp transport: which addresses it requests", () => {
  /**
   * The transport replaces `fetchWithTimeout`'s guard against private
   * addresses with this list, so anything outside Bandcamp's own hosts over
   * https must be refused.
   */
  it.each([
    ["https://bandcamp.com/api/fuzzysearch/2/app_autocomplete?q=x", true],
    ["https://someartist.bandcamp.com/album/cool-album", true],
    ["http://someartist.bandcamp.com/album/cool-album", false],
    ["https://evilbandcamp.com/album/x", false],
    ["https://bandcamp.com.attacker.example/album/x", false],
    ["https://a.b.bandcamp.com/album/x", false],
    ["https://someartist.bandcamp.com:8443/album/x", false],
    ["https://user:secret@someartist.bandcamp.com/album/x", false],
    ["https://127.0.0.1/album/x", false],
  ])("%s -> %s", (address, allowed) => {
    expect(isBandcampUrl(new URL(address))).toBe(allowed);
  });

  it("refuses an address outside Bandcamp without running curl", async () => {
    const run = vi.spyOn(curlRunner, "run");

    await expect(bandcampTransport.request("https://example.com/", TIMEOUT_MS)).rejects.toThrow(
      "Blocked non-Bandcamp request target",
    );
    expect(run).not.toHaveBeenCalled();
  });
});

describe("Bandcamp transport: the curl call", () => {
  it("passes the URL after `--`, reads no .curlrc, and follows no redirect by itself", async () => {
    const run = vi.spyOn(curlRunner, "run").mockResolvedValue({ stdout: "<html>page</html>", stderr: curlStderr(200) });

    await bandcampTransport.request(ALBUM_URL, TIMEOUT_MS);

    const [args] = run.mock.calls[0] ?? [[]];
    expect(args[0]).toBe("-q");
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe(ALBUM_URL);
    expect(args[args.indexOf("--max-redirs") + 1]).toBe("0");
    expect(args[args.indexOf("--proto") + 1]).toBe("=https");
  });

  it("returns the answer as a Response with its status, content type and body", async () => {
    vi.spyOn(curlRunner, "run").mockResolvedValue({
      stdout: '{"results":[]}',
      stderr: curlStderr(200, "", "application/json"),
    });

    const response = await bandcampTransport.request(
      "https://bandcamp.com/api/fuzzysearch/2/app_autocomplete?q=x",
      TIMEOUT_MS,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ results: [] });
  });

  /** An error status is Bandcamp's answer, so the adapter decides what a 404 means. */
  it("returns an error status instead of throwing", async () => {
    vi.spyOn(curlRunner, "run").mockResolvedValue({ stdout: "Not Found", stderr: curlStderr(404) });

    const response = await bandcampTransport.request(ALBUM_URL, TIMEOUT_MS);

    expect(response.status).toBe(404);
  });
});

describe("Bandcamp transport: redirects", () => {
  it("follows a redirect to another Bandcamp address", async () => {
    const target = "https://someartist.bandcamp.com/album/cool-album-2";
    const run = vi
      .spyOn(curlRunner, "run")
      .mockResolvedValueOnce({ stdout: "", stderr: curlStderr(301, target) })
      .mockResolvedValueOnce({ stdout: "<html>moved here</html>", stderr: curlStderr(200) });

    const response = await bandcampTransport.request(ALBUM_URL, TIMEOUT_MS);

    expect(await response.text()).toBe("<html>moved here</html>");
    expect(run.mock.calls[1]?.[0].at(-1)).toBe(target);
  });

  it("refuses a redirect that leaves Bandcamp", async () => {
    const run = vi
      .spyOn(curlRunner, "run")
      .mockResolvedValueOnce({ stdout: "", stderr: curlStderr(302, "http://169.254.169.254/latest/meta-data") });

    await expect(bandcampTransport.request(ALBUM_URL, TIMEOUT_MS)).rejects.toThrow(
      "Blocked non-Bandcamp request target",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    vi.spyOn(curlRunner, "run").mockResolvedValue({ stdout: "", stderr: curlStderr(302, ALBUM_URL) });

    await expect(bandcampTransport.request(ALBUM_URL, TIMEOUT_MS)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("Bandcamp transport: failures", () => {
  /** A page title and an asset path each identify the challenge, since either may change on its own. */
  it.each([
    ["<html><head><title>Client Challenge</title></head></html>", true],
    ['<html><link href="/_fs-ch-abc/assets/styles.css"></html>', true],
    ['<html><script type="application/ld+json">{"@type":"MusicAlbum"}</script></html>', false],
  ])("isClientChallenge(%s) -> %s", (body, challenge) => {
    expect(isClientChallenge(body)).toBe(challenge);
  });

  it("throws and logs when the CDN answers with its client challenge", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(curlRunner, "run").mockResolvedValue({
      stdout: "<html><head><title>Client Challenge</title></head></html>",
      stderr: curlStderr(200),
    });

    await expect(bandcampTransport.request(ALBUM_URL, TIMEOUT_MS)).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(JSON.stringify(warn.mock.calls)).toContain("client_challenge");
  });

  it("throws and logs when curl fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(curlRunner, "run").mockRejectedValue(new Error("curl: (28) Operation timed out"));

    await expect(bandcampTransport.request(ALBUM_URL, TIMEOUT_MS)).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(JSON.stringify(warn.mock.calls)).toContain("curl_failed");
  });

  it("throws when curl reports no HTTP status", async () => {
    vi.spyOn(curlRunner, "run").mockResolvedValue({ stdout: "", stderr: curlStderr(0) });

    await expect(bandcampTransport.request(ALBUM_URL, TIMEOUT_MS)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

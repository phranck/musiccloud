import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.fn();

vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { fetchLastFmArtistInfo } from "../artist-info";

const originalApiKey = process.env.LASTFM_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

async function fetchBioSummary(summary: string): Promise<string | null | undefined> {
  fetchWithTimeoutMock.mockResolvedValue(
    jsonResponse({
      artist: {
        bio: { summary },
        stats: { playcount: "42", listeners: "21" },
        similar: { artist: [] },
      },
    }),
  );

  return (await fetchLastFmArtistInfo("Test Artist"))?.bioSummary;
}

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  process.env.LASTFM_API_KEY = "test-key";
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = originalApiKey;
});

describe("fetchLastFmArtistInfo biography normalization", () => {
  it("preserves readable block spacing, entities, formatting, and anchor labels as plain text", async () => {
    const summary = await fetchBioSummary(
      '<p>Artist &amp; Band made <strong>dream pop</strong>.</p><p>Visit <a href="https://example.com">the official site</a> for details.</p>',
    );

    expect(summary).toBe("Artist & Band made dream pop. Visit the official site for details.");
  });

  it("drops malformed script elements and everything the HTML parser keeps inside them", async () => {
    const summary = await fetchBioSummary(
      '<p>Readable opening.</p><script>alert("owned")</scr<script>ipt><p>Untrusted trailing text.</p>',
    );

    expect(summary).toBe("Readable opening.");
    expect(summary).not.toContain("alert");
    expect(summary).not.toContain("script");
  });

  it("drops event-handler image and SVG payloads while retaining surrounding prose", async () => {
    const summary = await fetchBioSummary(
      '<p onclick="alert(1)">Safe biography.</p><img src=x onerror="alert(2)"><svg onload="alert(3)"><script>alert(4)</script><text>SVG payload</text></svg><p>Still readable.</p>',
    );

    expect(summary).toBe("Safe biography. Still readable.");
    expect(summary).not.toMatch(/onerror|onload|alert|SVG|<|>/);
  });

  it("ignores comments and reparses entity-encoded markup before returning plain text", async () => {
    const summary = await fetchBioSummary(
      "<!-- private --><p>&lt;img src=x onerror=alert(1)&gt;Readable &amp; calm.</p>",
    );

    expect(summary).toBe("Readable & calm.");
    expect(summary).not.toMatch(/comment|onerror|alert|img|<|>/);
  });

  it("returns null when active or foreign-content payloads contain no safe prose", async () => {
    const summary = await fetchBioSummary(
      '<script src="https://evil.example/payload.js">alert(1)</script><!-- hidden --><svg><text>payload</text></svg>',
    );

    expect(summary).toBeNull();
  });

  it("keeps the existing missing-key and request-error contracts", async () => {
    delete process.env.LASTFM_API_KEY;
    await expect(fetchLastFmArtistInfo("Test Artist")).resolves.toBeNull();
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();

    process.env.LASTFM_API_KEY = "test-key";
    fetchWithTimeoutMock.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchLastFmArtistInfo("Test Artist")).resolves.toBeNull();
  });
});

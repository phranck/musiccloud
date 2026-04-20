import dns from "node:dns/promises";
import net from "node:net";

/**
 * Timeout-enforcing fetch wrapper with SSRF guard.
 *
 * Why the timeout: every external HTTP call must abort after a bounded time.
 * A hanging fetch blocks a resolver entry point, starves the event loop under
 * load, and leaks the timer reference. Without this guardrail a single
 * misbehaving upstream (e.g. Qobuz geo-block timeout, Tidal 504) can wedge
 * the whole resolve queue.
 *
 * Why 5000ms default: below that, slow-but-healthy upstreams (Melon, KKBOX,
 * cross-region Spotify) trip falsely. Above 10s, the frontend spinner feels
 * broken. 5s is the empirical middle ground. Adapters that need more (e.g.
 * Bandcamp HTML scrapes) pass an explicit override.
 *
 * Why the `finally` clearTimeout: without it, a successful fast response
 * still keeps the timer alive until the abort fires, holding a Node handle
 * open and preventing process shutdown in tests.
 *
 * Why the SSRF guard: URLs sometimes originate from user-provided links
 * (share page resolvers, scraper adapters). Without validation an attacker
 * could force the backend to fetch `http://169.254.169.254/...` (cloud
 * metadata) or an internal service. We resolve the hostname and reject any
 * target in a reserved/private range before issuing the request.
 */

const blockedV4: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const blockedV6: ReadonlyArray<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

const ssrfBlockList = new net.BlockList();
for (const [addr, prefix] of blockedV4) ssrfBlockList.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of blockedV6) ssrfBlockList.addSubnet(addr, prefix, "ipv6");

async function assertPublicUrl(target: URL): Promise<void> {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`Blocked non-http(s) URL scheme: ${target.protocol}`);
  }
  const host = target.hostname;
  const literal = net.isIP(host);
  const addresses = literal ? [{ address: host, family: literal as 4 | 6 }] : await dns.lookup(host, { all: true });
  for (const { address, family } of addresses) {
    const kind = family === 4 ? "ipv4" : "ipv6";
    if (ssrfBlockList.check(address, kind)) {
      throw new Error(`Blocked non-public host: ${host} -> ${address}`);
    }
  }
}

export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  await assertPublicUrl(new URL(url));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

import type { LookupAddress } from "node:dns";
import dns from "node:dns/promises";
import net from "node:net";
import { Agent, type RequestInit as UndiciRequestInit } from "undici";

/**
 * Timeout-enforcing fetch wrapper with an SSRF guard.
 *
 * Each request hop is resolved and validated before an Undici transport pins
 * that exact address set at connection time. Redirects are followed manually
 * so no destination can bypass the same policy. One abort timer covers the
 * complete redirect chain.
 */

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ENTITY_HEADERS = [
  "content-encoding",
  "content-language",
  "content-length",
  "content-location",
  "content-type",
  "transfer-encoding",
] as const;
const CREDENTIAL_HEADERS = ["authorization", "proxy-authorization", "cookie", "cookie2"] as const;

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
  ["::", 96],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

const ssrfBlockList = new net.BlockList();
for (const [address, prefix] of blockedV4) ssrfBlockList.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of blockedV6) ssrfBlockList.addSubnet(address, prefix, "ipv6");

const globalUnicastV6 = new net.BlockList();
globalUnicastV6.addSubnet("2000::", 3, "ipv6");

export type ResolveAddresses = (hostname: string) => Promise<readonly LookupAddress[]>;

export type OutboundTransport = (
  target: URL,
  init: RequestInit,
  addresses: readonly LookupAddress[],
) => Promise<Response>;

interface OutboundFetchDependencies {
  resolve: ResolveAddresses;
  transport: OutboundTransport;
}

const defaultResolve: ResolveAddresses = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

const defaultDependencies: OutboundFetchDependencies = {
  resolve: defaultResolve,
  transport: requestWithPinnedAddresses,
};

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function parseSafeUrl(url: string): URL {
  try {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Blocked non-http(s) outbound URL scheme");
    }
    if (target.username || target.password) {
      throw new Error("Blocked outbound URL credentials");
    }
    return target;
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message === "Blocked non-http(s) outbound URL scheme" ||
        cause.message === "Blocked outbound URL credentials")
    ) {
      throw cause;
    }
    throw new Error("Invalid outbound URL");
  }
}

function parseRedirectUrl(location: string, currentTarget: URL): URL {
  try {
    return parseSafeUrl(new URL(location, currentTarget).href);
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message === "Blocked non-http(s) outbound URL scheme" ||
        cause.message === "Blocked outbound URL credentials")
    ) {
      throw cause;
    }
    throw new Error("Invalid outbound redirect");
  }
}

function mappedIpv4Address(address: string): string | undefined {
  const normalized = address.toLowerCase();
  const prefix = normalized.startsWith("::ffff:")
    ? "::ffff:"
    : normalized.startsWith("0:0:0:0:0:ffff:")
      ? "0:0:0:0:0:ffff:"
      : undefined;
  if (!prefix) return undefined;

  const suffix = normalized.slice(prefix.length);
  if (net.isIP(suffix) === 4) return suffix;

  const hextets = suffix.split(":");
  if (hextets.length !== 2 || hextets.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return undefined;

  const high = Number.parseInt(hextets[0] ?? "", 16);
  const low = Number.parseInt(hextets[1] ?? "", 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPublicAddress({ address, family }: LookupAddress): boolean {
  if (family === 4 && net.isIP(address) === 4) {
    return !ssrfBlockList.check(address, "ipv4");
  }
  if (family === 6 && net.isIP(address) === 6) {
    const mapped = mappedIpv4Address(address);
    return mapped
      ? !ssrfBlockList.check(mapped, "ipv4")
      : globalUnicastV6.check(address, "ipv6") && !ssrfBlockList.check(address, "ipv6");
  }
  return false;
}

function freezeValidatedAddresses(addresses: readonly LookupAddress[]): readonly LookupAddress[] {
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error("Blocked non-public outbound target");
  }
  return Object.freeze(addresses.map((address) => Object.freeze({ ...address })));
}

function waitForAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const rejectOnAbort = () => reject(signal.reason);
    if (signal.aborted) {
      rejectOnAbort();
      return;
    }

    signal.addEventListener("abort", rejectOnAbort, { once: true });
    operation.then(
      (result) => {
        signal.removeEventListener("abort", rejectOnAbort);
        resolve(result);
      },
      (cause) => {
        signal.removeEventListener("abort", rejectOnAbort);
        reject(cause);
      },
    );
  });
}

async function resolvePublicAddresses(
  target: URL,
  resolve: ResolveAddresses,
  signal: AbortSignal,
): Promise<readonly LookupAddress[]> {
  signal.throwIfAborted();
  const hostname = normalizeHostname(target.hostname);
  const literalFamily = net.isIP(hostname);
  let addresses: readonly LookupAddress[];
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily as 4 | 6 }];
  } else {
    try {
      addresses = await waitForAbort(resolve(hostname), signal);
    } catch {
      signal.throwIfAborted();
      throw new Error("Outbound DNS resolution failed");
    }
  }
  return freezeValidatedAddresses(addresses);
}

function createPinnedLookup(addresses: readonly LookupAddress[]): net.LookupFunction {
  return (_hostname, options, callback) => {
    const family = options.family === 4 || options.family === 6 ? options.family : undefined;
    const matching = family ? addresses.filter((address) => address.family === family) : addresses;
    if (matching.length === 0) {
      const error = new Error("No validated address matches the requested family") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "");
      return;
    }

    if (options.all) {
      callback(
        null,
        matching.map((address) => ({ ...address })),
      );
      return;
    }

    const selected = matching[0];
    if (!selected) {
      callback(new Error("No validated outbound address"), "");
      return;
    }
    callback(null, selected.address, selected.family);
  };
}

function transportTarget(target: URL): string {
  return target.pathname === "/" && target.search === "" && target.hash === "" ? target.origin : target.href;
}

async function requestWithPinnedAddresses(
  target: URL,
  init: RequestInit,
  addresses: readonly LookupAddress[],
): Promise<Response> {
  const dispatcher = new Agent({ connect: { lookup: createPinnedLookup(addresses) } });
  try {
    const requestInit: RequestInit & UndiciRequestInit = {
      ...(init as RequestInit & UndiciRequestInit),
      dispatcher,
    };
    const response = await globalThis.fetch(transportTarget(target), requestInit);
    void dispatcher.close().catch(() => dispatcher.destroy());
    return response;
  } catch {
    try {
      await dispatcher.destroy();
    } catch {
      // The public error must never expose transport or dispatcher details.
    }
    init.signal?.throwIfAborted();
    throw new Error("Outbound request failed");
  }
}

function redirectedRequestInit(init: RequestInit, status: number, from: URL, to: URL): RequestInit {
  const method = (init.method ?? "GET").toUpperCase();
  const changesToGet =
    ((status === 301 || status === 302) && method === "POST") ||
    (status === 303 && method !== "GET" && method !== "HEAD");
  const crossesOrigin = from.origin !== to.origin;

  if (!changesToGet && !crossesOrigin) return init;

  const headers = new Headers(init.headers);
  if (changesToGet) {
    for (const header of ENTITY_HEADERS) headers.delete(header);
  }
  if (crossesOrigin) {
    for (const header of CREDENTIAL_HEADERS) headers.delete(header);
  }

  return {
    ...init,
    ...(changesToGet ? { body: undefined, method: "GET" } : {}),
    headers,
  };
}

async function cancelRedirectBody(response: Response, signal: AbortSignal): Promise<void> {
  if (!response.body) return;
  try {
    await waitForAbort(response.body.cancel(), signal);
  } catch {
    signal.throwIfAborted();
    throw new Error("Outbound redirect cleanup failed");
  }
}

async function followValidatedRedirects(
  initialTarget: URL,
  callerInit: RequestInit | undefined,
  signal: AbortSignal,
  dependencies: OutboundFetchDependencies,
): Promise<Response> {
  const redirectPolicy = callerInit?.redirect ?? "follow";
  let target = initialTarget;
  let requestInit: RequestInit = { ...callerInit, redirect: "manual", signal };
  let redirectsFollowed = 0;

  while (true) {
    const addresses = await resolvePublicAddresses(target, dependencies.resolve, signal);
    const response = await dependencies.transport(target, requestInit, addresses);
    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || location === null) return response;

    if (redirectPolicy === "manual") return response;
    await cancelRedirectBody(response, signal);
    if (redirectPolicy === "error") {
      throw new Error("Outbound redirect blocked by caller policy");
    }
    if (redirectsFollowed >= MAX_REDIRECTS) {
      throw new Error("Outbound redirect limit exceeded");
    }

    const nextTarget = parseRedirectUrl(location, target);
    requestInit = redirectedRequestInit(requestInit, response.status, target, nextTarget);
    target = nextTarget;
    redirectsFollowed += 1;
  }
}

export function createFetchWithTimeout(dependencies: OutboundFetchDependencies = defaultDependencies) {
  return async function guardedFetch(url: string, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const signal = init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await followValidatedRedirects(parseSafeUrl(url), init, signal, dependencies);
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const fetchWithTimeout = createFetchWithTimeout();

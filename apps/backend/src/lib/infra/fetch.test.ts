import type { LookupAddress } from "node:dns";
import { inspect } from "node:util";
import { Agent, type RequestInit as UndiciRequestInit } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFetchWithTimeout, fetchWithTimeout, type OutboundTransport, type ResolveAddresses } from "./fetch.js";

const PUBLIC_V4 = { address: "93.184.216.34", family: 4 } as const;

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { headers: { location }, status });
}

function createGuardedFetch(overrides: Partial<{ resolve: ResolveAddresses; transport: OutboundTransport }> = {}) {
  const resolve =
    overrides.resolve ??
    vi.fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>().mockResolvedValue([PUBLIC_V4]);
  const transport =
    overrides.transport ??
    vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>().mockResolvedValue(new Response("ok"));

  return {
    guardedFetch: createFetchWithTimeout({ resolve, transport }),
    resolve,
    transport,
  };
}

function expectSafeError(error: unknown, message: string, sensitiveValues: readonly string[] = []): void {
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(message);
  expect(Object.hasOwn(error as object, "cause")).toBe(false);

  const completeError = inspect(error, { depth: null, showHidden: true });
  for (const sensitiveValue of sensitiveValues) {
    expect(completeError).not.toContain(sensitiveValue);
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe("fetchWithTimeout outbound policy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "http://127.0.0.1/private",
    "http://[::1]/private",
  ])("blocks private literal %s before transport", async (url) => {
    const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>();
    const { guardedFetch, resolve } = createGuardedFetch({ transport });

    await expect(guardedFetch(url)).rejects.toThrow("Blocked non-public outbound target");

    expect(resolve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("blocks embedded URL credentials before resolution or transport", async () => {
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValue(new Response("unexpected transport call"));
    const { guardedFetch, resolve } = createGuardedFetch({ transport });

    const error = await guardedFetch("https://user:password@public.example/path?token=secret").catch(
      (cause: unknown) => cause,
    );

    expectSafeError(error, "Blocked outbound URL credentials", ["user", "password", "token", "secret"]);
    expect(resolve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("removes sensitive production transport causes from the complete error object", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("request failed for https://93.184.216.34/path?token=secret"),
    );

    const error = await fetchWithTimeout("https://93.184.216.34/path?token=secret").catch((cause: unknown) => cause);

    expectSafeError(error, "Outbound request failed", ["token", "secret"]);
  });

  it("uses the global fetch entry with a string target and pinned dispatcher", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("ok"));

    await fetchWithTimeout("https://93.184.216.34/path");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [target, init] = fetchSpy.mock.calls[0] ?? [];
    expect(target).toBe("https://93.184.216.34/path");
    expect((init as UndiciRequestInit | undefined)?.dispatcher).toBeInstanceOf(Agent);
  });

  it("preserves an origin-only input without adding a trailing slash", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("ok"));

    await fetchWithTimeout("https://93.184.216.34");

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://93.184.216.34");
  });

  it("preserves caller AbortError semantics through the production transport", async () => {
    const caller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      async (_target: unknown, init: RequestInit | undefined) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(init.signal.reason);
            return;
          }
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        }),
    );

    const request = fetchWithTimeout("https://93.184.216.34/slow", { signal: caller.signal });
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    caller.abort();

    await rejection;
  });

  it.each([
    { address: "10.0.0.1", family: 4 },
    { address: "2001:db8::1", family: 6 },
    { address: "::ffff:127.0.0.1", family: 6 },
  ] satisfies LookupAddress[])("blocks a hostname resolving to $address", async (blockedAddress) => {
    const resolve = vi
      .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
      .mockResolvedValue([PUBLIC_V4, blockedAddress]);
    const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>();
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://private.example/path")).rejects.toThrow("Blocked non-public outbound target");

    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["4000::1", "100:0:0:1::"])("fails closed for non-global native IPv6 address %s", async (address) => {
    const resolve = vi
      .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
      .mockResolvedValue([{ address, family: 6 }]);
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValue(new Response("unexpected transport call"));
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://non-global.example/path")).rejects.toThrow("Blocked non-public outbound target");
    expect(transport).not.toHaveBeenCalled();
  });

  it("allows a globally routable native IPv6 address", async () => {
    const address = { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 } as const;
    const resolve = vi.fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>().mockResolvedValue([address]);
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValue(new Response("ok"));
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://public-v6.example/path")).resolves.toBeInstanceOf(Response);
    expect(transport.mock.calls[0]?.[2]).toEqual([address]);
  });

  it("rejects an empty hostname resolution", async () => {
    const resolve = vi.fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>().mockResolvedValue([]);
    const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>();
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://empty.example/path")).rejects.toThrow("Blocked non-public outbound target");
    expect(transport).not.toHaveBeenCalled();
  });

  it("redacts resolver rejection details from the complete error object", async () => {
    const sensitiveHostname = "api-token-supersecret.invalid";
    const resolverError = new Error(`getaddrinfo ENOTFOUND ${sensitiveHostname} token=supersecret`);
    Object.defineProperty(resolverError, "hostname", { value: sensitiveHostname });
    const resolve = vi
      .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
      .mockRejectedValue(resolverError);
    const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>();
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    const error = await guardedFetch(`https://${sensitiveHostname}/path?token=supersecret`).catch(
      (cause: unknown) => cause,
    );

    expectSafeError(error, "Outbound DNS resolution failed", [sensitiveHostname, "token", "supersecret"]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("allows a public IPv4-mapped IPv6 resolution", async () => {
    const address = { address: "::ffff:93.184.216.34", family: 6 } as const;
    const resolve = vi.fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>().mockResolvedValue([address]);
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValue(new Response("ok"));
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://public.example/path")).resolves.toBeInstanceOf(Response);
    expect(transport.mock.calls[0]?.[2]).toEqual([address]);
  });

  it("pins the validated resolution passed to the transport", async () => {
    const resolve = vi
      .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValue(new Response("ok"));
    const guardedFetch = createFetchWithTimeout({ resolve, transport });

    await guardedFetch("https://public.example/path?token=secret");

    expect(resolve).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[2]).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(Object.isFrozen(transport.mock.calls[0]?.[2])).toBe(true);
    expect(Object.isFrozen(transport.mock.calls[0]?.[2][0])).toBe(true);
  });

  it("blocks a public-to-private redirect before the second transport request", async () => {
    const resolve = vi
      .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
      .mockResolvedValueOnce([PUBLIC_V4])
      .mockResolvedValueOnce([{ address: "10.0.0.8", family: 4 }]);
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValueOnce(redirectResponse("http://internal.example/private"));
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://public.example/start")).rejects.toThrow("Blocked non-public outbound target");

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("follows a public multi-hop redirect chain", async () => {
    const firstAddresses = [{ address: "93.184.216.34", family: 4 }] as const;
    const secondAddresses = [{ address: "142.250.185.78", family: 4 }] as const;
    const thirdAddresses = [{ address: "151.101.1.69", family: 4 }] as const;
    const resolve = vi
      .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
      .mockResolvedValueOnce(firstAddresses)
      .mockResolvedValueOnce(secondAddresses)
      .mockResolvedValueOnce(thirdAddresses);
    const finalResponse = new Response("done", { status: 200 });
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValueOnce(redirectResponse("https://second.example/next", 307))
      .mockResolvedValueOnce(redirectResponse("/final", 308))
      .mockResolvedValueOnce(finalResponse);
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://first.example/start")).resolves.toBe(finalResponse);

    expect(resolve.mock.calls.map(([hostname]) => hostname)).toEqual([
      "first.example",
      "second.example",
      "second.example",
    ]);
    expect(transport.mock.calls.map(([target]) => target.href)).toEqual([
      "https://first.example/start",
      "https://second.example/next",
      "https://second.example/final",
    ]);
    expect(transport.mock.calls.map(([, init]) => init.redirect)).toEqual(["manual", "manual", "manual"]);
    expect(transport.mock.calls.map(([, , addresses]) => addresses)).toEqual([
      firstAddresses,
      secondAddresses,
      thirdAddresses,
    ]);
  });

  it.each([
    "file:///etc/passwd",
    "ftp://user:password@example.com/archive?token=secret",
  ])("blocks non-HTTP scheme %s before resolution", async (url) => {
    const { guardedFetch, resolve, transport } = createGuardedFetch();

    const error = await guardedFetch(url).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Blocked non-http(s) outbound URL scheme");
    expect((error as Error).message).not.toContain("password");
    expect((error as Error).message).not.toContain("secret");
    expect(resolve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("stops after five followed redirect hops", async () => {
    const resolve = vi.fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>().mockResolvedValue([PUBLIC_V4]);
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockImplementation(async (target) => redirectResponse(`/hop-${Number(target.pathname.split("-")[1] ?? 0) + 1}`));
    const { guardedFetch } = createGuardedFetch({ resolve, transport });

    await expect(guardedFetch("https://public.example/hop-0")).rejects.toThrow("Outbound redirect limit exceeded");

    expect(transport).toHaveBeenCalledTimes(6);
    expect(resolve).toHaveBeenCalledTimes(6);
  });

  it("waits for redirect body cancellation before starting the next transport", async () => {
    let releaseCancellation: (() => void) | undefined;
    let markCancellationStarted: (() => void) | undefined;
    const cancellation = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const cancellationStarted = new Promise<void>((resolve) => {
      markCancellationStarted = resolve;
    });
    const redirect = new Response(
      new ReadableStream({
        cancel: () => {
          markCancellationStarted?.();
          return cancellation;
        },
      }),
      { headers: { location: "/next" }, status: 302 },
    );
    const finalResponse = new Response("ok");
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(finalResponse);
    const { guardedFetch } = createGuardedFetch({ transport });

    const request = guardedFetch("https://public.example/start");
    await cancellationStarted;
    await flushMicrotasks();

    expect(transport).toHaveBeenCalledOnce();
    releaseCancellation?.();
    await expect(request).resolves.toBe(finalResponse);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("waits for redirect body cancellation before rejecting redirect error policy", async () => {
    let releaseCancellation: (() => void) | undefined;
    let markCancellationStarted: (() => void) | undefined;
    const cancellation = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const cancellationStarted = new Promise<void>((resolve) => {
      markCancellationStarted = resolve;
    });
    const redirect = new Response(
      new ReadableStream({
        cancel: () => {
          markCancellationStarted?.();
          return cancellation;
        },
      }),
      { headers: { location: "/next" }, status: 302 },
    );
    const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>().mockResolvedValue(redirect);
    const { guardedFetch } = createGuardedFetch({ transport });
    let settled = false;

    const request = guardedFetch("https://public.example/start", { redirect: "error" });
    const rejection = expect(request).rejects.toThrow("Outbound redirect blocked by caller policy");
    void request.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await cancellationStarted;
    await flushMicrotasks();

    expect(settled).toBe(false);
    releaseCancellation?.();
    await rejection;
  });

  it("handles redirect body cancellation rejection with a safe error", async () => {
    const redirect = new Response(
      new ReadableStream({
        cancel: () => Promise.reject(new Error("cleanup failed for https://next.example/?token=secret")),
      }),
      { headers: { location: "/next" }, status: 302 },
    );
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(new Response("unexpected transport call"));
    const { guardedFetch } = createGuardedFetch({ transport });

    const error = await guardedFetch("https://public.example/start").catch((cause: unknown) => cause);

    expectSafeError(error, "Outbound redirect cleanup failed", ["next.example", "token", "secret"]);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("aborts a pending redirect body cancellation at the whole-chain timeout", async () => {
    vi.useFakeTimers();
    try {
      const redirect = new Response(
        new ReadableStream({
          cancel: () => new Promise<void>(() => undefined),
        }),
        { headers: { location: "/next" }, status: 302 },
      );
      const transport = vi
        .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
        .mockResolvedValueOnce(redirect)
        .mockResolvedValueOnce(new Response("unexpected transport call"));
      const { guardedFetch } = createGuardedFetch({ transport });

      const request = guardedFetch("https://public.example/start", undefined, 25);
      const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      expect(transport).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns redirect responses unchanged for redirect manual", async () => {
    const redirect = redirectResponse("https://next.example/path", 301);
    const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>().mockResolvedValue(redirect);
    const { guardedFetch, resolve } = createGuardedFetch({ transport });

    await expect(guardedFetch("https://public.example/start", { redirect: "manual" })).resolves.toBe(redirect);

    expect(resolve).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[1].redirect).toBe("manual");
  });

  it("rejects redirects with a safe error for redirect error", async () => {
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValue(redirectResponse("https://user:password@next.example/path?token=secret"));
    const { guardedFetch, resolve } = createGuardedFetch({ transport });

    const error = await guardedFetch("https://public.example/start", { redirect: "error" }).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Outbound redirect blocked by caller policy");
    expect((error as Error).message).not.toContain("password");
    expect((error as Error).message).not.toContain("secret");
    expect(resolve).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("aborts the transport when the whole-chain timeout expires", async () => {
    vi.useFakeTimers();
    try {
      let transportSignal: AbortSignal | undefined;
      const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>().mockImplementation(
        async (_target, init) =>
          new Promise<Response>((_resolve, reject) => {
            transportSignal = init.signal ?? undefined;
            transportSignal?.addEventListener("abort", () => reject(transportSignal?.reason), { once: true });
          }),
      );
      const { guardedFetch } = createGuardedFetch({ transport });

      const request = guardedFetch("https://public.example/slow", undefined, 25);
      const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      expect(transportSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops waiting for DNS when the whole-chain timeout expires", async () => {
    vi.useFakeTimers();
    try {
      const resolve = vi
        .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
        .mockImplementation(async () => new Promise<readonly LookupAddress[]>(() => undefined));
      const transport = vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>();
      const { guardedFetch } = createGuardedFetch({ resolve, transport });

      const request = guardedFetch("https://public.example/slow-dns", undefined, 25);
      const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      expect(transport).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves caller RequestInit without mutating it", async () => {
    const headers = new Headers({
      authorization: "Bearer token",
      "content-type": "text/plain",
      "x-requested-with": "musiccloud",
    });
    const init: RequestInit = {
      body: "payload",
      cache: "no-cache",
      credentials: "include",
      headers,
      method: "PUT",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    };
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValue(new Response("ok"));
    const { guardedFetch } = createGuardedFetch({ transport });

    await guardedFetch("https://public.example/resource", init);

    const sent = transport.mock.calls[0]?.[1];
    expect(sent).toMatchObject({
      body: "payload",
      cache: "no-cache",
      credentials: "include",
      method: "PUT",
      redirect: "manual",
      referrerPolicy: "no-referrer",
    });
    expect(new Headers(sent?.headers)).toEqual(headers);
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
    expect(init).toEqual({
      body: "payload",
      cache: "no-cache",
      credentials: "include",
      headers,
      method: "PUT",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    });
  });

  it.each([
    { method: "POST", status: 301 },
    { method: "POST", status: 302 },
    { method: "PATCH", status: 303 },
  ])("changes $method to GET after a $status redirect and drops entity headers", async ({ method, status }) => {
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValueOnce(redirectResponse("/next", status))
      .mockResolvedValueOnce(new Response("ok"));
    const { guardedFetch } = createGuardedFetch({ transport });

    await guardedFetch("https://public.example/start", {
      body: "payload",
      headers: {
        "content-encoding": "gzip",
        "content-language": "en",
        "content-length": "7",
        "content-location": "/start",
        "content-type": "text/plain",
        "transfer-encoding": "chunked",
        "x-keep": "yes",
      },
      method,
    });

    const redirectedInit = transport.mock.calls[1]?.[1];
    const redirectedHeaders = new Headers(redirectedInit?.headers);
    expect(redirectedInit?.method).toBe("GET");
    expect(redirectedInit?.body).toBeUndefined();
    expect(redirectedHeaders.get("content-encoding")).toBeNull();
    expect(redirectedHeaders.get("content-language")).toBeNull();
    expect(redirectedHeaders.get("content-length")).toBeNull();
    expect(redirectedHeaders.get("content-location")).toBeNull();
    expect(redirectedHeaders.get("content-type")).toBeNull();
    expect(redirectedHeaders.get("transfer-encoding")).toBeNull();
    expect(redirectedHeaders.get("x-keep")).toBe("yes");
  });

  it("preserves a non-POST method and body across a 302 redirect", async () => {
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValueOnce(redirectResponse("/next", 302))
      .mockResolvedValueOnce(new Response("ok"));
    const { guardedFetch } = createGuardedFetch({ transport });

    await guardedFetch("https://public.example/start", { body: "payload", method: "PUT" });

    expect(transport.mock.calls[1]?.[1]).toMatchObject({ body: "payload", method: "PUT" });
  });

  it("removes credentials headers only when a redirect crosses origins", async () => {
    const transport = vi
      .fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>()
      .mockResolvedValueOnce(redirectResponse("/same-origin", 307))
      .mockResolvedValueOnce(redirectResponse("https://other.example/final", 307))
      .mockResolvedValueOnce(new Response("ok"));
    const { guardedFetch } = createGuardedFetch({ transport });
    const credentialHeaders = {
      authorization: "Bearer token",
      cookie: "session=secret",
      cookie2: "legacy=secret",
      "proxy-authorization": "Basic secret",
      "x-keep": "yes",
    };

    await guardedFetch("https://public.example/start", { headers: credentialHeaders });

    const sameOriginHeaders = new Headers(transport.mock.calls[1]?.[1].headers);
    expect(Object.fromEntries(sameOriginHeaders)).toMatchObject(credentialHeaders);

    const crossOriginHeaders = new Headers(transport.mock.calls[2]?.[1].headers);
    expect(crossOriginHeaders.get("authorization")).toBeNull();
    expect(crossOriginHeaders.get("proxy-authorization")).toBeNull();
    expect(crossOriginHeaders.get("cookie")).toBeNull();
    expect(crossOriginHeaders.get("cookie2")).toBeNull();
    expect(crossOriginHeaders.get("x-keep")).toBe("yes");
  });

  it("redacts URL query values from address policy errors", async () => {
    const resolve = vi
      .fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>()
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const { guardedFetch } = createGuardedFetch({ resolve });

    const error = await guardedFetch("https://private.example/path?token=secret").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Blocked non-public outbound target");
    expect((error as Error).message).not.toContain("token");
    expect((error as Error).message).not.toContain("secret");
  });
});

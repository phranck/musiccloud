/**
 * @file Tests for the preview reader.
 *
 * Ported from lmaa.space `apps/backend/src/__tests__/og.test.ts`. Adapted: the
 * requests run through the real `fetchWithTimeout`, whose hops `vitest.setup.ts`
 * routes to the global `fetch` stubbed here and whose DNS answers it fixes, so
 * the guard that refuses private targets is the production one. The tests of
 * `inspectImageUrl` stay in lmaa with the code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { log } from "./infra/logger.js";
import {
  detectPlatformFromHost,
  documentBase,
  fetchExternalResource,
  fetchPreviewImage,
  isLogoUrl,
  isMastheadImage,
  parseImageDimensions,
  secureImageUrl,
  withoutSizeConstraints,
} from "./preview-image.js";

/** The timeout the tests pass where a caller of `fetchExternalResource` would pass its own. */
const TEST_TIMEOUT_MS = 5000;

/**
 * Builds the leading bytes of a PNG with the given size.
 *
 * @param width - The width written into `IHDR`.
 * @param height - The height written into `IHDR`.
 * @returns The signature and the `IHDR` chunk up to the height.
 */
function buildPng(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(8, 13);
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buf;
}

/**
 * Builds the leading bytes of a JPEG with the given size.
 *
 * @param width - The width written into the `SOF0` segment.
 * @param height - The height written into the `SOF0` segment.
 * @returns `SOI` and a `SOF0` segment.
 */
function buildJpeg(width: number, height: number): Uint8Array {
  // SOI + SOF0 segment (length 17, precision 8, height, width, 3 components, 9 bytes of component data)
  const buf = new Uint8Array(22);
  buf.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  buf[7] = (height >> 8) & 0xff;
  buf[8] = height & 0xff;
  buf[9] = (width >> 8) & 0xff;
  buf[10] = width & 0xff;
  buf[11] = 3;
  return buf;
}

/**
 * Builds the leading bytes of a GIF with the given size.
 *
 * @param width - The logical screen width.
 * @param height - The logical screen height.
 * @returns The `GIF89a` header and logical screen size.
 */
function buildGif(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(10);
  buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  buf[6] = width & 0xff;
  buf[7] = (width >> 8) & 0xff;
  buf[8] = height & 0xff;
  buf[9] = (height >> 8) & 0xff;
  return buf;
}

/**
 * Builds the leading bytes of an extended WebP with the given canvas size.
 *
 * @param width - The canvas width.
 * @param height - The canvas height.
 * @returns The `RIFF`/`WEBP` header and a `VP8X` chunk.
 */
function buildWebPVP8X(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30);
  buf.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], 0);
  buf.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const storedWidth = width - 1;
  const storedHeight = height - 1;
  buf[24] = storedWidth & 0xff;
  buf[25] = (storedWidth >> 8) & 0xff;
  buf[26] = (storedWidth >> 16) & 0xff;
  buf[27] = storedHeight & 0xff;
  buf[28] = (storedHeight >> 8) & 0xff;
  buf[29] = (storedHeight >> 16) & 0xff;
  return buf;
}

/**
 * Builds an image response.
 *
 * @param bytes - The image's bytes.
 * @param contentType - The declared type.
 * @param status - The status, `200` unless a test needs a range answer.
 * @returns The response.
 */
function imageResponse(bytes: Uint8Array, contentType: string, status = 200): Response {
  return new Response(bytes.buffer as ArrayBuffer, { status, headers: { "content-type": contentType } });
}

/**
 * Builds an HTML response.
 *
 * @param html - The document.
 * @returns The response.
 */
function htmlResponse(html: string): Response {
  return new Response(html, { headers: { "content-type": "text/html" } });
}

/**
 * Stubs the network with a handler that answers by address.
 *
 * Each hop reaches the stub with the address `fetchWithTimeout` sends, which
 * drops the slash of a bare origin, so the handler sees the normalized form.
 * The response reports the address it answered for, as undici's does.
 *
 * @param handler - Answers one requested address.
 * @returns The stub, for assertions on its calls.
 */
function stubNetwork(handler: (url: string, init: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input)).href;
    const response = handler(url, init);
    Object.defineProperty(response, "url", { value: url });
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("parseImageDimensions", () => {
  it("reads PNG IHDR dimensions", () => {
    expect(parseImageDimensions(buildPng(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(parseImageDimensions(buildPng(64, 64))).toEqual({ width: 64, height: 64 });
  });

  it("reads JPEG SOF0 dimensions", () => {
    expect(parseImageDimensions(buildJpeg(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it("reads GIF logical screen descriptor", () => {
    expect(parseImageDimensions(buildGif(180, 90))).toEqual({ width: 180, height: 90 });
  });

  it("reads WebP VP8X canvas dimensions", () => {
    expect(parseImageDimensions(buildWebPVP8X(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it("returns null for unknown formats", () => {
    expect(parseImageDimensions(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
  });

  it("returns null for truncated PNG signatures", () => {
    expect(parseImageDimensions(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe("isLogoUrl", () => {
  it("recognises the logo keyword in filenames", () => {
    expect(isLogoUrl("https://example.com/Contigo-Logo.png?v=1")).toBe(true);
    expect(isLogoUrl("https://example.com/static/brand-mark.svg")).toBe(true);
    expect(isLogoUrl("https://example.com/img/wordmark.png")).toBe(true);
    expect(isLogoUrl("https://example.com/icons/signet.png")).toBe(true);
  });

  it("recognises explicit logo names inside theme paths", () => {
    expect(isLogoUrl("https://example.com/theme/abc/assets/res/header-logo.png")).toBe(true);
    expect(isLogoUrl("https://example.com/templates/main/logo.png")).toBe(true);
    expect(isLogoUrl("https://example.com/skins/default/brand-mark.png")).toBe(true);
  });

  it("does not call generic theme, asset, or static images logos", () => {
    expect(isLogoUrl("https://example.com/theme/abc/assets/res/header.png")).toBe(false);
    expect(isLogoUrl("https://example.com/skins/default/ssl-widget.svg")).toBe(false);
    expect(isLogoUrl("https://example.com/assets/trustpilot_banner.png")).toBe(false);
    expect(isLogoUrl("https://example.com/static/summer-sale.jpg")).toBe(false);
  });

  it("rejects hero / content URLs", () => {
    expect(isLogoUrl("https://example.com/media/hero-banner.jpg")).toBe(false);
    expect(isLogoUrl("https://example.com/uploads/product-1234.jpg")).toBe(false);
    expect(isLogoUrl("https://example.com/cdn/photo.jpg")).toBe(false);
    expect(isLogoUrl("https://example.com/wp-content/photo.jpg")).toBe(false);
  });

  it("does not mistake substrings for logo keywords", () => {
    expect(isLogoUrl("https://example.com/media/blogposts/cover.jpg")).toBe(false);
    expect(isLogoUrl("https://example.com/media/biological-soap.jpg")).toBe(false);
  });

  it("falls back to substring matching when the URL is malformed", () => {
    expect(isLogoUrl("not-a-url-with-logo.png")).toBe(true);
    expect(isLogoUrl("/theme/foo/bar.png")).toBe(false);
    expect(isLogoUrl("just-a-string")).toBe(false);
  });

  it.each([
    "https://x.de/icomp_logo-2x.png",
    "https://x.de/NUI_Logo_Gruen_RGB.png",
    "https://x.de/logo-desktop.png",
    "https://x.de/bestware_Nav_Logo_800px_DE.png",
    // Run together in camel case, which a separator-based rule misses although
    // the word is plainly there. kiddicraft-bricks.de names its logo this way.
    "https://x.de/KiddicraftLogo1000head-1920w.png",
    "https://x.de/ShopBrandMark.svg",
  ])("reads %s as a logo", (url) => {
    expect(isLogoUrl(url)).toBe(true);
  });

  it.each([
    // "logo" sits inside these, and neither is a mark.
    "https://x.de/icons/logout-arrow.svg",
    "https://x.de/img/logout.png",
    "https://x.de/catalogue-cover.jpg",
    "https://x.de/produkt-1234.jpg",
  ])("does not read %s as a logo", (url) => {
    expect(isLogoUrl(url)).toBe(false);
  });
});

describe("fetchPreviewImage site marks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefers a conventional icon over a product sharing image", async () => {
    stubNetwork((url) => {
      if (url === "https://shop.example/") return htmlResponse('<meta property="og:image" content="/product.jpg">');
      if (url === "https://shop.example/product.jpg") return imageResponse(buildJpeg(1200, 630), "image/jpeg");
      if (url === "https://shop.example/apple-touch-icon.png") return imageResponse(buildPng(180, 180), "image/png");
      return new Response("missing", { status: 404 });
    });

    await expect(fetchPreviewImage("https://shop.example/", { intent: "site-mark" })).resolves.toEqual({
      url: "https://shop.example/apple-touch-icon.png",
      via: "well-known",
    });
  });

  it("uses an explicit SVG logo instead of a product image", async () => {
    stubNetwork((url) => {
      if (url === "https://shop.example/") {
        return htmlResponse('<meta property="og:image" content="/product.jpg"><img src="/brand-logo.svg">');
      }
      if (url === "https://shop.example/product.jpg") return imageResponse(buildJpeg(1200, 630), "image/jpeg");
      if (url === "https://shop.example/brand-logo.svg") {
        return new Response('<svg viewBox="0 0 480 120"></svg>', { headers: { "content-type": "image/svg+xml" } });
      }
      return new Response("missing", { status: 404 });
    });

    await expect(fetchPreviewImage("https://shop.example/", { intent: "site-mark" })).resolves.toEqual({
      url: "https://shop.example/brand-logo.svg",
      via: "header-logo",
    });
  });

  it("stores an icon declared over http at its protected address", async () => {
    stubNetwork((url) => {
      if (url === "https://shop.example/") return htmlResponse('<link rel="icon" href="http://shop.example/logo.png">');
      if (url === "https://shop.example/logo.png") return imageResponse(buildPng(200, 200), "image/png");
      return new Response("missing", { status: 404 });
    });

    await expect(fetchPreviewImage("https://shop.example/", { intent: "site-mark" })).resolves.toEqual({
      url: "https://shop.example/logo.png",
      via: "icon",
    });
  });

  it("returns nothing rather than using an unmarked product image", async () => {
    stubNetwork((url) => {
      if (url === "https://shop.example/") {
        return htmlResponse('<meta property="og:image" content="/product.jpg"><img src="/summer-shirt.jpg">');
      }
      if (url.endsWith(".jpg")) return imageResponse(buildJpeg(1200, 630), "image/jpeg");
      return new Response("missing", { status: 404 });
    });

    await expect(fetchPreviewImage("https://shop.example/", { intent: "site-mark" })).resolves.toBeNull();
  });
});

describe("fetchPreviewImage portraits", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("takes the sharing image of a profile over the service's touch icon", async () => {
    const fetchMock = stubNetwork((url) => {
      if (url === "https://social.example/@somebody") {
        return htmlResponse(
          '<meta property="og:image" content="/avatars/somebody.png"><link rel="apple-touch-icon" href="/touch.png">',
        );
      }
      if (url === "https://social.example/avatars/somebody.png") return imageResponse(buildPng(400, 400), "image/png");
      if (url === "https://social.example/touch.png") return imageResponse(buildPng(512, 512), "image/png");
      return new Response("missing", { status: 404 });
    });

    await expect(fetchPreviewImage("https://social.example/@somebody", { intent: "portrait" })).resolves.toEqual({
      url: "https://social.example/avatars/somebody.png",
      via: "og:image",
    });
    // A profile's homepage and the well-known icons belong to the service.
    const requested = fetchMock.mock.calls.map(([input]) => new URL(String(input)).href);
    expect(requested).not.toContain("https://social.example/");
    expect(requested).not.toContain("https://social.example/apple-touch-icon.png");
  });

  it("asks again for the whole image where a server refuses a range", async () => {
    const fetchMock = stubNetwork((url, init) => {
      if (url === "https://social.example/@somebody") {
        return htmlResponse('<meta property="og:image" content="/avatars/somebody.png">');
      }
      if (url === "https://social.example/avatars/somebody.png") {
        const ranged = new Headers(init.headers).has("range");
        return ranged ? new Response(null, { status: 416 }) : imageResponse(buildPng(400, 400), "image/png");
      }
      return new Response("missing", { status: 404 });
    });

    await expect(fetchPreviewImage("https://social.example/@somebody", { intent: "portrait" })).resolves.toEqual({
      url: "https://social.example/avatars/somebody.png",
      via: "og:image",
    });
    const imageRequests = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/somebody.png"));
    expect(imageRequests).toHaveLength(2);
  });
});

describe("fetchExternalResource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the final URL for a direct external response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExternalResource(
      "https://example.com",
      { headers: { Accept: "text/html" } },
      TEST_TIMEOUT_MS,
    );

    expect(result?.finalUrl).toBe("https://example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com", expect.objectContaining({ redirect: "manual" }));
  });

  it("turns an asynchronous network rejection into no result", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(
      fetchExternalResource("https://example.com/image.png", { headers: { Accept: "image/*" } }, TEST_TIMEOUT_MS),
    ).resolves.toBeNull();
  });

  it("follows redirects to another external URL", async () => {
    const fetchMock = stubNetwork((url) =>
      url === "https://example.com/start"
        ? new Response(null, { status: 302, headers: { location: "https://cdn.example.com/image.png" } })
        : new Response("img", { status: 200, headers: { "content-type": "image/png" } }),
    );

    const result = await fetchExternalResource(
      "https://example.com/start",
      { headers: { Accept: "image/*" } },
      TEST_TIMEOUT_MS,
    );

    expect(result?.finalUrl).toBe("https://cdn.example.com/image.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    "http://127.0.0.1/internal",
    // `vitest.setup.ts` resolves this name to the loopback address.
    "http://localhost/internal",
  ])("blocks a redirect to the private target %s", async (location) => {
    const deviation = vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExternalResource(
      "https://example.com/start",
      { headers: { Accept: "text/html" } },
      TEST_TIMEOUT_MS,
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(deviation).toHaveBeenCalledWith(
      expect.objectContaining({ component: "PreviewImage", host: "example.com" }),
      expect.objectContaining({ message: "Blocked non-public outbound target" }),
    );
  });

  it("never requests a private target it was handed directly", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternalResource("http://10.0.0.1/", {}, TEST_TIMEOUT_MS)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("detectPlatformFromHost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The status a host answers with when it speaks no NodeInfo. */
  const NOT_FOUND_STATUS = 404;

  /**
   * Answers the two NodeInfo requests a host is asked: the well-known document
   * that says where the real one lives, and the real one.
   *
   * @param software - What the host reports running, or `null` for a host that
   *   answers nothing.
   */
  function stubNodeinfo(software: string | null) {
    stubNetwork((url) => {
      if (software === null) return new Response("nope", { status: NOT_FOUND_STATUS });
      if (url.endsWith("/.well-known/nodeinfo")) {
        return Response.json({
          links: [
            { rel: "http://nodeinfo.diaspora.software/ns/schema/2.0", href: "https://host.example/n/2.0" },
            { rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: "https://host.example/n/2.1" },
          ],
        });
      }
      return Response.json({ software: { name: software, version: "0.12.7" } });
    });
  }

  it("names the service a host reports running", async () => {
    stubNodeinfo("pixelfed");
    expect(await detectPlatformFromHost("https://pixey.org/somebody")).toBe("pixelfed");
  });

  it("does not care what the operator called the place", async () => {
    // Measured across twelve instances: their names ran from "Pixey" to
    // "FediSnap", whilst every one of them reported `pixelfed` here.
    stubNodeinfo("Pixelfed");
    expect(await detectPlatformFromHost("https://fedisnap.com/somebody")).toBe("pixelfed");
  });

  it("answers for anything else that speaks NodeInfo", async () => {
    stubNodeinfo("mastodon");
    expect(await detectPlatformFromHost("https://oldbytes.space/@somebody")).toBe("mastodon");
  });

  it("names Friendica, which its own addresses cannot say either", async () => {
    // Measured on friend.enby-box.de on 2026-08-24: `software.name` is
    // `friendica`, whilst `/profile/jaddy` looks like a page on any site.
    stubNodeinfo("friendica");
    expect(await detectPlatformFromHost("https://friend.enby-box.de/profile/jaddy")).toBe("friendica");
  });

  it("leaves a host running something unmapped alone", async () => {
    stubNodeinfo("lemmy");
    expect(await detectPlatformFromHost("https://example.org/c/somewhere")).toBeNull();
  });

  it("leaves an ordinary website alone", async () => {
    stubNodeinfo(null);
    expect(await detectPlatformFromHost("https://example.org/somebody")).toBeNull();
  });

  it("refuses what is not an address", async () => {
    stubNodeinfo("pixelfed");
    expect(await detectPlatformFromHost("not an address")).toBeNull();
  });

  it("never asks a host on a private address", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await detectPlatformFromHost("http://10.0.0.1/somebody")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("secureImageUrl", () => {
  it("raises an unprotected address to the protected one", () => {
    expect(secureImageUrl("http://www.arktis.de/cdn/shop/files/logo.png")).toBe(
      "https://www.arktis.de/cdn/shop/files/logo.png",
    );
  });

  it("keeps the port, the path and the query", () => {
    expect(secureImageUrl("http://example.com:8080/a/b.png?v=1")).toBe("https://example.com:8080/a/b.png?v=1");
  });

  it("leaves anything that is not http alone", () => {
    expect(secureImageUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(secureImageUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(secureImageUrl("not a url")).toBe("not a url");
  });
});

describe("withoutSizeConstraints", () => {
  it("drops the sizing a CDN was asked for, keeping the rest", () => {
    // The shape bestware.com declares: a 200px file requested at 32px, which
    // is what made the probe reject its own logo.
    expect(
      withoutSizeConstraints(
        "https://bestware.com/cdn/shop/files/logo.png?crop=center&height=32&v=1741270148&width=32",
      ),
    ).toBe("https://bestware.com/cdn/shop/files/logo.png?v=1741270148");
  });

  it("keeps a version parameter, since dropping it can change what is served", () => {
    expect(withoutSizeConstraints("https://example.com/a.png?width=64&v=9")).toBe("https://example.com/a.png?v=9");
  });

  it("leaves the question mark off where nothing else remains", () => {
    expect(withoutSizeConstraints("https://example.com/a.png?width=64&height=64")).toBe("https://example.com/a.png");
  });

  it("returns null where there is nothing to strip", () => {
    // A caller enqueues a second candidate only when this says something
    // changed, so an unchanged URL must not come back as a duplicate.
    expect(withoutSizeConstraints("https://example.com/a.png?v=9")).toBeNull();
    expect(withoutSizeConstraints("https://example.com/a.png")).toBeNull();
  });

  it("matches the key regardless of case and ignores unrelated ones", () => {
    expect(withoutSizeConstraints("https://example.com/a.png?WIDTH=64&alt=text")).toBe(
      "https://example.com/a.png?alt=text",
    );
  });

  it("leaves a URL it cannot parse alone", () => {
    expect(withoutSizeConstraints("not a url at all")).toBeNull();
  });
});

describe("documentBase", () => {
  it("follows a base tag, which is what the browser resolves against", () => {
    // icomp.de: a Contao storefront serving /index.php/en/news.html while its
    // assets hang off the root. Resolving against the document URL turned every
    // relative path into a 404.
    expect(
      documentBase(
        '<head><base href="https://shop.icomp.de/"><title>x</title></head>',
        "https://shop.icomp.de/index.php/en/news.html",
      ),
    ).toBe("https://shop.icomp.de/");
  });

  it("resolves a relative base against the document", () => {
    expect(documentBase('<base href="/shop/">', "https://example.com/a/b.html")).toBe("https://example.com/shop/");
  });

  it("keeps the document URL where there is no base tag", () => {
    expect(documentBase("<head><title>x</title></head>", "https://example.com/a/b.html")).toBe(
      "https://example.com/a/b.html",
    );
  });

  it("ignores a base tag without a usable href", () => {
    expect(documentBase('<base target="_blank">', "https://example.com/a")).toBe("https://example.com/a");
    expect(documentBase('<base href="">', "https://example.com/a")).toBe("https://example.com/a");
  });

  it("takes the first base tag, as a browser does", () => {
    expect(documentBase('<base href="https://a.example/"><base href="https://b.example/">', "https://c.example/")).toBe(
      "https://a.example/",
    );
  });

  it("resolves an odd href the way a browser would, rather than refusing it", () => {
    // Almost nothing fails to parse against a valid document URL, and a browser
    // treats what is left as a relative path. Matching that is the point: this
    // has to agree with what the page itself resolves to.
    expect(documentBase('<base href="::odd">', "https://example.com/a")).toBe("https://example.com/::odd");
  });
});

describe("isMastheadImage", () => {
  it("counts pictures, not bytes, where no header element says otherwise", () => {
    // bestware.com carries 81 KB of markup before its wordmark, which any byte
    // threshold rejects, while the wordmark is still the very first picture on
    // the page.
    const html = `<html>${"x".repeat(90000)}<img src=logo.png>`;
    expect(isMastheadImage(html, 0, 90006)).toBe(true);
  });

  it("stops after the third picture", () => {
    const html = "<html><img><img><img><img>";
    expect(isMastheadImage(html, 2, 20)).toBe(true);
    expect(isMastheadImage(html, 3, 25)).toBe(false);
  });

  it("obeys a header element where the page has one", () => {
    const html = `<header><img src=a></header>${"y".repeat(100)}<img src=b>`;
    const headerEnd = html.indexOf("</header>");
    expect(isMastheadImage(html, 0, headerEnd - 5)).toBe(true);
    // Past the masthead, position decides and the count no longer helps.
    expect(isMastheadImage(html, 1, headerEnd + 50)).toBe(false);
  });
});

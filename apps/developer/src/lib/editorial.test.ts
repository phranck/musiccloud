import { ContentContext, NavigationArea, NavigationSystemKey, NavigationTargetKind } from "@musiccloud/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  backendUrl: (path: string) => `http://backend:4000${path}`,
  internalHeaders: () => ({ "X-API-Key": "test-key" }),
}));

let editorial: typeof import("./editorial");

describe("Developer Portal editorial client", () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    editorial = await import("./editorial");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a typed success for a complete managed Page", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "page-privacy",
          path: "/privacy",
          title: "Privacy",
          showTitle: true,
          titleAlignment: "left",
          pageType: "default",
          displayMode: "embossed",
          overlayWidth: "regular",
          contentCardStyle: "default",
          templateKey: "developer-default",
          contentHtml: "<p>Private</p>",
        }),
      ),
    );

    await expect(editorial.fetchEditorialPage("/privacy")).resolves.toEqual({
      status: "success",
      data: expect.objectContaining({ id: "page-privacy", path: "/privacy", contentHtml: "<p>Private</p>" }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:4000/api/internal/developer/editorial/page?path=%2Fprivacy",
      expect.objectContaining({ headers: { "X-API-Key": "test-key" } }),
    );
  });

  it("distinguishes NotFound from a backend Failure", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "MC-RES-0003", message: "Not found", errorId: "err-not-found" }), {
          status: 404,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "MC-DB-0003", message: "Temporarily unavailable", errorId: "err-db" }), {
          status: 503,
        }),
      );

    await expect(editorial.fetchEditorialPage("/missing")).resolves.toEqual({ status: "not-found" });
    await expect(editorial.fetchEditorialPage("/privacy")).resolves.toEqual({
      status: "failure",
      error: {
        code: "MC-DB-0003",
        errorId: "err-db",
        message: "Temporarily unavailable",
        status: 503,
      },
    });
  });

  it("retains the last-good navigation after a later failure and logs only correlation fields", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const managedItem = {
      id: "managed-privacy",
      label: "Privacy policy",
      href: "/privacy",
      target: "_self",
      targetKind: NavigationTargetKind.Page,
      systemKey: null,
      behavior: "navigate",
    } as const;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ area: NavigationArea.Main, items: [managedItem] })))
      .mockRejectedValueOnce(new Error("Bearer top-secret"));

    await expect(editorial.getDeveloperPortalNavigation(NavigationArea.Main)).resolves.toEqual([managedItem]);
    await expect(editorial.getDeveloperPortalNavigation(NavigationArea.Main)).resolves.toEqual([managedItem]);

    expect(warning).toHaveBeenCalledOnce();
    const log = warning.mock.calls[0]?.[0] as string;
    expect(log).toContain('"operation":"developer_portal_navigation_read"');
    expect(log).toContain('"outcome":"last_good_fallback"');
    expect(log).toContain('"errorId":');
    expect(log).not.toContain("top-secret");
    expect(log).not.toContain("backend:4000");
  });

  it("uses the static safe seed when the first navigation read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new Error("offline"));

    const main = await editorial.getDeveloperPortalNavigation(NavigationArea.Main);
    const footer = await editorial.getDeveloperPortalNavigation(NavigationArea.Footer);

    expect(main.map((item) => item.label)).toEqual(["Docs", "API reference", "Pricing", "Search"]);
    expect(main.find((item) => item.systemKey === NavigationSystemKey.Search)).toMatchObject({
      href: "/docs/api?search=1",
      behavior: "open-api-search",
    });
    expect(footer.map((item) => item.label)).toEqual(["Terms", "Privacy", "Status"]);
  });

  it("rejects malformed navigation payloads as typed failures", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ area: ContentContext.DeveloperPortal, items: [{ label: "Missing fields" }] })),
    );

    const result = await editorial.fetchDeveloperPortalNavigation(NavigationArea.Main);

    expect(result).toMatchObject({
      status: "failure",
      error: { code: "MC-SYS-0001", status: 502, errorId: expect.any(String) },
    });
  });

  it.each([
    { name: "a mutable system route", href: "/managed-search", behavior: "open-api-search" },
    { name: "a mutable system behavior", href: "/docs/api?search=1", behavior: "navigate" },
  ])("rejects $name instead of replacing last-good navigation", async ({ href, behavior }) => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          area: NavigationArea.Main,
          items: [
            {
              id: "search",
              label: "Search",
              href,
              target: "_self",
              targetKind: NavigationTargetKind.System,
              systemKey: NavigationSystemKey.Search,
              behavior,
            },
          ],
        }),
      ),
    );

    await expect(editorial.fetchDeveloperPortalNavigation(NavigationArea.Main)).resolves.toMatchObject({
      status: "failure",
      error: { code: "MC-SYS-0001", status: 502, errorId: expect.any(String) },
    });
  });

  it.each([
    { targetKind: NavigationTargetKind.Page, systemKey: NavigationSystemKey.Docs, behavior: "navigate" },
    { targetKind: NavigationTargetKind.Url, systemKey: null, behavior: "open-api-search" },
  ])("rejects managed entries that impersonate protected system semantics", async (entry) => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          area: NavigationArea.Footer,
          items: [
            {
              id: "managed",
              label: "Managed",
              href: "/managed",
              target: "_self",
              ...entry,
            },
          ],
        }),
      ),
    );

    await expect(editorial.fetchDeveloperPortalNavigation(NavigationArea.Footer)).resolves.toMatchObject({
      status: "failure",
      error: { code: "MC-SYS-0001", status: 502, errorId: expect.any(String) },
    });
  });
});

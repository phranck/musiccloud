import { ContentContext, NavigationArea } from "@musiccloud/shared";
import type { Pool, PoolClient, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  listAdminNavItems,
  listNavigationConfiguration,
  replaceNavigationConfiguration,
} from "./postgres-content-nav.js";

function result(rows: unknown[] = []): QueryResult {
  return { command: "", rowCount: rows.length, oid: 0, fields: [], rows } as QueryResult;
}

function navigationRow() {
  return {
    id: 41,
    target_kind: "system",
    page_id: null,
    page_slug: null,
    page_title: null,
    url: null,
    system_key: "docs",
    target: "_self",
    label: "Documentation",
    context_mask: ContentContext.DeveloperPortal,
    area_mask: NavigationArea.Main | NavigationArea.Footer,
    label_updated_at: new Date("2026-07-18T08:00:00.000Z"),
  };
}

describe("contextual navigation Postgres repository", () => {
  it("reads entries, placements, and translations as one configuration", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result([navigationRow()]))
      .mockResolvedValueOnce(
        result([
          { nav_item_id: 41, context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 2 },
          { nav_item_id: 41, context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 0 },
        ]),
      )
      .mockResolvedValueOnce(
        result([
          {
            nav_item_id: 41,
            locale: "de",
            label: "Dokumentation",
          },
        ]),
      )
      .mockResolvedValueOnce(result());
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    await expect(listNavigationConfiguration(pool)).resolves.toEqual([
      {
        id: 41,
        targetKind: "system",
        pageId: null,
        pageSlug: null,
        pageTitle: null,
        url: null,
        systemKey: "docs",
        target: "_self",
        label: "Documentation",
        contextMask: ContentContext.DeveloperPortal,
        areaMask: NavigationArea.Main | NavigationArea.Footer,
        labelUpdatedAt: new Date("2026-07-18T08:00:00.000Z"),
        placements: [
          { context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 2 },
          { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 0 },
        ],
        translations: { de: "Dokumentation" },
      },
    ]);
    expect(query.mock.calls[0]?.[0]).toContain("REPEATABLE READ READ ONLY");
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("replaces the complete configuration in one transaction", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes("INSERT INTO nav_items")) {
          return result([{ id: 41, label_updated_at: new Date("2026-07-18T08:00:00.000Z") }]);
        }
        if (sql.includes("SELECT n.id, n.target_kind")) return result([navigationRow()]);
        if (sql.includes("SELECT nav_item_id, context, area, position")) {
          return result([
            { nav_item_id: 41, context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 2 },
            { nav_item_id: 41, context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 0 },
          ]);
        }
        if (sql.includes("SELECT nav_item_id, locale, label")) {
          return result([{ nav_item_id: 41, locale: "de", label: "Dokumentation" }]);
        }
        return result();
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    const replaced = await replaceNavigationConfiguration(pool, [
      {
        targetKind: "system",
        pageId: null,
        url: null,
        systemKey: "docs",
        target: "_self",
        label: "Documentation",
        contextMask: ContentContext.DeveloperPortal,
        areaMask: NavigationArea.Main | NavigationArea.Footer,
        placements: [
          { context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 2 },
          { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 0 },
        ],
        translations: { de: "Dokumentation" },
      },
    ]);

    expect(replaced).toEqual([
      expect.objectContaining({
        id: 41,
        systemKey: "docs",
        placements: [
          { context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 2 },
          { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 0 },
        ],
        translations: { de: "Dokumentation" },
      }),
    ]);
    expect(calls[0]?.sql).toBe("BEGIN");
    expect(calls.some((call) => call.sql.includes("DELETE FROM nav_items"))).toBe(true);
    expect(calls.filter((call) => call.sql.includes("INSERT INTO navigation_item_placements"))).toHaveLength(2);
    expect(calls.filter((call) => call.sql.includes("INSERT INTO nav_item_translations"))).toHaveLength(1);
    expect(calls.find((call) => call.sql.includes("INSERT INTO nav_item_translations"))?.params).toEqual([
      41,
      "de",
      "Dokumentation",
      new Date("2026-07-18T08:00:00.000Z"),
    ]);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls the replacement back when reading its response snapshot fails", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes("INSERT INTO nav_items")) {
          return result([{ id: 41, label_updated_at: new Date("2026-07-18T08:00:00.000Z") }]);
        }
        if (sql.includes("SELECT n.id, n.target_kind")) throw new Error("snapshot failed");
        return result();
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    await expect(
      replaceNavigationConfiguration(pool, [
        {
          targetKind: "url",
          pageId: null,
          url: "/about",
          systemKey: null,
          target: "_self",
          label: "About",
          contextMask: ContentContext.Frontend,
          areaMask: NavigationArea.Main,
          placements: [{ context: ContentContext.Frontend, area: NavigationArea.Main, position: 0 }],
          translations: {},
        },
      ]),
    ).rejects.toThrow("snapshot failed");

    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls the complete replacement back when a child row fails", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes("INSERT INTO nav_items")) return result([{ id: 41 }]);
        if (sql.includes("INSERT INTO navigation_item_placements")) throw new Error("placement failed");
        return result();
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    await expect(
      replaceNavigationConfiguration(pool, [
        {
          targetKind: "url",
          pageId: null,
          url: "/about",
          systemKey: null,
          target: "_self",
          label: "About",
          contextMask: ContentContext.Frontend,
          areaMask: NavigationArea.Main,
          placements: [{ context: ContentContext.Frontend, area: NavigationArea.Main, position: 0 }],
          translations: {},
        },
      ]),
    ).rejects.toThrow("placement failed");

    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("maps legacy header reads to the Frontend Main placement list", async () => {
    const query = vi.fn(async () =>
      result([
        {
          id: 7,
          nav_id: "header",
          page_slug: null,
          url: "/about",
          target: "_self",
          position: 3,
          label: "About",
          label_updated_at: new Date("2026-07-18T08:00:00.000Z"),
          page_title: null,
          page_type: null,
          display_mode: null,
          overlay_width: null,
        },
      ]),
    );
    const pool = { query } as unknown as Pool;

    const rows = await listAdminNavItems(pool, "header");

    expect(query).toHaveBeenCalledWith(expect.stringContaining("navigation_item_placements"), [
      ContentContext.Frontend,
      NavigationArea.Main,
      "header",
    ]);
    expect(rows[0]).toMatchObject({ navId: "header", position: 3, url: "/about" });
  });
});

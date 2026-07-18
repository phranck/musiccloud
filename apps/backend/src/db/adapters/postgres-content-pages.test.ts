import { ContentContext } from "@musiccloud/shared";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { getPublishedContentPageByPath } from "./postgres-content-pages.js";

describe("getPublishedContentPageByPath", () => {
  it.each([
    "/docs",
    "/docs/crawler-architecture",
    "//docs//sdks/swift/",
  ])("does not query editorial persistence for reserved Developer Portal path %s", async (path) => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await expect(getPublishedContentPageByPath(pool, ContentContext.DeveloperPortal, path)).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps /docs available to the independent Frontend context", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await expect(getPublishedContentPageByPath(pool, ContentContext.Frontend, "/docs")).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });
});

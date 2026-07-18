import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as postgresSchema from "./postgres.js";

describe("PostgreSQL schema", () => {
  it("does not export retired Dynamic Forms tables", () => {
    expect(postgresSchema).not.toHaveProperty("formConfigs");
    expect(postgresSchema).not.toHaveProperty("formSubmissions");
  });

  it("adds stable identity and context ownership to content pages", () => {
    expect(postgresSchema.contentPages.id.name).toBe("id");
    expect(postgresSchema.contentPages.id.notNull).toBe(true);
    expect(postgresSchema.contentPages.id.hasDefault).toBe(true);
    expect(postgresSchema.contentPages.contextMask.name).toBe("context_mask");
    expect(postgresSchema.contentPages.contextMask.notNull).toBe(true);
  });

  it("exports context-specific content publications", () => {
    expect(postgresSchema.contentPagePublications.pageId.name).toBe("page_id");
    expect(postgresSchema.contentPagePublications.context.name).toBe("context");
    expect(postgresSchema.contentPagePublications.path.name).toBe("path");
    expect(postgresSchema.contentPagePublications.status.name).toBe("status");
    expect(postgresSchema.contentPagePublications.templateKey.name).toBe("template_key");
  });

  it("adds contextual target semantics to navigation items", () => {
    expect(postgresSchema.navItems.targetKind.name).toBe("target_kind");
    expect(postgresSchema.navItems.pageId.name).toBe("page_id");
    expect(postgresSchema.navItems.systemKey.name).toBe("system_key");
    expect(postgresSchema.navItems.contextMask.name).toBe("context_mask");
    expect(postgresSchema.navItems.areaMask.name).toBe("area_mask");

    const config = getTableConfig(postgresSchema.navItems);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "chk_nav_items_target_kind",
        "chk_nav_items_system_key",
        "chk_nav_items_context_mask",
        "chk_nav_items_area_mask",
        "chk_nav_items_system_context",
        "chk_nav_items_system_target_shape",
      ]),
    );
  });

  it("exports concrete navigation placements with database constraints", () => {
    expect(postgresSchema.navigationItemPlacements.navItemId.name).toBe("nav_item_id");
    expect(postgresSchema.navigationItemPlacements.context.name).toBe("context");
    expect(postgresSchema.navigationItemPlacements.area.name).toBe("area");
    expect(postgresSchema.navigationItemPlacements.position.name).toBe("position");

    const config = getTableConfig(postgresSchema.navigationItemPlacements);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "chk_navigation_item_placements_context",
        "chk_navigation_item_placements_area",
        "chk_navigation_item_placements_position",
      ]),
    );
    expect(
      config.uniqueConstraints.length + config.indexes.filter((index) => index.config.unique).length,
    ).toBeGreaterThan(0);
  });
});

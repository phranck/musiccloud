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
});

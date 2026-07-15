import { describe, expect, it } from "vitest";

import * as postgresSchema from "./postgres.js";

describe("PostgreSQL schema", () => {
  it("does not export retired Dynamic Forms tables", () => {
    expect(postgresSchema).not.toHaveProperty("formConfigs");
    expect(postgresSchema).not.toHaveProperty("formSubmissions");
  });
});

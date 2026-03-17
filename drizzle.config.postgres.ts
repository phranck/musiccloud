import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./apps/backend/src/db/schemas/postgres.ts",
  out: "./apps/backend/src/db/migrations/postgres",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud",
  },
});

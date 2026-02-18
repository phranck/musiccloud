import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./apps/backend/src/db/schemas/sqlite.ts",
  out: "./apps/backend/src/db/migrations/sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "data/music.db",
  },
});

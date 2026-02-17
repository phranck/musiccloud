import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schemas/sqlite.ts",
  out: "./src/db/migrations/sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "data/music.db",
  },
});

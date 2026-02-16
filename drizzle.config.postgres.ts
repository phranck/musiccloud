import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schemas/postgres.ts",
  out: "./src/db/migrations/postgres",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://localhost/music",
  },
});

import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export default defineConfig({
  schema: "./apps/backend/src/db/schemas/postgres.ts",
  out: "./apps/backend/src/db/migrations/postgres",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});

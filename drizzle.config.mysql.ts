import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schemas/mysql.ts",
  out: "./src/db/migrations/mysql",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "mysql://root@localhost/music",
  },
});

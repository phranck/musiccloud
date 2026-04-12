import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Load .env.local so `drizzle-kit generate/migrate/studio` can read SUPABASE_DB_URL
// without the caller having to source the env file first.
const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  throw new Error(
    "SUPABASE_DB_URL is required. Add it to .env.local " +
      "(Supabase Dashboard → Database → Settings → Connection String, Session pooler).",
  );
}

export default defineConfig({
  schema: "./apps/backend/src/db/schemas/supabase.ts",
  out: "./apps/backend/src/db/migrations/supabase",
  dialect: "postgresql",
  dbCredentials: { url },
});

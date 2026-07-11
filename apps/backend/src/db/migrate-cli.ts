import { runMigrations } from "./run-migrations.js";

runMigrations({ ensureAdminOwner: false }).catch((error: unknown) => {
  console.error("[DB] Migration command failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});

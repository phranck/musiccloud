# PostgreSQL Migration Safety

## Why this exists

On 2026-07-11, production migration `0072` was executed through a connection whose PostgreSQL role was `postgres`. PostgreSQL correctly allowed the DDL because that role was a superuser and therefore made the new `album_vinyl_layouts` table its owner. The application itself runs as role `db`, so later runtime reads failed with SQLSTATE `42501` even though Drizzle recorded the migration as applied.

PostgreSQL does not know which role the application intended to own a table. A successful migration and an entry in `drizzle.__drizzle_migrations` therefore do not prove that the runtime role can use the resulting schema.

The incident repair changed only the table owner from `postgres` to `db`, then verified runtime CRUD privileges and the affected live endpoints. It was an explicitly approved administrative repair, not a migration.

## Connection policy

- Local development and tests use the local PostgreSQL URL in `apps/backend/.env.local`.
- Zerops runtime and migrations use `DATABASE_URL: ${postgres_connectionString}`.
- Zerops sets `DB_MIGRATION_ROLE: "db"`.
- Admin connections are never consumed by application code, Drizzle config, `scripts/migrate.mjs` or Zerops `initCommands`.
- A temporary admin connection for an approved repair is named `PRODUCTION_DATABASE_ADMIN_URL`, used only for that repair and never substituted for `DATABASE_URL`.

## Guarded migration flow

Both supported entrypoints delegate to `apps/backend/src/db/run-migrations.ts`:

```bash
pnpm db:migrate
node --env-file=apps/backend/.env.local scripts/migrate.mjs
```

Before Drizzle runs against a non-local host, `migration-safety.ts` checks:

1. `current_user`;
2. `pg_roles.rolsuper` for that role;
3. the exact expected `DB_MIGRATION_ROLE`.

The runner aborts before the first migration when the expected role is missing, the connected role is `postgres`, the role is a superuser, or the role differs from `DB_MIGRATION_ROLE`. Localhost remains usable with the project-local development role.

Migrations are generated and applied exclusively through Drizzle. Migration SQL, snapshots and Drizzle history are never created, edited or backfilled manually.

## Postflight and readiness

After Drizzle finishes, `database-readiness.ts` verifies:

- all tables needed by hot application paths exist;
- the runtime role has required privileges;
- the vinyl-layout cache tables have `SELECT`, `INSERT`, `UPDATE` and `DELETE`;
- the latest applied Drizzle hash matches the repository journal.

The same inspection backs `GET /health/db` through a separate pool capped at two connections. A database that accepts `SELECT 1` but has a missing table, wrong permission or stale migration is not ready.

## Operational checks

Before an approved ownership repair, record the connected database, role, superuser flag, table owner and runtime privileges. After the repair, repeat the same queries and exercise the affected endpoint with the runtime application.

Never repair ownership by editing a Drizzle migration or its history. Ownership repair is a distinct administrative operation and requires explicit authorization.

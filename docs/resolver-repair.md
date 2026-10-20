# Resolver data repairs

`apps/backend/src/scripts/repair-resolver-data.ts` applies a reviewed repair to a database. It runs the same way on a rehearsal copy and on production. Each repair issue adds a planner that turns snapshot data into a manifest, and this command is the only thing that writes it.

## The manifest

A manifest is one canonical JSON file with a SHA-256 beside it (`manifest.json` and `manifest.json.sha256`). It holds the repair name, the issue, the SHA-256 of the dump archive it was planned from, the hash of the newest Drizzle migration the target must have, and an ordered list of operations. The checksum identifies the package, so the package that was rehearsed is provably the package that runs on production. A manifest holds real catalog rows, so it stays outside the repository in a private directory.

There are three operations, and each names one table and one single-column primary key:

- `insert-row` adds a row that must not exist yet.
- `update-columns` changes named columns from the recorded values to the approved ones.
- `delete-row` removes a row that must still be exactly as recorded.

Because every operation records its expected state, the manifest also describes its own inverse. The tables a manifest may touch are listed in `REPAIRABLE_TABLES` in the command file. A planner that needs another table adds it there in the same change.

## What a run does

`verify` reads the target in a read-only transaction and reports for every operation whether it is in the recorded state (`before`), in the approved state (`after`) or in neither (`conflict`).

`apply` runs in one repeatable-read transaction. It reads and locks every row first. A conflict, or a newest migration that differs from the manifest, ends the run before any write and rolls back. Otherwise it writes the operations in the `before` state in manifest order, skips the ones already in the `after` state, reads every operation again and commits only if all of them show the approved state. A second run therefore writes nothing. After the commit the command verifies once more in a new transaction.

`rollback` applies the inverse manifest through the same steps: the operations in reverse order, each turned around.

A delete first checks that no row in another table would be changed by a cascade, a reset to null or a reset to the default. The manifest has to list those rows itself, so that what it lists is everything that happens.

The command prints counts and the manifest checksum. It never prints column values. `--report <new file>` keeps the outcome, including the keys of conflicting rows, in a private file.

## Targets

The target comes from an environment variable whose name starts with `REPAIR_`. `DATABASE_URL` is never read.

- A local URL must name a database restored from a dump, never the development database. `verify` accepts `musiccloud_snapshot_<14 digits>_<6 hex>` and `musiccloud_repair_<14 digits>_<6 hex>`. `apply` and `rollback` accept only `musiccloud_repair_...`, so an analysis snapshot is never written.
- A remote URL must reach the production database `db` as the role `db` on `postgresql`, `postgresql.zerops` or a private `10.x.x.x` address. The server has to confirm that the role is not a superuser, which is the same rule as for migrations in `docs/postgres-migration-safety.md`. The backup credential is never used here.
- On production, `apply` and `rollback` need `--confirm <manifest checksum>`.
- No connection option other than `sslmode=disable` is accepted.

## Rehearsal

1. Restore the dump the manifest was planned from into a new database named `musiccloud_repair_<UTC timestamp>_<6 hex>` in the local container. A restore sets the database read-only by default, and the command opens its write transaction as read-write.
2. `verify` the manifest. Every operation should be `before`.
3. `apply` it, then `apply` it again. The second run has to write nothing.
4. Compare the copy before and after, table by table. The difference has to be the manifest and nothing else.
5. `rollback`, and compare again. The copy has to equal the restore.

Tests that run the runner use synthetic fixtures. A copy of production data is never a test fixture and never `TEST_DATABASE_URL`.

## Production

1. Check that the VPN tunnel belongs to this project, as `.claude/commands/db-dump.md` describes.
2. Take a fresh verified backup directly before the run.
3. Read the credentials of the role `db` into memory only. Do not print them or write them to a file.
4. `verify` against production. Conflicts mean a live value changed since the plan, and a new manifest and a new rehearsal are needed.
5. `apply` with `--confirm`, keep the report, and check the result with the evidence command from `docs/resolver-data-audit.md`.

## Example

```bash
cd apps/backend
REPAIR_DATABASE_URL="$COPY_URL" pnpm exec tsx src/scripts/repair-resolver-data.ts verify \
  --manifest "$PRIVATE_DIRECTORY/manifest.json" --target-env REPAIR_DATABASE_URL
```

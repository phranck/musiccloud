# Resolver data repairs

`apps/backend/src/scripts/repair-resolver-data.ts` applies a reviewed repair to a database. It runs the same way on a rehearsal copy and on production. Each repair issue adds a planner that turns snapshot data into a manifest, and this command is the only thing that writes it.

## The manifest

A manifest is one canonical JSON file with a SHA-256 beside it (`manifest.json` and `manifest.json.sha256`). It holds the repair name, the issue, the SHA-256 of the dump archive it was planned from, the hash of the newest Drizzle migration the target must have, and an ordered list of operations. The checksum identifies the package, so the package that was rehearsed is provably the package that runs on production. A manifest holds real catalog rows, so it stays outside the repository in a private directory.

There are three operations, and each names one table and one single-column primary key:

- `insert-row` adds a row that must not exist yet.
- `update-columns` changes named columns from the recorded values to the approved ones.
- `delete-row` removes a row that must still be exactly as recorded.

Because every operation records its expected state, the manifest also describes its own inverse. The tables a manifest may touch are listed in `REPAIRABLE_TABLES` in `resolver-repair/repairable-tables.ts`. A planner that needs another table adds it there in the same change.

## Planning

`apps/backend/src/scripts/plan-resolver-repair.ts` turns a restored copy into a manifest. It only reads, and it accepts a restored copy as the only source, never production. The copy has to be the one the snapshot directory describes: `restore-verification.json` must name the database and report matching counts and migration history.

```bash
cd apps/backend
REPAIR_DATABASE_URL="$COPY_URL" pnpm exec tsx --env-file=.env.local src/scripts/plan-resolver-repair.ts recording-links \
  --snapshot-dir "$SNAPSHOT_DIRECTORY" --target-env REPAIR_DATABASE_URL \
  --out-dir "$NEW_PRIVATE_DIRECTORY" --track-id "$TRACK_ID"
```

The new directory holds `manifest.json`, `manifest.json.sha256`, `plan-evidence.json` and `plan.json`, which is written last. The evidence shows how each stored item was judged, with public provider metadata and never a credential. It must lie outside every Git checkout. A plan without operations publishes nothing.

`recording-links` checks the stored destinations of one recording against its service, one lookup per destination that a text search chose. A destination is removed only when its service reports a duration that differs from the recording's by more than the bound the matching guard uses. A destination the guard rejects for its title or version while the duration agrees stays, because it may be the right performance. A destination whose service could not be asked stays as well.

`recording-artwork` takes no option. It sets a stored cover or portrait to null where the cover policy of `services/artwork.ts` does not allow it: Apple artwork in tracks, albums and artist profiles, and YouTube images in tracks and albums. A YouTube channel portrait in an artist profile is allowed and stays. Each value becomes one update that applies only while the column still holds the recorded value, so a cover that somebody replaced since the plan makes the run stop. No replacement is looked up. Served share pages already hide these values, so clearing them changes no page, and a normal resolve fills a missing cover again.

`duplicate-identities` takes no option. It merges duplicate recordings and releases into the older record of each pair. A candidate group is two or more records that repeat an ISRC, a UPC or a source URL. Only a pair of exact twins is merged: every identity column is equal, the credits agree in name, role and position, no link names another destination for the same service unless both were found by an identifier, and the younger record has at most one short URL. Every other group stays as it is and is listed with its reason in the evidence.

For a merged pair, the short URL of the removed record becomes an alias of the kept record in `track_short_url_aliases` or `album_short_url_aliases`, so every address that was handed out still opens the page. Links, identifier observations and previews that only the removed record has move to the kept one. Everything else that belongs to the removed record goes with it. Artist entities that only the removed record's credits referenced are named in the evidence and left alone, because merging artists is a different repair. The plan needs the alias tables, so the copy it is made from has to carry the migration that creates them, and the target has to carry the same migration.

`unused-artist-entities` takes no option. It removes artist entities that nothing uses. An entity counts as used when any row of any table with a foreign key to `artist_entities` references it, apart from its own rows in `artist_entity_names`. The foreign keys are read from the catalog, so a table added later counts without a change here, and a key over several columns stops the plan. An unused entity is removed only when it is an unknown candidate with canonical names and every one of its names, compared in lower case as the name lookup does, is also held by an entity in use. The artist stays findable under each name, and the lookup no longer has two entities to choose from. Any other unused entity stays and is listed with its reason in the evidence. Each removal is its name rows followed by the entity, because the runner refuses a delete that would take rows with it unlisted.

A manifest also names the newest migration of its target. If a later migration changes the schema, the earlier manifests no longer match, and undoing one of them means sealing its inverse again after checking that the change was additive.

## What a run does

`verify` reads the target in a read-only transaction and reports for every operation whether it is in the recorded state (`before`), in the approved state (`after`) or in neither (`conflict`).

`apply` runs in one repeatable-read transaction. It reads and locks every row first. A conflict, or a newest migration that differs from the manifest, ends the run before any write and rolls back. Otherwise it writes the operations in the `before` state in manifest order, skips the ones already in the `after` state, reads every operation again and commits only if all of them show the approved state. A second run therefore writes nothing. After the commit the command verifies once more in a new transaction.

`rollback` applies the inverse manifest through the same steps: the operations in reverse order, each turned around.

A delete first checks that no row in another table would be changed by a cascade, a reset to null or a reset to the default. The manifest has to list those rows itself, so that what it lists is everything that happens.

The command prints counts, the manifest checksum and the commit it runs from. It never prints column values. `--report <new file>` keeps the outcome, including the keys of conflicting rows, in a private file. A write on production is refused from a checkout with uncommitted changes, so the commit in the report is the program that ran.

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

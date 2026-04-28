# Postgres Migration Snapshots

Each `XXXX_snapshot.json` is the schema state Drizzle Kit produced after
applying migration `XXXX`. The chain is verified at `generate` time via
each snapshot's `prevId` pointing at the previous snapshot's `id`.

## Why snapshots `0013_*.json` … `0018_*.json` were rebuilt on 2026-04-28

Earlier development inserted migrations 0013–0018 by hand without
running `drizzle-kit generate`, so no snapshots were committed for those
steps. The next `drizzle-kit generate` (when migration 0019 was being
created) compared the current Drizzle schema against the *last available*
snapshot — `0012` — and produced a "drift" SQL migration that wanted to
re-create everything 0013–0018 had already added. Recovery steps:

1. Migration 0019 was hand-trimmed down to the new statements only.
2. `0019_snapshot.json` was kept as Drizzle Kit had emitted it (full
   current schema).
3. To restore the snapshot chain, snapshots `0013`–`0018` were created as
   clones of `0019_snapshot.json`. Their `id` fields were generated fresh
   (UUID v4) and `prevId` was wired to make the chain
   `0012 → 0013 → 0014 → 0015 → 0016 → 0017 → 0018 → 0019 → 0020`. The
   `id` of `0019_snapshot.json` was then re-pointed at the new
   `0018_snapshot.json`.

### Caveat: snapshots 0013–0018 are not historically accurate

They all contain the schema that exists *after* migration 0019, not the
schema that existed at the time of their respective migrations. This is
acceptable because:

- `drizzle-kit generate` only diffs against the *latest* snapshot, so
  current and future generates work correctly (verified at the time of
  this fix: `No schema changes, nothing to migrate`).
- The migration SQL files (`0013_*.sql` … `0018_*.sql`) remain the
  authoritative record of what each step did to the database.
- We do not run `drizzle-kit generate` against a checked-out historical
  commit as a routine workflow; the only realistic consumer of those
  intermediate snapshots is a hypothetical `drizzle-kit drop` that
  rewinds — and that is not part of our process.

If a future workflow ever needs accurate per-step snapshots, regenerate
them by checking out the schema at the relevant commit and running
`drizzle-kit generate` against an empty `meta/` folder.

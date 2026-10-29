# Portable resolver data evidence

`apps/backend/src/scripts/audit-resolver-data.ts` captures resolver findings from a verified local production snapshot. It has no write, migration, provider-request or repair mode. The source snapshot stays read-only. Do not assign copied production data to `TEST_DATABASE_URL`.

## Capture

Install the locked workspace dependencies and commit the audit tool before running it. The command refuses a dirty checkout because the manifest must identify the executing code. Use the existing verified snapshot directory and local environment file. The output parent must already be private and outside the repository; the output directory must not exist.

Run from `apps/backend` in the committed tool checkout:

```bash
pnpm exec tsx src/scripts/audit-resolver-data.ts \
  --snapshot-dir "$SNAPSHOT_DIRECTORY" \
  --env-file "$LOCAL_ENV_FILE" \
  --out-dir "$NEW_PRIVATE_OUTPUT_DIRECTORY"
```

Add `--reference-track <stored-id>` for each recording whose complete identity and public references should be retained as explicit evidence. These ids are data inputs recorded with the query, not names or local database paths embedded in the rules.

The local environment file is parsed with Node's environment-file parser. Only its local PostgreSQL connection supplies credentials. The command asks `docker` for the existing `musiccloud` container. For a URL on `macserver.local` it runs `.orbstack/bin/docker` there over SSH with `BatchMode`, so key login to the server must work. For a loopback URL it uses the `docker` on the search path. A missing executable ends with `AUDIT_CONTAINER_RUNTIME_MISSING`, and a runtime that cannot report the container ends with `AUDIT_CONTAINER_IDENTITY`. It verifies the container's published port, the restored database/role, the read-only transaction and the complete source migration history. Remote hosts and connection options that can override validation are refused. It never starts a server or changes environment files.

The protected snapshot directory supplies `production.dump`, `dump-manifest.json` and `restore-verification.json`. Archive bytes must match the recorded SHA-256. The tool requires the successful restoration checks, then captures findings in one repeatable-read, read-only transaction.

## Artifact contract

The new directory contains three private files. `evidence.json` is canonical JSON. `evidence.sha256` identifies its exact bytes. `capture.json` is written last and marks complete publication; it contains local execution metadata separately from the portable evidence. No input archive is changed or copied into Git.

The evidence identifies:

- The source archive checksum and original snapshot time.
- The tool commit/tree, hashes of the executing source/shared policy files, and the dependency lockfile hash.
- Column definitions, indexes and constraints in the public/Drizzle schemas, plus their fingerprint and the complete migration history. This structural fingerprint does not claim to cover every database function or ownership privilege.
- Every finding's SQL, bound parameters, interpretation, observed rows and checksum. Record ids, source metadata, credits, links, identifier provenance and short URLs remain available where the finding needs them.

Recent misses are evaluated at the original snapshot time with the shared resolver TTL. Duplicate identifiers and multiple observed ISRCs remain candidates/context. A miss row does not explain whether an old provider request failed. Artwork uses the shared policy functions and keeps YouTube artist portraits separate from recording covers. Provider metadata controls and recording-acceptance evaluations remain separate evidence; this command neither fetches nor validates remote recordings.

Only counts and the artifact checksum are printed. Errors print a static operational code and error id, not driver messages, SQL, environment values or stored rows. Keep the artifact private because it contains real catalog records and observed URLs.

## From evidence to an approved repair

Evidence is not a repair manifest. Issues #767, #768 and #769 own the reviewed before/after operations, and `docs/resolver-repair.md` describes the runner that executes them. Each manifest pins its relevant keys, expected values, exact changes and schema prerequisite, and its inverse is the rollback.

The same immutable repair package must be rehearsed on a separately approved repair copy and then used unchanged for an explicitly approved live execution. The analysis snapshot is not that writable rehearsal copy. Unit/integration tests use synthetic fixtures.

Changed relevant live values require a new reviewed package and rehearsal. An exact after-state is an idempotent no-op; a conflicting third state aborts without overwriting live/manual changes. New or unrelated live records stay untouched. Never replace the production database with the local copy, reuse the backup credential for general writes, or reselect a different provider match during execution. Any required schema migration is generated and applied through Drizzle.

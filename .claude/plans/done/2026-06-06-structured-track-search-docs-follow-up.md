# Follow-up: Structured Track Search Documentation

Plan-Nr.: MC-017

## Context

`.claude/plans/done/2026-05-02-structured-track-search.md` is mostly implemented in code, but the user-facing resolver-flow documentation referenced by the API does not exist in the current working tree.

Current API descriptions link to:

- `docs/resolve-flow/de/resolve-flow.pdf`
- `docs/resolve-flow/en/resolve-flow.pdf`

The links are emitted from:

- `apps/backend/src/routes/resolve.ts`
- `apps/backend/src/routes/resolve-public-get.ts`

## Goal

Make the documentation surface consistent with the implemented structured-search feature and the OpenAPI links.

## Tasks

- [x] Decide whether `docs/resolve-flow/` should be restored, regenerated, or the OpenAPI links should be replaced with an existing documentation surface.
- [x] If restored: add `docs/resolve-flow/de/resolve-flow.tex`, `docs/resolve-flow/en/resolve-flow.tex`, `docs/resolve-flow/VERSION`, and generated PDFs if project policy still allows checked-in PDFs.
- [x] Cover URL, free text, genre browse/search, structured search, and selected-candidate follow-up from a user perspective.
- [x] Verify DE/EN section parity.
- [x] Verify OpenAPI descriptions point to files that exist in the repository.
- [x] Run the relevant backend documentation/OpenAPI checks.

## Verification

- [x] `find docs/resolve-flow -maxdepth 3 -type f` shows the expected docs, or OpenAPI no longer links to missing files.
- [x] `rg "docs/resolve-flow" apps/backend/src/routes docs` has no stale references.
- [x] `plans open` shows this follow-up until the documentation gap is closed.

## Completed

2026-06-06: Restored the documentation surface instead of removing the OpenAPI links.

- Removed the root `docs/` ignore rule from `.gitignore`.
- Added `docs/resolve-flow/{de,en}/resolve-flow.tex`, `docs/resolve-flow/VERSION`, a README stub, and generated DE/EN PDFs via `make docs`.
- Covered URL, free text, genre discovery, structured search, and `selectedCandidate` follow-up in both languages with matching section structure.
- Fixed OpenAPI examples for `selectedCandidate` to match the current resolver format (`<service>:<sourceId>`, e.g. `spotify:2Wfa...`).
- Added OpenAPI regression checks that the linked resolver-flow PDFs exist.

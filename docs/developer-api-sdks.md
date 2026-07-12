# Developer API SDK Release Runbook

This runbook describes how the public OpenAPI reference and downloadable SDK
archives are released. The source of truth is always the backend-exported public
contract from `GET /docs/json`.

## Contract Changes

When a public API change affects generated docs or SDKs:

1. Update the backend route schema, shared schema, examples, or OpenAPI prose.
2. Bump the public OpenAPI `info.version` in the backend Swagger config.
3. Run:

```sh
pnpm openapi:export
pnpm sdk:test
pnpm sdk:generate
```

`pnpm sdk:generate` uses the pinned `openapitools/openapi-generator-cli:v7.22.0`
image, builds the generated TypeScript, Python, and Swift projects, and writes
ignored artifacts under `.tmp/sdk`.

## Local Portal Preview

Before a GitHub Release exists for a new API version, point the Developer Portal
at a local catalog fixture:

```sh
SDK_CATALOG_FILE="$PWD/apps/developer/src/lib/__fixtures__/sdk-catalog.json" \
  pnpm --filter @musiccloud/developer build
```

For a real locally generated catalog:

```sh
pnpm openapi:export
pnpm sdk:generate
SDK_CATALOG_FILE="$PWD/.tmp/sdk/sdk-catalog.json" pnpm --filter @musiccloud/developer build
```

The portal build still validates that the catalog API version and OpenAPI
SHA-256 match the exported contract.

## Immutable Releases

The CI release tag is:

```text
api-sdk-v<openapi-info-version>
```

Existing SDK releases are immutable. If CI finds the tag already exists, it
downloads `sdk-catalog.json` and all SDK archives, then requires the same API
version, OpenAPI SHA-256, generator version, source SHA, asset list, and archive
checksums.

If the public contract changed but the tag already exists, do not overwrite the
release. Bump `info.version`, regenerate, and let CI create a new release.

## Generator Upgrades

Changing the OpenAPI Generator version changes the release surface. Update the
pinned image version in `scripts/generate-sdk-release.mjs`, regenerate all three
SDKs, run the local gates above, and publish under a new API SDK release.

Do not update only one language target.

## Out Of Scope

The first release ships ZIP downloads only. npm, PyPI, and Swift Package Manager
publishing are intentionally deferred until the generated clients and public API
shape have stabilized.

# SDK Generator Profiles

This directory is the version-controlled handoff from GitHub issue #91 to the
five-language release orchestrator in #89. It does not publish packages and it
does not replace the existing OpenAPI Generator release path.

## Frozen candidate set

- API contract version: `2.1.10`
- Canonical OpenAPI dialect: `3.1.0`
- Canonical SHA-256: `1813049b6d9390fb88413b1880c35f6dcef720f9f3fce04e99ae994242214699`
- Shared SDK candidate version: `0.1.0`
- Stability: `Preview` for TypeScript, Python, Swift, PHP, and Go
- Publication: disabled

`candidate-manifest.json` is the atomic entry point. It identifies the matrix,
profiles, surface map, canonical operation IDs, harnesses, error contracts,
adapter, defect fixture, golden usage contracts, and public API snapshots that
#89 must consume together.

## Selected generators

| Language | Selected OSS generator | Runtime used for verification |
|---|---|---|
| TypeScript | Hey API `0.99.0` | Node `22.23.1`, TypeScript `5.9.3` |
| Python | openapi-python-client `0.29.0` | CPython `3.14.6` |
| Swift | Apple Swift OpenAPI Generator `1.13.0` | Swift `6.4`, package tools `6.1` |
| PHP | Jane OpenAPI 3.1 `7.12.0` | PHP `8.4.14`, Composer `2.8.12` |
| Go | ogen `1.23.0` | Go `1.26.5`, module language version `1.25` |

The matrix records immutable package or source provenance and licenses. OpenAPI
Generator `7.22.0` remains an isolated comparison adapter for every language.
It is never selected automatically and its candidate output is never published.

Jane publishes separate packages for OpenAPI 3.0 and 3.1. Verification proved
that `jane-php/open-api-3` rejects a `3.1.0` contract, while the selected
`jane-php/open-api-3-1@7.12.0` consumes the canonical contract directly. This is
a package correction within the approved Jane generator, not a generator
replacement.

## Public surface

`public-surface.json` maps all 13 canonical `operationId` values to deliberate
language-native facade names. `snapshots/*.txt` freezes the full mapping.
`usage/` contains native compile-time contracts for the representative share
calls, including `shortId`, `short_id`, and `shortID` spelling and Swift argument
labels. These files describe the public facade that #89 generates. Raw generator
namespaces remain internal.

The checked-in error contracts under `sdk/error-contract/` remain the source of
the public `MC-*` API, protocol, and transport error behavior. Profiles require
all six canonical fields and preservation of unknown future codes.

## Deterministic compatibility layer

`scripts/prepare-sdk-generator-contract.mjs` derives disposable, generator-only
views from the canonical bytes. It does not edit generated output or change HTTP
paths, wire fields, status codes, or response meaning.

- Common: canonicalizes the case-insensitive `Range` header and expands
  required-only request variants for generators that scope union branches.
- Swift: emits the generator-supported OpenAPI 3.0 nullable representation and
  hydrates required-only `allOf` overlays from their referenced properties.
- Go: flattens untagged request unions, expands nested response unions, uses Go's
  canonical header spelling, and marks the plain-text response for ogen's raw
  decoder.
- Python: `content_type_overrides` maps the four binary media types to the
  generator's supported octet-stream byte source.
- TypeScript: the SDK plugin uses the non-deprecated `byTags` operation strategy.

The focused defect fixture is
`scripts/fixtures/sdk-generator-contract-defects.json`. The adapter test applies
each transformation twice and requires identical output.

## Reproduction

Export and validate the frozen contract first:

```sh
pnpm --filter @musiccloud/shared build
pnpm openapi:export
pnpm sdk:profiles:validate
```

The selected generator commands used for this candidate are:

```sh
# TypeScript
pnpm --package=@hey-api/openapi-ts@0.99.0 --package=typescript@5.9.3 \
  dlx openapi-ts -f sdk/generator-profiles/harnesses/typescript/openapi-ts.config.mjs
cp sdk/generator-profiles/harnesses/typescript/tsconfig.json \
  .tmp/sdk-candidates/typescript/tsconfig.json
pnpm exec tsc -p .tmp/sdk-candidates/typescript/tsconfig.json

# Python
.tmp/sdk-tools/python/bin/openapi-python-client generate \
  --path .tmp/openapi/openapi.json \
  --config <(jq '.generator.config' sdk/generator-profiles/languages/python.json) \
  --output-path .tmp/sdk-candidates/python/package --overwrite --meta setup --fail-on-warning
.tmp/sdk-tools/python/bin/python -m pip install .tmp/sdk-candidates/python/package
.tmp/sdk-tools/python/bin/python -m compileall -q .tmp/sdk-candidates/python/package/musiccloud

# Swift
node scripts/prepare-sdk-generator-contract.mjs \
  --input .tmp/openapi/openapi.json --output .tmp/sdk-candidates/contracts/swift.json --adapter swift
swift-openapi-generator generate .tmp/sdk-candidates/contracts/swift.json \
  --config sdk/generator-profiles/harnesses/swift/swift-openapi-generator-config.yaml \
  --output-directory .tmp/sdk-candidates/swift/generated
swift build --package-path .tmp/sdk-candidates/swift

# PHP, with composer:2.8.12 index digest sha256:5248900ab8b5f7f880c2d62180e40960cd87f60149ec9a1abfd62ac72a02577c
composer install --working-dir=.tmp/sdk-candidates/php --no-interaction
php .tmp/sdk-candidates/php/vendor/bin/jane-openapi generate \
  --config-file=.tmp/sdk-candidates/php/jane-openapi.php
composer validate --working-dir=.tmp/sdk-candidates/php --strict

# Go
node scripts/prepare-sdk-generator-contract.mjs \
  --input .tmp/openapi/openapi.json --output .tmp/sdk-candidates/contracts/go.json --adapter go
go run github.com/ogen-go/ogen/cmd/ogen@v1.23.0 -clean -package generated \
  -target .tmp/sdk-candidates/go/internal/generated .tmp/sdk-candidates/contracts/go.json
(cd .tmp/sdk-candidates/go && go test ./... && go vet ./...)
```

The PHP commands are run inside the pinned Composer image when PHP and Composer
are not installed locally. Harness manifests and locks are copied into each
disposable candidate root before generation. Generated candidates stay under
`.tmp/` and are not committed.

The behavioral protocol matrix, authentication checks, nullability cases, and
isolated-backend end-to-end requests remain the conformance-suite responsibility
of #92. These profiles and verified buildable candidates are its inputs, not a
claim that the Preview SDKs are already production-stable.

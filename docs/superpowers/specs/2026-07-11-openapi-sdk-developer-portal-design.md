# OpenAPI SDKs and Developer-Portal Reference — Design Spec

Status: Design approved (2026-07-11)

Scope: Replace the backend-hosted Scalar reference with a first-party, statically generated API reference in `developer.musiccloud.io`, and offer downloadable TypeScript, Python, and Swift SDK archives generated from the same public OpenAPI contract.

Related: [Developer-site design](2026-06-26-developer-site-design.md), [API access self-service design](2026-07-01-developer-api-access-self-service-design.md), [API monetization design](2026-07-04-developer-api-monetization-design.md), [MC-025 public API access plan](../../../.codex/plans/open/2026-06-05-public-api-access-key-and-analytics-plan.md)

## Goal

External developers use `developer.musiccloud.io/docs/api` as the sole human-readable API reference. The page is generated from the finalized public OpenAPI document and presents first-party documentation, endpoint details, schemas, language-specific quickstarts, and downloadable SDK releases for TypeScript, Python, and Swift.

The same immutable OpenAPI input produces the visible reference and all SDK artifacts. The portal must never advertise an endpoint, parameter, schema, authentication method, or SDK version that is not derived from the published public contract.

## Confirmed product decisions

- The existing Scalar reference served by the backend at `/docs` is fully replaced; it is not kept as a parallel public reference.
- `GET /docs/json` remains the public, machine-readable OpenAPI document and is the contract source for generation and external tooling.
- The developer portal offers SDKs as downloadable ZIP archives only in this first release. It does not publish to npm, PyPI, or Swift Package Manager.
- Initial SDK languages are TypeScript, Python, and Swift.
- The reference and SDKs are generated statically in CI rather than rendered from a live backend request in the visitor's browser.
- OpenAPI Generator is the pinned OSS generator for all three SDKs.
- Token enforcement and final API-key semantics are a dependency: before the reference and SDKs are published, the public OpenAPI security declarations, examples, and prose must accurately describe the released `mc_live_…` API-key contract. The old UUID-key and OAuth-client-credentials language must not be carried into the generated customer surface.

## Architecture

```text
Fastify route schemas
        |
        v
finalizePublicOpenApiDocument(app.swagger())
        |
        +--> GET /docs/json (public contract download)
        |
        +--> contract export script
                 |
                 +--> generated portal reference data
                 |       |
                 |       v
                 |   developer.musiccloud.io/docs/api
                 |
                 +--> pinned OpenAPI Generator
                         |
                         +--> TypeScript ZIP
                         +--> Python ZIP
                         +--> Swift ZIP
                                  |
                                  v
                           GitHub Release assets
                                  |
                                  v
                        Developer-portal download cards
```

### Contract export

The exporter starts the backend application with isolated documentation-only configuration and serializes exactly the value returned by `finalizePublicOpenApiDocument(app.swagger())`. It must not fetch the deployed production endpoint. This makes portal builds reproducible from one commit and prevents a deployment-order race between backend and developer-site services.

It writes one versioned, generated OpenAPI JSON input for the developer-site build and validates that the document is public-only: no `/api/admin/*`, `/api/dev/*`, internal helpers, or orphan schemas may enter the artifact. The generated document is build output, not a handwritten copy of the API contract.

### Portal documentation

`apps/developer/src/pages/docs/api.astro` replaces its current preview copy with a first-party reference. It consumes generated contract data and renders:

1. an integration overview with base URL and the `X-API-Key` authentication model;
2. a concise integration guide covering API keys, request conventions, errors, rate limits, and versioning;
3. an SDK download section with the three language cards and language-specific installation/extraction plus first-request examples;
4. tag-grouped endpoint pages or anchored sections with method, path, description, security requirement, parameters, request bodies, responses, examples, and links to referenced schemas;
5. a schemas section for reachable OpenAPI components; and
6. a raw OpenAPI JSON download link.

The documentation uses the existing developer-site header, footer, typography, night-mode token system, button styles, and icon system. No embedded Scalar, Swagger UI, or external documentation UI is used. Generated content is transformed into small, typed presentation models so OpenAPI parsing and Astro layout remain separate responsibilities.

### SDK artifacts

The generator input is the exported public OpenAPI JSON, byte-for-byte identical for all three targets in one release run. Generator version, generator configuration, generated OpenAPI version, source commit, SHA-256 checksum, archive filename, and release URL are recorded in a small SDK catalog consumed by the portal.

Generator targets are:

| Portal label | OpenAPI Generator target | Archive content |
|---|---|---|
| TypeScript | `typescript-fetch` | generated package, README, and generator metadata |
| Python | `python` | generated package, README, and generator metadata |
| Swift | `swift5` | generated Swift package, README, and generator metadata |

Each archive has a deterministic filename containing the public API version. SDK archives are generated only in CI and attached to a GitHub Release such as `api-sdk-v<openapi-info-version>`. Binary archives are not committed to this repository.

### CI and deployment ordering

One contract-release workflow runs when the public OpenAPI surface or its generation configuration changes. It:

1. builds the backend and exports the finalized OpenAPI document;
2. validates the document and contract version;
3. invokes the pinned OpenAPI Generator once per language;
4. builds and smoke-tests each generated SDK;
5. archives the generated SDK directory for each language;
6. calculates checksums, writes the SDK catalog, and publishes the three archives as release assets; and
7. makes the generated portal contract data and catalog available to the developer-site build.

The developer-site deployment waits for successful SDK artifact publication. CI change detection must flag the developer-site deployment when the backend files that alter the finalized public OpenAPI document change, not only when `apps/developer/**` changes. This prevents the portal from lagging behind a changed contract.

An OpenAPI version change is required when an SDK-visible contract change is released. CI rejects an attempt to overwrite an existing SDK release tag with a different exported contract fingerprint.

## Error handling and integrity

- A failed OpenAPI export, validation, generation, SDK build, archive, checksum calculation, or release upload fails the contract-release workflow. The developer-site deployment does not run with partial SDK availability.
- The portal only displays a download card when the catalog contains a verified asset URL and checksum for that language and OpenAPI version.
- The SDK catalog is treated as generated data. Handwritten language labels and presentation copy may surround it, but version numbers, URLs, and checksums are never duplicated as literals.
- The backend continues to filter internal routes before export. The exporter has a regression assertion for the same public-only boundary so a transform regression cannot silently leak an internal endpoint into portal documentation or SDKs.
- The backend `/docs` UI route is removed or changed to a permanent redirect to `https://developer.musiccloud.io/docs/api`. It no longer serves Scalar HTML, Scalar-specific CSP, or Scalar font assets. `/docs/json` remains available with a documented cache policy.

## Testing and acceptance criteria

### Automated checks

- Backend tests prove that the exported document matches the public finalized document, remains alphabetically stable, excludes internal paths and unreachable schemas, and exposes valid OpenAPI JSON.
- Portal unit tests cover conversion of representative operations, parameters, request bodies, responses, security schemes, and schemas into presentation models; malformed or unsupported contract data fails clearly during the build.
- Portal page tests verify the replacement reference contains endpoint content, raw-manifest link, all three SDK cards, version, checksum, and language quickstart content from the generated catalog.
- A generator integration test produces each target from a fixture manifest and verifies an archive is created; the release workflow additionally builds the generated TypeScript, Python, and Swift projects in their native toolchains.
- CI verifies that all three SDKs receive the exact same exported contract fingerprint and that each release asset checksum matches the catalog.
- CI verifies that an existing release tag cannot be reused for changed contract bytes.

### User-visible acceptance criteria

- `developer.musiccloud.io/docs/api` is the single human-facing API reference and has no Scalar embed or backend-hosted duplicate.
- Every endpoint and schema displayed in the portal is derived from the current public OpenAPI contract.
- Visitors can download a TypeScript, Python, or Swift SDK ZIP and see its API version, generator version, file checksum, and a working first-call example.
- Visitors can download the raw public OpenAPI JSON.
- The backend path `/docs` directs visitors to the portal reference; `/docs/json` remains machine-readable.
- An SDK-visible public API change cannot deploy its updated portal reference unless all three matching SDK assets have generated and passed their release checks.

## Explicitly out of scope

- Publishing packages to npm, PyPI, or Swift Package Manager.
- Handwritten SDK extensions, custom transport implementations, or custom generator templates in the first release.
- Hosting multiple API versions concurrently in the portal.
- Usage analytics, billing, pricing, and quota changes.
- Changing Public API authentication behavior itself. This work only consumes the final, separately released contract.

## Dependencies and risks

- The current OpenAPI description still documents earlier authentication details. The enforcement work must first update the actual contract, examples, and security declarations to the released API-key model.
- The OpenAPI Generator’s Swift target must be validated against the project’s supported Swift toolchain before it becomes a release gate. If its generated Swift Package does not build, the failure blocks publication rather than producing an unverified archive.
- A public contract revision without an OpenAPI version bump would collide with a prior SDK release tag. Contract fingerprint validation makes this an explicit CI failure.
- The developer-site deployment environment currently builds the developer app without building the backend. The final implementation must either generate contract data in the contract-release workflow and pass it as an artifact, or add the required backend export stage before the developer-site build. The chosen route must preserve same-commit reproducibility and deployment ordering.

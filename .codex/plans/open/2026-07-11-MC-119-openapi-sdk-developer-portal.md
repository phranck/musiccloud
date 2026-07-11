# OpenAPI SDKs and Developer-Portal Reference Implementation Plan

Plan-Nr.: MC-119

Status: open
Created: 2026-07-11
Design: [`docs/superpowers/specs/2026-07-11-openapi-sdk-developer-portal-design.md`](../../../docs/superpowers/specs/2026-07-11-openapi-sdk-developer-portal-design.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one first-party, static API reference at `developer.musiccloud.io/docs/api` and matching downloadable TypeScript, Python, and Swift SDK archives from the finalized public OpenAPI contract.

**Architecture:** The backend exports the same finalized OpenAPI document it serves at `/docs/json`; the Developer Portal transforms the exported JSON into typed, static reference content. A pinned OpenAPI Generator container consumes the exact exported bytes in CI, produces three verified ZIP files, and publishes a release catalog that the portal build validates before deploying. The former backend Scalar UI is replaced by a redirect to the portal while the machine-readable JSON endpoint remains public.

**Tech Stack:** Fastify 5 + `@fastify/swagger`, TypeScript, Astro 5, Vitest, Node 22, Docker image `openapitools/openapi-generator-cli:v7.22.0`, GitHub Actions, GitHub Release assets, Zerops.

## Global Constraints

- Complete the Public-API token-enforcement work before publishing this feature. The contract must describe the released `mc_live_…` `X-API-Key` authentication model, not the current UUID-key/OAuth-client-credentials copy.
- `GET /docs/json` remains the only public machine-readable contract source. Never hand-maintain a second OpenAPI file or a manually copied endpoint list.
- The exporter must serialize `finalizePublicOpenApiDocument(app.swagger())` from the current checkout and must not fetch production.
- Only the public contract may reach documentation or SDK generation. `/api/admin/*`, `/api/dev/*`, internal helpers, and schemas reachable only from hidden routes remain excluded.
- Initial SDKs are download-only ZIP archives: TypeScript (`typescript-fetch`), Python (`python`), and Swift (`swift5`). Do not publish to npm, PyPI, or Swift Package Manager.
- Pin the OpenAPI Generator image by exact version. Record API version, OpenAPI SHA-256 fingerprint, generator version, source SHA, asset URL, and archive SHA-256 in generated catalog data.
- A changed public-contract fingerprint requires a new `info.version`; CI must reject overwriting an existing `api-sdk-v<version>` release with different contract bytes.
- The portal must not deploy a newer generated reference if matching SDK assets and their catalog have not successfully published.
- Reuse Developer Portal layout, styles, tokens, header/footer, Iconsax wrapper, and existing `rounded-card`/button patterns. No embedded Scalar, Swagger UI, or external API-reference UI.
- Generated OpenAPI JSON and downloaded SDK-catalog build inputs stay untracked. Binary SDK archives are release assets and must never be committed.
- Run the relevant gates after every task. Before final completion: backend and developer typechecks/tests, `pnpm lint`, full-repository React Doctor only if React components are added, and an end-to-end CI-style generator dry run.

## Verified current state

- `apps/backend/src/server.ts:303-395` registers `@fastify/swagger`, filters non-public routes, finalizes `app.swagger()` at `GET /docs/json`, and currently serves a Scalar UI at `GET /docs`.
- `apps/backend/src/docs/openapi-finalize.ts` is the pure public-contract finalizer and `apps/backend/src/__tests__/openapi-docs.test.ts` already proves route/schema filtering and alphabetical ordering.
- `apps/developer/src/pages/docs/api.astro` is only an English preview and still contains a UUID-shaped example; it does not render the actual contract.
- `apps/developer` has no source tests today, but its Vitest dependency and `test:run` script are configured.
- `zerops.yml:115-149` builds the Developer Portal without a backend export step; `.github/workflows/ci.yml:135-145` does not flag a Developer deployment for backend-only public-contract changes.
- The existing portal build uses the Node 22 Alpine image. SDK generation therefore belongs in GitHub Actions Docker, not in Zerops.

## File structure

| File | Responsibility |
|---|---|
| `apps/backend/src/openapi/export-public-openapi.ts` | Builds the app in documentation-only mode, obtains the finalized document through `/docs/json`, validates public-only invariants, canonicalizes JSON, and returns bytes plus SHA-256. |
| `apps/backend/src/scripts/export-public-openapi.ts` | CLI wrapper that writes canonical contract JSON and a small metadata file to paths supplied by the caller. |
| `apps/backend/src/openapi/export-public-openapi.test.ts` | Tests exporter parity with `/docs/json`, deterministic output, and public-route/schema boundary. |
| `apps/backend/src/server.ts` | Correct final public auth/rate-limit prose, cache policy for `/docs/json`, and permanent redirect from `/docs` to the Developer Portal. |
| `apps/backend/src/docs/scalar-reference.ts` | Deleted after the redirect replaces the Scalar UI. |
| `apps/backend/src/__tests__/openapi-docs.test.ts` | Replaces Scalar/font assertions with redirect and public-contract/export assertions. |
| `apps/backend/package.json` / `pnpm-lock.yaml` | Removes unused Scalar dependency and adds an explicit OpenAPI export command. |
| `apps/developer/scripts/generate-api-reference.mjs` | Runs the backend exporter, downloads the version-matched release catalog, verifies fingerprint/schema, and writes ignored build inputs. |
| `apps/developer/src/lib/openapi-reference.ts` | Small typed OpenAPI presentation-model transformer, including operations, parameters, request/response media, security, and schema links. |
| `apps/developer/src/lib/openapi-reference.test.ts` | Fixture-driven transformer tests and unsupported-contract diagnostics. |
| `apps/developer/src/lib/sdk-catalog.ts` | Validates catalog structure, API-version/fingerprint match, three required language assets, and checksums. |
| `apps/developer/src/lib/sdk-catalog.test.ts` | Valid/invalid catalog tests, including missing language, bad checksum, and mismatched fingerprint. |
| `apps/developer/src/components/docs/*` | Focused Astro components for navigation, operation cards, schema rendering, code blocks, and SDK download cards. |
| `apps/developer/src/pages/docs/api.astro` | Full first-party reference page consuming generated data and the focused components. |
| `apps/developer/src/pages/docs/api.test.ts` | Render-level assertions for reference sections, raw manifest link, and three SDK download cards. |
| `apps/developer/package.json` | Makes API-reference generation a required `prebuild` prerequisite for the Astro build. |
| `.gitignore` | Ignores Developer Portal generated OpenAPI JSON and release-catalog build inputs. |
| `scripts/generate-sdk-release.mjs` | Generates all SDK targets via the pinned Docker image, builds each target, creates deterministic ZIP archives, writes checksums and `sdk-catalog.json`, and rejects version/fingerprint conflicts. |
| `scripts/generate-sdk-release.test.mjs` | Fixture-manifest integration test for three target directories, catalog data, and archive creation. |
| `.github/workflows/ci.yml` | Adds contract-SDK validation/release job, artifact handoff ordering, permissions, and public-contract-aware Developer deployment detection. |
| `zerops.yml` | Runs the Portal prebuild that exports the local contract and verifies/downloads the already-published SDK catalog before Astro builds. |
| `docs/developer-api-sdks.md` | Maintainer runbook for contract versioning, local preview with a catalog fixture, release troubleshooting, and future registry publishing. |

---

### Task 1: Make the published OpenAPI contract release-ready

**Files:**

- Modify: `apps/backend/src/server.ts:303-430`
- Modify: `apps/backend/src/__tests__/openapi-docs.test.ts:1-163`
- Test: `apps/backend/src/__tests__/openapi-docs.test.ts`

**Interfaces:**

- Consumes: the token-enforcement release from the existing Public-API access work and `finalizePublicOpenApiDocument()`.
- Produces: a contract whose `info.version`, `securitySchemes`, operation security, examples, auth prose, and rate-limit prose truthfully match released behavior; `GET /docs/json` is cacheable public JSON; `GET /docs` redirects permanently to the Developer Portal.

- [ ] **Step 1: Reconcile public auth behavior before changing its documentation**

Verify the preceding enforcement work is deployed and that every endpoint's OpenAPI `security` block agrees with actual route protection. Record the result in this plan under "Execution notes" before continuing. The required customer-facing model is:

```text
Header: X-API-Key: mc_live_<prefix>_<secret>
No browser-exposed key
401 for missing/invalid/revoked key on protected endpoints
429 for the validated client’s configured per-minute/per-day limit
```

Do not retain the current documentation strings that advertise a UUID API key, `/api/auth/token` client credentials, a one-hour bearer token, or unauthenticated public paths if the enforcement release changes them.

- [ ] **Step 2: Write failing contract assertions**

Replace the Scalar-specific opening tests with assertions such as:

```ts
it("redirects the retired backend reference to the Developer Portal", async () => {
  const res = await app.inject({ method: "GET", url: "/docs" });

  expect(res.statusCode).toBe(308);
  expect(res.headers.location).toBe("https://developer.musiccloud.io/docs/api");
});

it("serves the finalized public contract with a bounded public cache policy", async () => {
  const res = await app.inject({ method: "GET", url: "/docs/json" });
  const doc = res.json() as { info: { version: string }; paths: Record<string, unknown> };

  expect(res.statusCode).toBe(200);
  expect(res.headers["cache-control"]).toBe("public, max-age=300");
  expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(Object.keys(doc.paths)).not.toContain("/api/dev/api-access/clients");
});
```

Run: `pnpm --filter @musiccloud/backend test:run -- openapi-docs.test.ts`

Expected: FAIL because `/docs` still responds `200` with Scalar HTML and `/docs/json` does not yet set the cache header.

- [ ] **Step 3: Update the canonical OpenAPI metadata and backend routes**

In the `swagger` `openapi.info` configuration, replace auth and rate-limit prose with released facts only. Keep `ApiKeyAuth` as the documented customer credential and remove the deprecated Bearer security scheme only after no released public operation accepts it. Version the API according to the public change.

Make `/docs/json` return the finalized document with:

```ts
reply.header("Cache-Control", "public, max-age=300");
return finalizePublicOpenApiDocument(app.swagger());
```

Replace the Scalar route with:

```ts
app.get("/docs", { schema: { hide: true } }, async (_request, reply) => {
  return reply.redirect(308, "https://developer.musiccloud.io/docs/api");
});
```

Remove Scalar imports, Scalar-only CSP comments/directives, local font routes, and `apps/backend/src/docs/scalar-reference.ts`. Remove `@scalar/core` through pnpm so the lockfile is updated mechanically.

- [ ] **Step 4: Run focused regression tests and typecheck**

Run:

```sh
pnpm --filter @musiccloud/backend test:run -- openapi-docs.test.ts
pnpm --filter @musiccloud/backend typecheck
```

Expected: all OpenAPI tests pass; no import remains for `@scalar/core`, `getScalarApiReferenceHtml`, or `getScalarReferenceFontCss`.

- [ ] **Step 5: Prepare the contract-cleanup commit for user authorization**

```sh
git add apps/backend/src/server.ts apps/backend/src/__tests__/openapi-docs.test.ts \
  apps/backend/src/docs/scalar-reference.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "Docs: publish API contract through developer portal"
```

Do not run the commit without the user's explicit commit authorization.

---

### Task 2: Export a canonical public OpenAPI build artifact

**Files:**

- Create: `apps/backend/src/openapi/export-public-openapi.ts`
- Create: `apps/backend/src/scripts/export-public-openapi.ts`
- Create: `apps/backend/src/openapi/export-public-openapi.test.ts`
- Modify: `apps/backend/package.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `apps/backend/src/openapi/export-public-openapi.test.ts`

**Interfaces:**

- Consumes: `buildApp(): Promise<FastifyInstance>` from `apps/backend/src/server.ts` and the public `/docs/json` response established in Task 1.
- Produces: `exportPublicOpenApiContract(): Promise<{ json: string; document: PublicOpenApiDocument; sha256: string; version: string }>` and CLI output `<out>/openapi.json` plus `<out>/openapi.metadata.json`.

- [ ] **Step 1: Write failing exporter parity tests**

Create an exporter test that calls both the exporter and Fastify injection. Use a deterministic JSON serialiser with sorted keys and assert byte parity after parse/stringify normalization:

```ts
const exported = await exportPublicOpenApiContract();
const response = await app.inject({ method: "GET", url: "/docs/json" });

expect(exported.document).toEqual(response.json());
expect(exported.sha256).toMatch(/^[a-f0-9]{64}$/);
expect(exported.version).toBe((response.json() as { info: { version: string } }).info.version);
expect(exported.json).toBe(stableStringify(exported.document));
```

Also assert every exported path excludes `/api/admin`, `/api/dev`, `/api/v1/content`, `/api/v1/nav`, `/api/v1/site-settings`, `/api/v1/services`, `/api/v1/random`, and `/api/v1/telemetry`.

Run: `pnpm --filter @musiccloud/backend test:run -- export-public-openapi.test.ts`

Expected: FAIL because the exporter module does not exist.

- [ ] **Step 2: Implement the pure exporter and CLI**

Implement a local structural type for the OpenAPI fields consumed by the portal. Do not add a second OpenAPI parser dependency merely for export. The exporter must set the minimum test-only environment before building, inject `GET /docs/json`, reject non-200 or non-JSON results, close the Fastify app in `finally`, and calculate the SHA-256 from canonical JSON bytes:

```ts
const app = await buildApp();
try {
  const response = await app.inject({ method: "GET", url: "/docs/json" });
  if (response.statusCode !== 200) throw new Error(`OpenAPI export failed: ${response.statusCode}`);
  const document = response.json() as PublicOpenApiDocument;
  assertPublicContract(document);
  const json = stableStringify(document);
  return { document, json, sha256: createHash("sha256").update(json).digest("hex"), version: document.info.version };
} finally {
  await app.close();
}
```

The CLI accepts `--out-dir <path>`, writes `openapi.json` and metadata atomically, and prints the version/fingerprint without printing secrets. Add a root command such as:

```json
"openapi:export": "pnpm --filter @musiccloud/backend exec tsx src/scripts/export-public-openapi.ts --out-dir ../../.tmp/openapi"
```

Add ignored paths:

```gitignore
.tmp/openapi/
apps/developer/src/generated/
```

- [ ] **Step 3: Run exporter through its CLI**

Run:

```sh
pnpm openapi:export
node -e 'const fs=require("node:fs"); const d=JSON.parse(fs.readFileSync(".tmp/openapi/openapi.metadata.json")); if (!/^\d+\.\d+\.\d+$/.test(d.version) || !/^[a-f0-9]{64}$/.test(d.sha256)) process.exit(1)'
```

Expected: canonical JSON and metadata exist; no excluded route appears in `openapi.json`.

- [ ] **Step 4: Run backend checks**

Run:

```sh
pnpm --filter @musiccloud/backend test:run -- export-public-openapi.test.ts openapi-docs.test.ts
pnpm --filter @musiccloud/backend typecheck
pnpm lint
```

Expected: all pass without generated paths being staged.

- [ ] **Step 5: Prepare the exporter commit for user authorization**

```sh
git add apps/backend/src/openapi apps/backend/src/scripts/export-public-openapi.ts \
  apps/backend/package.json package.json .gitignore
git commit -m "Feat: export canonical public OpenAPI contract"
```

Do not run the commit without the user's explicit commit authorization.

---

### Task 3: Create typed portal-reference and SDK-catalog build inputs

**Files:**

- Create: `apps/developer/scripts/generate-api-reference.mjs`
- Create: `apps/developer/src/lib/openapi-reference.ts`
- Create: `apps/developer/src/lib/openapi-reference.test.ts`
- Create: `apps/developer/src/lib/sdk-catalog.ts`
- Create: `apps/developer/src/lib/sdk-catalog.test.ts`
- Create: `apps/developer/src/lib/__fixtures__/public-openapi.json`
- Create: `apps/developer/src/lib/__fixtures__/sdk-catalog.json`
- Modify: `apps/developer/package.json`
- Test: `apps/developer/src/lib/openapi-reference.test.ts`
- Test: `apps/developer/src/lib/sdk-catalog.test.ts`

**Interfaces:**

- Consumes: Task 2 CLI files (`openapi.json`, `openapi.metadata.json`) and release asset `sdk-catalog.json`.
- Produces: `buildApiReference(document): ApiReference`, `parseSdkCatalog(value, contract): SdkCatalog`, and ignored `apps/developer/src/generated/{openapi.json,openapi.metadata.json,sdk-catalog.json}` needed before `astro build`.

- [ ] **Step 1: Write failing reference-model tests from a small fixture**

Use a fixture containing two tagged operations, path/query parameters, JSON request body, `ApiKeyAuth`, success/error responses, and a referenced schema. Assert a stable, display-ready model rather than raw OpenAPI internals:

```ts
const reference = buildApiReference(fixtureDocument);

expect(reference.version).toBe("2.1.0");
expect(reference.groups[0]).toMatchObject({ name: "Resolve", operations: [{ method: "POST", path: "/api/v1/resolve" }] });
expect(reference.groups[0]?.operations[0]?.parameters).toContainEqual({ name: "url", location: "query", required: true });
expect(reference.schemas.ResolveSuccess.anchor).toBe("schema-resolve-success");
```

Add failure cases for absent `info.version`, unknown `$ref`, non-object path operation, and a security scheme other than the documented API-key scheme.

- [ ] **Step 2: Write failing SDK catalog validation tests**

The catalog format must be explicit and independent of GitHub API response shapes:

```ts
interface SdkCatalog {
  apiVersion: string;
  openApiSha256: string;
  sourceSha: string;
  generatorVersion: "7.22.0";
  assets: Array<{
    language: "typescript" | "python" | "swift";
    generator: "typescript-fetch" | "python" | "swift5";
    archiveName: string;
    archiveUrl: string;
    sha256: string;
    quickstart: { install: string; import: string; firstRequest: string };
  }>;
}
```

Assert that `parseSdkCatalog` rejects a different API version/fingerprint, duplicate language, a missing required language, an invalid checksum, an untrusted release URL, and any unexpected generator target.

- [ ] **Step 3: Implement narrow transformers and the generation script**

Keep raw OpenAPI parsing in `openapi-reference.ts`, then give Astro only `ApiReference` display types. Resolve local `#/components/schemas/*` references, produce stable anchors such as `schema-resolve-success`, sort tag groups/operations/schemas defensively, and preserve descriptions/examples without injecting raw HTML.

`generate-api-reference.mjs` must:

1. call the Task 2 CLI into `apps/developer/src/generated`;
2. read the local metadata to get API version/fingerprint;
3. download `sdk-catalog.json` from `SDK_CATALOG_URL` or the deterministic public GitHub Release URL `https://github.com/phranck/musiccloud/releases/download/api-sdk-v<version>/sdk-catalog.json`;
4. validate it with `parseSdkCatalog`; and
5. atomically write the verified catalog into the generated directory.

For isolated local work and tests, support `SDK_CATALOG_FILE=/absolute/path/to/fixture.json`; never silently skip catalog validation.

Add the required prebuild hook:

```json
"prebuild": "node scripts/generate-api-reference.mjs",
"build": "astro build"
```

- [ ] **Step 4: Run portal-library tests and an isolated generation preview**

Run:

```sh
pnpm --filter @musiccloud/developer test:run -- openapi-reference.test.ts sdk-catalog.test.ts
SDK_CATALOG_FILE="$PWD/apps/developer/src/lib/__fixtures__/sdk-catalog.json" \
  pnpm --filter @musiccloud/developer run prebuild
pnpm --filter @musiccloud/developer typecheck
```

Expected: generated local inputs exist, catalog fingerprint matches exporter metadata, and the working tree does not show generated files because they are ignored.

- [ ] **Step 5: Prepare the portal-data commit for user authorization**

```sh
git add apps/developer/scripts/generate-api-reference.mjs apps/developer/src/lib apps/developer/package.json
git commit -m "Feat: prepare generated API reference data"
```

Do not run the commit without the user's explicit commit authorization.

---

### Task 4: Replace the portal preview with the generated first-party reference

**Files:**

- Create: `apps/developer/src/components/docs/ApiReferenceNav.astro`
- Create: `apps/developer/src/components/docs/EndpointOperation.astro`
- Create: `apps/developer/src/components/docs/SchemaSection.astro`
- Create: `apps/developer/src/components/docs/SdkDownloadCard.astro`
- Create: `apps/developer/src/components/docs/CodeBlock.astro`
- Modify: `apps/developer/src/pages/docs/api.astro`
- Modify: `apps/developer/src/pages/docs/index.astro`
- Modify: `apps/developer/src/lib/icons.tsx`
- Create: `apps/developer/src/pages/docs/api.test.ts`
- Test: `apps/developer/src/pages/docs/api.test.ts`

**Interfaces:**

- Consumes: `ApiReference` and `SdkCatalog` from Task 3 plus existing `BaseLayout`, `PublicHeader`, `PublicFooter`, and portal design tokens.
- Produces: a static `/docs/api` HTML reference with endpoint anchors, schema anchors, raw manifest link, and exactly three validated SDK cards.

- [ ] **Step 1: Write a failing render-level reference test**

Render the Astro page or its focused content module with Task 3 fixtures and assert customer-facing facts:

```ts
expect(html).toContain("API reference");
expect(html).toContain("POST /api/v1/resolve");
expect(html).toContain("Authentication");
expect(html).toContain("X-API-Key");
expect(html).toContain("Download TypeScript SDK");
expect(html).toContain("Download Python SDK");
expect(html).toContain("Download Swift SDK");
expect(html).toContain("SHA-256");
expect(html).toContain("https://api.musiccloud.io/docs/json");
expect(html).not.toContain("Scalar.createApiReference");
```

Run: `pnpm --filter @musiccloud/developer test:run -- api.test.ts`

Expected: FAIL because the page still contains the static preview and no generated components.

- [ ] **Step 2: Implement the reference page from focused components**

Replace the preview-only concepts with this order:

```text
Title + API version + raw OpenAPI download
Integration guide: key, requests, errors, limits, versioning
SDK downloads: TypeScript, Python, Swift
Sticky/in-page tag navigation
One endpoint operation card per generated operation
Reachable schemas
```

`SdkDownloadCard.astro` receives one validated asset and renders the language name, generator target, API version, generator version, archive size/name, checksum in a copyable code element, direct GitHub Release download, and the catalog-provided quickstart. Use `<a download>` only for same-origin links; release links open normally with `target="_blank" rel="noopener noreferrer"`.

`EndpointOperation.astro` renders method, path, summary/description, `X-API-Key` requirement only when present in the transformed operation, path/query/header parameters, body media types, response status/media/schema link, and OpenAPI examples. Code is always escaped text in `CodeBlock.astro`; never use `set:html` for manifest descriptions or examples.

Continue existing portal patterns, for example:

```astro
<section class="rounded-card border border-border bg-surface px-7 py-7 mb-6" id={operation.anchor}>
  <div class="flex flex-wrap items-center gap-3 mb-4">
    <span class="rounded-button border border-border-strong px-2 py-1 text-code font-mono text-accent">{operation.method}</span>
    <h2 class="text-card-title font-medium tracking-tight">{operation.path}</h2>
  </div>
  <slot />
</section>
```

Add only the required icons to the central Iconsax wrapper, then use those exports. Do not import raw icons at page/component call sites.

- [ ] **Step 3: Update navigation copy and accessibility details**

Keep `/docs` as the overview and update its API-reference call to describe the now-live, generated reference. Add descriptive labels to the in-page reference navigation and use heading levels sequentially. Links that jump to endpoint/schema anchors remain same-page links. Validate keyboard focus and colour contrast through the existing portal token classes.

- [ ] **Step 4: Run portal validation**

Run:

```sh
SDK_CATALOG_FILE="$PWD/apps/developer/src/lib/__fixtures__/sdk-catalog.json" \
  pnpm --filter @musiccloud/developer test:run -- api.test.ts openapi-reference.test.ts sdk-catalog.test.ts
SDK_CATALOG_FILE="$PWD/apps/developer/src/lib/__fixtures__/sdk-catalog.json" \
  pnpm --filter @musiccloud/developer build
pnpm --filter @musiccloud/developer typecheck
pnpm lint
```

Expected: static Developer build succeeds and `/docs/api` is rendered without Scalar/Swagger content or ad-hoc structural tokens.

- [ ] **Step 5: Prepare the portal-reference commit for user authorization**

```sh
git add apps/developer/src/components/docs apps/developer/src/pages/docs apps/developer/src/lib/icons.tsx
git commit -m "Feat: render generated developer API reference"
```

Do not run the commit without the user's explicit commit authorization.

---

### Task 5: Generate, validate, and archive all SDK targets

**Files:**

- Create: `scripts/generate-sdk-release.mjs`
- Create: `scripts/generate-sdk-release.test.mjs`
- Create: `scripts/fixtures/openapi-sdk-fixture.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `scripts/generate-sdk-release.test.mjs`

**Interfaces:**

- Consumes: Task 2 canonical `openapi.json` and `openapi.metadata.json`.
- Produces: `artifacts/sdk/<version>/{typescript,python,swift}.zip`, `sdk-catalog.json`, and release-ready checksums. Input options are `--contract-dir`, `--out-dir`, `--source-sha`, and `--release-base-url`.

- [ ] **Step 1: Write a failing fixture generation test**

Use a tiny valid fixture with one API-key operation and one model. Execute the release script into a temporary directory with a fake source SHA and assert:

```js
assert.deepEqual(catalog.assets.map((asset) => asset.language), ["typescript", "python", "swift"]);
assert.equal(catalog.openApiSha256, fixtureMetadata.sha256);
for (const asset of catalog.assets) {
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.ok(existsSync(join(outputDir, asset.archiveName)));
}
```

Run: `node --test scripts/generate-sdk-release.test.mjs`

Expected: FAIL because the script does not exist.

- [ ] **Step 2: Implement pinned Docker generation**

The script invokes no mutable `latest` tag. For each configured target, mount the contract and output directory into the exact image:

```sh
docker run --rm \
  -v "$PWD:/local" \
  openapitools/openapi-generator-cli:v7.22.0 generate \
  -i /local/openapi.json \
  -g typescript-fetch \
  -o /local/generated/typescript \
  --additional-properties=npmName=@musiccloud/api-client,typescriptThreePlus=true
```

Use equivalent explicit configuration for `python` and `swift5`; write the chosen generator configuration to every generated SDK directory and the catalog. Keep custom templates out of scope.

Archive deterministically: stable file ordering, normalized mtimes, and no absolute paths. Calculate SHA-256 after archiving. The catalog must use these exact fields:

```json
{
  "apiVersion": "2.1.0",
  "openApiSha256": "<64 hex>",
  "sourceSha": "<40 or 64 hex>",
  "generatorVersion": "7.22.0",
  "assets": []
}
```

Fail before archiving when the contract JSON fingerprint differs from metadata, a target fails, a required language is absent, or output contains an unexpected extra archive.

- [ ] **Step 3: Add native generated-SDK smoke builds**

Run these from the generated target folders after generation:

```sh
pnpm install --ignore-scripts --frozen-lockfile=false && pnpm run build
python -m venv .venv && . .venv/bin/activate && python -m pip install . && python -c 'import musiccloud_api_client'
swift build
```

Derive the Python package import and TypeScript package command from the actual generated metadata, not a hard-coded guessed module name. If the Swift package does not build with the CI-pinned toolchain, fail publication; do not ship the ZIP as "best effort".

- [ ] **Step 4: Add developer commands and run the fixture test**

Add root commands:

```json
"sdk:generate": "node scripts/generate-sdk-release.mjs --contract-dir .tmp/openapi --out-dir .tmp/sdk --source-sha $(git rev-parse HEAD)",
"sdk:test": "node --test scripts/generate-sdk-release.test.mjs"
```

Run:

```sh
pnpm openapi:export
pnpm sdk:test
pnpm sdk:generate
```

Expected: three archives plus one catalog are created under ignored `.tmp/sdk`, all fingerprints and checksums agree, and all three generated projects build.

- [ ] **Step 5: Prepare the SDK-generation commit for user authorization**

```sh
git add scripts/generate-sdk-release.mjs scripts/generate-sdk-release.test.mjs \
  scripts/fixtures/openapi-sdk-fixture.json package.json .gitignore
git commit -m "Feat: generate OpenAPI SDK release artifacts"
```

Do not run the commit without the user's explicit commit authorization.

---

### Task 6: Publish SDK assets before Developer Portal deployment

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `zerops.yml:115-149`
- Modify: `apps/developer/scripts/generate-api-reference.mjs`
- Create: `docs/developer-api-sdks.md`

**Interfaces:**

- Consumes: Tasks 2, 3, and 5 commands plus GitHub `contents: write` permission on `main`.
- Produces: immutable GitHub Release `api-sdk-v<OpenAPI info.version>` with three ZIP assets and `sdk-catalog.json`; Developer deployment only starts after this job succeeds or confirms the exact release already exists.

- [ ] **Step 1: Add a non-publishing CI validation job**

For pull requests that touch exporter, public OpenAPI, generator, or portal-reference paths, run export plus the fixture generator test. It must not create tags/releases. Use a path-aware detection step or a workflow-level filter that includes at least:

```text
apps/backend/src/server.ts
apps/backend/src/routes/**
apps/backend/src/schemas/**
apps/backend/src/docs/**
apps/backend/src/openapi/**
apps/developer/src/lib/openapi-reference.ts
apps/developer/scripts/generate-api-reference.mjs
scripts/generate-sdk-release.mjs
```

Run `docker --version` before the generator and fail with an actionable error if Docker is unavailable.

- [ ] **Step 2: Add the main-branch SDK release job**

Add a `publish-api-sdks` job after `detect-changes`, with `permissions: { contents: write }`, that:

1. checks out the exact push SHA;
2. installs Node 22/pnpm and the Swift toolchain explicitly used by the release gate;
3. runs `pnpm openapi:export` and `pnpm sdk:generate`;
4. queries GitHub Release `api-sdk-v<version>`;
5. if absent, creates it and uploads `typescript.zip`, `python.zip`, `swift.zip`, and `sdk-catalog.json`;
6. if present, downloads its catalog and requires exact OpenAPI fingerprint, generator version, source SHA policy, filenames, and archive checksums to match, otherwise fails; and
7. publishes job outputs `api_version`, `openapi_sha256`, and `release_tag`.

Use `gh release create` / `gh release upload --clobber=false` only after all artifact and native-build checks passed. Do not publish a partial release.

- [ ] **Step 3: Make Developer deployment depend on the verified release**

Change `deploy-developer` to `needs: [detect-changes, publish-api-sdks]`. A skipped `publish-api-sdks` job for portal-only changes must still report success. Extend change detection so the Developer service becomes true for the contract input paths, including `apps/backend/**` initially if a narrower, tested matcher cannot safely identify all route-schema changes.

During the Zerops Developer build, `apps/developer`'s `prebuild` runs `generate-api-reference.mjs`. It exports the local checkout contract, downloads `sdk-catalog.json` from the already-published immutable release, and refuses the build if version/fingerprint differ. No Java or Docker is added to the Zerops image.

- [ ] **Step 4: Write the maintainer runbook**

Document:

- how to make a SDK-visible OpenAPI change and bump `info.version`;
- how to run `pnpm openapi:export`, `pnpm sdk:test`, and `pnpm sdk:generate` locally;
- how to use `SDK_CATALOG_FILE` for portal work before a release exists;
- the immutable release-tag/fingerprint failure and the correct response: increment version, never overwrite an existing release;
- generator-version upgrades, including regeneration of all three languages and a new API SDK release; and
- future package-registry publishing as intentionally out of scope.

- [ ] **Step 5: Exercise CI-equivalent commands and commit**

Run locally with fixture catalog:

```sh
pnpm openapi:export
pnpm sdk:test
SDK_CATALOG_FILE="$PWD/apps/developer/src/lib/__fixtures__/sdk-catalog.json" \
  pnpm --filter @musiccloud/developer build
pnpm --filter @musiccloud/backend test:run
pnpm --filter @musiccloud/developer test:run
pnpm lint
```

Expected: all commands pass. Confirm the workflow only grants `contents: write` to the main-branch release job and that `deploy-developer` cannot run ahead of it.

```sh
git add .github/workflows/ci.yml zerops.yml apps/developer/scripts/generate-api-reference.mjs \
  docs/developer-api-sdks.md
git commit -m "CI: publish verified OpenAPI SDK downloads"
```

Do not run the commit without the user's explicit commit authorization.

---

### Task 7: Run the full release-readiness regression and update planning state

**Files:**

- Modify: `.codex/plans/open/2026-07-11-MC-119-openapi-sdk-developer-portal.md`
- Modify: `docs/superpowers/specs/2026-07-11-openapi-sdk-developer-portal-design.md` only if implementation revealed a genuine design correction

**Interfaces:**

- Consumes: all prior tasks.
- Produces: evidence that the published contract, static portal reference, three SDK archives, and CI ordering agree on one API version and fingerprint.

- [ ] **Step 1: Check the finalized contract and portal output**

Run:

```sh
pnpm openapi:export
node -e 'const fs=require("node:fs"); const d=JSON.parse(fs.readFileSync(".tmp/openapi/openapi.json")); console.log(d.info.version, Object.keys(d.paths).length)'
SDK_CATALOG_FILE="$PWD/.tmp/sdk/sdk-catalog.json" \
  pnpm --filter @musiccloud/developer build
```

Inspect the generated `/docs/api` output or local rendered page. Confirm the raw-manifest link, all three SDK download links, checksums, generated endpoint sections, and schema anchors appear; confirm no Scalar markup or former UUID/OAuth copy remains.

- [ ] **Step 2: Run all required quality gates**

Run:

```sh
pnpm --filter @musiccloud/shared typecheck
pnpm --filter @musiccloud/backend typecheck
pnpm --filter @musiccloud/backend test:run
pnpm --filter @musiccloud/developer typecheck
pnpm --filter @musiccloud/developer test:run
pnpm lint
```

If React components were introduced instead of Astro-only components, additionally run the full repository diagnostic:

```sh
pnpm doctor
```

Expected: every command exits `0`. Investigate and fix any failure; do not label failures as pre-existing.

- [ ] **Step 3: Verify release-artifact invariants**

Run:

```sh
node -e '
const fs=require("node:fs");
const crypto=require("node:crypto");
const path=require("node:path");
const root=".tmp/sdk";
const c=JSON.parse(fs.readFileSync(path.join(root,"sdk-catalog.json")));
if (new Set(c.assets.map(a=>a.language)).size !== 3) process.exit(1);
for (const a of c.assets) {
  const actual=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,a.archiveName))).digest("hex");
  if (actual !== a.sha256) process.exit(1);
}
'
```

Expected: all three archive checksums match the catalog. In GitHub Actions, additionally verify release asset names/checksums equal this catalog before enabling the deployment job.

- [ ] **Step 4: Update plan checkboxes and commit verification evidence**

Mark every completed task/step in this plan, append precise command results and release tag under an `## Execution notes` heading, and move this file from `.codex/plans/open/` to `.codex/plans/done/` only after the CI release and Developer deployment are green.

```sh
git add .codex/plans/open/2026-07-11-MC-119-openapi-sdk-developer-portal.md
git commit -m "Docs: record OpenAPI SDK release verification"
```

Do not run the commit without the user's explicit commit authorization.

## Dependency boundary

MC-119 owns the contract export, first-party portal rendering, SDK generation, release artifacts, and delivery gates. It does not implement API-key enforcement, client quotas, applicant self-service, or billing. Those are prerequisites from the existing Public API access work. If they are unfinished or the released authentication behavior is not representable truthfully in the public contract, stop after documenting the blocker instead of publishing SDKs from stale documentation.

## Execution notes

_No implementation has started. Add dated command outputs, release tag, OpenAPI version, OpenAPI SHA-256, and any design corrections here during execution._

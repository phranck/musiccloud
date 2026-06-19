# Plan: API Link And Platform Link Consolidation

Plan-Nr.: MC-023

Status: completed
Created: 2026-06-06
Scope: Public API link payloads, share-page link rendering, resolve response mapping, frontend platform-link normalization, OpenAPI examples, and related tests.

## Objective

Consolidate how musiccloud turns internal service-link records into public API links and UI platform buttons.

The immediate production symptom is that cached share pages can render technical service IDs such as `apple-music`, `youtube-music`, and `netease` as visible button labels. Fresh resolves render correctly because they use a different data path.

The broader goal is to remove the duplicated link-mapping logic that allowed this drift:

- Backend route responses must never emit technical service IDs as `displayName`.
- Backend public API link payloads must be built through one documented helper.
- Frontend UI platform links must be normalized through one documented helper.
- Shared platform metadata in `@musiccloud/shared` must remain the single source of truth for user-facing service labels and colors.
- OpenAPI examples must use real `ServiceId` values.

## Current Code Findings

### Shared platform metadata

- Canonical service IDs live in `packages/shared/src/services.ts`.
- Canonical platform labels and colors live in `packages/shared/src/platform.ts`.
- `packages/shared/src/index.ts` already exports `platform.ts`, so shared helper additions there are automatically available to backend, frontend, and dashboard consumers.
- The real Apple Music service ID is `apple-music`, not `appleMusic`.
- The real YouTube Music service ID is `youtube-music`.

### Backend share path

- `apps/backend/src/routes/share.ts` builds `SharePageResponse.links` manually in three separate branches:
  - track branch
  - album branch
  - artist branch
- All three branches currently use `displayName: l.service`.
- This is the visible label bug for cached share pages.
- The current Apple Music storefront filter in `apps/backend/src/lib/server/share-page.ts` removes invalid Apple Music links before `SharePageResponse` is built. That behavior must remain unchanged.
- Share-page cache reads should serialize links as trusted cache entries with `confidence: 1` and `matchMethod: "cache"`.

### Backend resolve path

- `apps/backend/src/routes/resolve.ts` builds public link payloads manually for track, album, and artist resolve responses.
- `apps/backend/src/routes/resolve-public-get.ts` builds public link payloads manually for unauthenticated track resolves.
- These paths currently use resolver-provided `displayName`, which is usually correct, but this still leaves public API label hydration scattered across route modules.
- A centralized API-link builder should set `displayName` from shared platform metadata even for fresh resolve results, so resolver internals cannot drift from public API labels.

### Backend link-by-id path

- `apps/backend/src/routes/link.ts` comments say `displayName`, `confidence`, and `matchMethod` are omitted intentionally.
- The route schema says `links` are `PlatformLink#`.
- `PlatformLink#` requires `service`, `displayName`, `url`, `confidence`, and `matchMethod`.
- Therefore the route has a contract mismatch: the runtime response is slim, but the documented OpenAPI response is full.
- The Swift Apple client model decodes `service`, `displayName`, and `url`; Swift `Codable` ignores extra JSON keys by default. Returning full API links is therefore compatible with that client shape.

### Frontend platform mapping

- Resolve responses are mapped to UI platform links in `apps/frontend/src/lib/resolve/parsers.ts`.
- Share responses are mapped to UI platform links in `apps/frontend/src/lib/share/share-view.ts`.
- Both currently trust `link.displayName` from the API.
- `apps/frontend/src/components/platform/PlatformButton.tsx` prefers the passed `displayName` over the `PLATFORM_CONFIG` fallback.
- A shared frontend normalizer should validate the service ID and derive the display label from `PLATFORM_CONFIG`, using API `displayName` only as a last-resort fallback for unexpected future cases.

### OpenAPI and docs drift

- `apps/backend/src/schemas/openapi-schemas.ts` documents service IDs with examples such as `appleMusic`.
- Several OpenAPI examples use `service: "appleMusic"`.
- These examples are wrong for the current `ServiceId` union and should be corrected to `apple-music`.
- `apps/backend/src/routes/services-public.ts` OpenAPI examples also use `appleMusic`.

### Related but separate drift

- `apps/dashboard/src/features/analytics/websiteAnalyticsText.ts` has a local `SERVICE_LABELS` alias table for analytics event values.
- That table maps `youtube` to `YouTube Music`, while `PLATFORM_CONFIG.youtube.label` is `YouTube`.
- This is probably analytics-specific historical normalization, not part of the public API link bug.
- Do not change this in the first implementation slice unless a separate dashboard analytics labeling decision is made.

## Decisions

- Public API link display labels are derived from shared platform metadata, not from DB rows and not from resolver adapter `displayName`.
- DB/cache rows store technical service IDs and URLs. They are not UI-ready payloads.
- Route modules should not manually construct `ApiLink` objects.
- Cache-backed read paths should emit `matchMethod: "cache"` and `confidence: 1`, regardless of the original persisted match method.
- Fresh resolve paths should preserve resolver `confidence` and `matchMethod`, but hydrate `displayName` centrally.
- `stripTrackingParams` may be used by the central backend builder when requested. It is safe for Apple Music track URLs because it does not remove the semantic `i` query parameter.
- `/api/v1/link/:id` should be aligned to the documented full API-link response rather than documenting a second slim link shape.
- The frontend should defend against bad API display names by deriving labels from `PLATFORM_CONFIG` after service validation.
- Dashboard analytics label aliases are deferred.

## Non-Goals

- No database schema changes.
- No Drizzle migrations.
- No changes to Apple Music storefront filtering semantics.
- No changes to resolver matching confidence logic.
- No changes to adapter availability or plugin registry behavior.
- No dashboard analytics label cleanup in this plan's first implementation slice.
- No Swift client changes unless a later verification finds a real decode problem.

## Proposed Backend Design

Add a central helper module:

- `apps/backend/src/lib/server/api-links.ts`

Suggested exported functions:

- `toApiLinks(links, options)`
- `toCachedApiLinks(links, options)`

Suggested input shape:

```ts
type PublicLinkSource = {
  service: string;
  url: string;
  confidence?: number | null;
  matchMethod?: string | null;
};
```

Suggested options:

```ts
type ApiLinkOptions = {
  stripTracking?: boolean;
};
```

Behavior:

- Drop links without a valid `ServiceId`.
- Use `PLATFORM_CONFIG[service].label` for `displayName`.
- Preserve `confidence` and `matchMethod` only when both are valid for the public `ApiLink` shape.
- For cached links, force `confidence: 1` and `matchMethod: "cache"`.
- Optionally run `stripTrackingParams(url)` for response URLs.
- Return `ApiLink[]` from `@musiccloud/shared`.

Documentation requirements inside the helper:

- Explain that internal DB/cache service links are not public API links.
- Explain why display labels are hydrated from shared platform metadata.
- Explain the difference between fresh resolve responses and cache-backed share/link reads.
- Explain why cache reads intentionally overwrite `matchMethod` with `"cache"`.

## Proposed Shared Package Design

Add small helpers to `packages/shared/src/platform.ts`:

- `getPlatformLabel(service: ServiceId): string`
- optionally `getPlatformColor(service: ServiceId): string`

Reason:

- This avoids repeating `PLATFORM_CONFIG[service].label` everywhere.
- The function name documents the intended access pattern.
- Existing `PLATFORM_CONFIG` remains available for callers that need the full object.

Potential concern:

- `PLATFORM_CONFIG` is currently typed as `Record<ServiceId, PlatformConfig>`, so a helper is mostly ergonomic. It still helps route authors avoid accidentally using raw `service` strings as labels.

## Proposed Frontend Design

Add a central UI normalizer:

- `apps/frontend/src/lib/platform/api-links.ts`

Suggested exported function:

- `apiLinksToPlatformLinks(links: readonly ApiLink[]): PlatformLink[]`

Behavior:

- Drop links without `url`.
- Validate `service` with `isValidServiceId`.
- Set UI `platform` to the typed `ServiceId`.
- Set UI `displayName` from `PLATFORM_CONFIG[service].label`.
- Preserve `matchMethod`.
- Optionally keep API `displayName` only as a last-resort fallback for unexpected future services. For valid known services, shared config wins.

Update callers:

- Replace `platformLinksFromApiLinks` in `apps/frontend/src/lib/share/share-view.ts`.
- Replace `parsePlatformLinks` in `apps/frontend/src/lib/resolve/parsers.ts`.

Documentation requirement inside the frontend helper:

- Explain that API payload display names are presentation metadata, but the UI normalizes known service labels from shared config to protect against stale or malformed backend cache payloads.

## Proposed Route Changes

### `apps/backend/src/routes/share.ts`

Replace the three repeated manual `links.map(...)` blocks with:

- `links: toCachedApiLinks(trackData.links)`
- `links: toCachedApiLinks(albumData.links)`
- `links: toCachedApiLinks(artistData.links)`

Expected result:

- Track, album, and artist share responses use the same link-label logic.
- Apple Music storefront filtering still happens in `loadByShortId`, `loadAlbumByShortId`, and `loadArtistByShortId`.

### `apps/backend/src/routes/resolve.ts`

Replace manual response mappers with:

- `links: toApiLinks(result.links, { stripTracking: true })`

Apply to:

- `persistTrackAndRespond`
- `persistAlbumAndRespond`
- `persistArtistAndRespond`

Keep DB persistence mapping separate because it needs `externalId` and other internal fields that are not public API fields.

### `apps/backend/src/routes/resolve-public-get.ts`

Replace manual response mapper with:

- `links: toApiLinks(result.links, { stripTracking: true })`

Keep DB persistence mapping separate for the same reason as POST resolve.

### `apps/backend/src/routes/link.ts`

Update runtime response to return full `ApiLink[]`:

- `links: toCachedApiLinks(data.links)`

Update file comment:

- Remove the statement that `displayName`, `confidence`, and `matchMethod` are omitted.
- Explain that this endpoint is a DB read but still returns the same public link contract as resolve/share.

Potential compatibility:

- This adds fields to response links. It should be backward compatible for JSON clients that ignore unknown fields.
- It fixes the documented OpenAPI contract.

### `apps/backend/src/routes/services-public.ts`

Change public service labels to use shared platform metadata:

- `displayName: PLATFORM_CONFIG[a.id].label`

Keep adapter availability and color behavior unchanged.

Reason:

- The public website should use the same platform display source as share/resolve.
- Admin plugin pages may still expose manifest/adapter display names.

## OpenAPI Cleanup

Update `apps/backend/src/schemas/openapi-schemas.ts`:

- Change service description examples from `appleMusic` to `apple-music`.
- Change all `service: "appleMusic"` examples to `service: "apple-music"`.
- Check service active examples in `apps/backend/src/routes/services-public.ts` and use `apple-music`.

Do not change the schema field names.

## Test Plan

### Backend unit tests

Add tests for `apps/backend/src/lib/server/api-links.ts`:

- valid known service gets canonical label
- `apple-music` becomes `Apple Music`
- `youtube-music` becomes `YouTube Music`
- `netease` becomes `NetEase Cloud Music`
- invalid service is dropped
- fresh resolve links preserve valid `confidence` and `matchMethod`
- cached links force `confidence: 1` and `matchMethod: "cache"`
- `stripTracking` removes tracking parameters without removing Apple Music `i`

### Backend route tests

Add targeted share/link route tests if route dependencies can be mocked cleanly:

- share response labels are canonical for track/album/artist link payloads
- `/api/v1/link/:id` returns full API links matching `PlatformLink#`

If route-level tests are too coupled to repository/bootstrap state, cover the behavior at helper level and add one integration-shaped test around a small route instance with mocked repository access.

### Frontend tests

Add tests for the frontend normalizer:

- API link with `displayName: "apple-music"` renders UI label `Apple Music`
- API link with `displayName: "youtube-music"` renders UI label `YouTube Music`
- invalid service is dropped
- missing URL is dropped

Add or update tests for:

- `buildShareViewFromSharePageResponse`
- `parseResolveResponse`

Goal:

- Both share and fresh resolve paths use the same normalized label behavior.

### OpenAPI/docs test

Extend or add an assertion in `apps/backend/src/__tests__/openapi-docs.test.ts`:

- generated OpenAPI JSON does not contain `"appleMusic"` as a service example
- generated OpenAPI JSON does contain `"apple-music"` where relevant

## Verification Gates

Run after implementation:

- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm --filter @musiccloud/backend test:run -- api-links`
- `pnpm --filter @musiccloud/backend test:run -- openapi-docs`
- `pnpm --filter @musiccloud/frontend test:run`
- `pnpm lint`
- `BACKEND_URL=http://localhost:4000 INTERNAL_API_KEY=test pnpm --filter @musiccloud/frontend build`

Optional broader gates if route tests or shared package changes have unexpected blast radius:

- `pnpm --filter @musiccloud/backend test:run`
- `pnpm --filter @musiccloud/frontend typecheck` if configured or available through the package scripts

## Implementation Checklist

Each unchecked task must leave the project compilable at the end of the task.

- [x] Add shared platform label helper in `packages/shared/src/platform.ts`.
- [x] Add backend API-link builder in `apps/backend/src/lib/server/api-links.ts` with code comments documenting the public API boundary.
- [x] Add backend tests for API-link builder.
- [x] Replace share-route manual link mapping with cached API-link builder.
- [x] Replace resolve POST manual response link mapping with API-link builder.
- [x] Replace resolve GET manual response link mapping with API-link builder.
- [x] Align `/api/v1/link/:id` runtime response with full `PlatformLink#` schema via cached API-link builder.
- [x] Update `/api/v1/link/:id` route documentation comment.
- [x] Update public active services route to derive public labels from shared platform metadata.
- [x] Add frontend API-link-to-platform-link normalizer.
- [x] Replace share-view link mapper with frontend normalizer.
- [x] Replace resolve parser link mapper with frontend normalizer.
- [x] Add frontend normalizer tests.
- [x] Update OpenAPI service ID examples from `appleMusic` to `apple-music`.
- [x] Add or update OpenAPI docs test to catch service ID example drift.
- [x] Run backend typecheck and targeted backend tests.
- [x] Run frontend tests and frontend build.
- [x] Run `pnpm lint`.
- [x] Re-run any failing gate after fixes until green.

## Deferred Follow-Ups

- Consolidate resolver cache-link hydration helpers across `resolver.ts`, `album-resolver.ts`, and `artist-resolver.ts`.
- Decide whether plugin `manifest.displayName` and adapter `displayName` should be generated from `PLATFORM_CONFIG` or remain duplicated for plugin-admin metadata.
- Review dashboard analytics service-label aliases in `apps/dashboard/src/features/analytics/websiteAnalyticsText.ts`.
- Consider renaming or clarifying the shared `PlatformLink` interface in `packages/shared/src/platform.ts`, because it overlaps conceptually with `ApiLink` but has a different shape.

## Risks

- Changing `/api/v1/link/:id` to return full links adds fields to existing JSON responses. This should be additive, but external consumers should be considered.
- If any route currently returns service IDs outside `ServiceId`, the central builder will drop them. That is correct for public API links, but tests should make this behavior explicit.
- If a stored `matchMethod` contains unexpected historical values, cached read paths avoid the problem by forcing `"cache"`. Fresh resolve paths should still validate or preserve only the public enum.
- If the frontend normalizer always ignores API `displayName`, any future backend-only service label change will require updating `@musiccloud/shared`. That is intentional.
- The Apple Music storefront guard must remain before API-link serialization so hidden Apple Music links do not contribute to visible platform buttons.

## Rollback Plan

If a regression appears after implementation:

- Revert route usage back to local manual mappers only for the affected route.
- Keep helper tests in place to document expected behavior.
- Do not revert the OpenAPI `apple-music` corrections unless the schema itself changes.

## Success Criteria

- Cached share pages render canonical service labels.
- Fresh resolve result pages render the same canonical service labels.
- `/api/v1/share/:shortId`, `/api/v1/resolve`, and `/api/v1/link/:id` use the same backend API-link builder.
- Frontend share and resolve paths use the same UI platform-link normalizer.
- OpenAPI examples no longer advertise invalid service IDs.
- All verification gates are green.

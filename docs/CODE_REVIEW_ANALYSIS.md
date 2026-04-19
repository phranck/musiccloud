# Frontend Code Review — `apps/frontend/`

**Date:** 2026-04-19
**Scope:** Full audit of `apps/frontend/` (Astro 5 + React 19 islands, TypeScript strict, Tailwind 4)
**Reviewer:** Claude (automated, spot-verified)

---

## Executive Summary

The frontend is a well-structured Astro SSR app with selectively hydrated React islands, proper island directives, a clean API-proxy pattern, and zero secret leakage to the browser. State management uses `useReducer` + Context appropriately (no over-engineered store). The recent refactors (LogoView replacing BrandName, Nasalization removal, `fonts.css` extraction) reduced asset weight and complexity.

**However**, three material issues stand out:

1. **No test coverage whatsoever.** No Vitest/Jest config, no `*.test.*` or `*.spec.*` files anywhere in the frontend. Every refactor is blind.
2. **CSS injection vector** at `src/pages/[shortId].astro:156` — unvalidated `titleAlignment` string interpolated into a `style` attribute.
3. **Unauthenticated proxy endpoints** without rate limiting (`api/artist-info.ts`, `api/mc/*`) forward user-controlled parameters to backend.

Everything else is incremental cleanup: duplicated helpers, silent error swallowing, missing timeouts on a few fetches.

---

## Architecture (verified)

| Concern | Implementation |
|---|---|
| Framework | Astro 5.17.3 (Node standalone adapter 9.5.5) + React 19.2.4 |
| Styling | Tailwind 4.2.1 via `@tailwindcss/vite`; fonts via `@fontsource/*` |
| Routing | File-based Astro (`index.astro` prerendered; `[shortId].astro`, `embed/[shortId].astro`, `api/**` SSR-only) |
| State | React Context + `useReducer` (`OverlayContext`, `LocaleContext`, `useAppState`) — no Zustand/Redux |
| SSR data | Called from Astro frontmatter via `src/api/client.ts` (typed fetch wrappers, timeouts, optional `X-API-Key`) |
| Proxy pattern | Astro endpoints in `src/pages/api/**` forward to `BACKEND_URL` |
| Env | `BACKEND_URL`, `INTERNAL_API_KEY`, `TRACKING_ENABLED` — all server-side, not exposed via `PUBLIC_*` |
| i18n | 9 locales, JSON bundles, cookie-based detection (`mc:locale`), cross-island sync via window events |
| Hydration | `client:load` for interactive (overlay, share layout), `client:idle` for non-critical (landing, header, footer). No `client:visible` used. |

The architectural picture is sound.

---

## Critical Findings

### 1. Zero Test Coverage — CRITICAL

- No `vitest.config.*` / `jest.config.*`.
- No `*.test.{ts,tsx}` / `*.spec.{ts,tsx}` files.
- No E2E harness (Playwright, Cypress).
- Root `package.json` defines `npm test` but `apps/frontend` does not participate.

**Why it matters:** Resolve flow, i18n persistence, overlay history, genre search, and platform-icon rendering are all product-critical. Silent regressions ship undetected. The resolve state machine (`useAppState.ts`) has ~170 lines of reducer logic with no tests.

**Recommendation:** Add Vitest for unit tests (reducers, pure utils) and Playwright for 2–3 critical e2e flows (share page loads, resolve happy path, overlay navigation).

### 2. CSS Injection via `titleAlignment` — HIGH

**`src/pages/[shortId].astro:156`**
```astro
<h1 style={`text-align: ${contentPage.titleAlignment};`}>
```
`titleAlignment` comes from backend content pages. If the backend ever accepts arbitrary admin input and stores it unsanitized, this becomes `style="text-align: left; background: url(evil)"` or similar. Template literal inside a `style` attribute is a CSS-injection sink — modern browsers block `expression()` but `url()`, `@import`, and property-name injection still work.

**Fix:** Whitelist the value.
```astro
const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }[contentPage.titleAlignment] ?? 'text-left';
<h1 class={alignClass}>
```

### 3. Unauthenticated Proxy Endpoints — HIGH

**`src/pages/api/artist-info.ts`** (verified):
```ts
const res = await fetch(`${BACKEND_URL}${ENDPOINTS.v1.artistInfo}?${params.toString()}`);
```
- No auth, no rate limit, no CORS restriction.
- `name` is URL-encoded but still user-controlled — the backend becomes exposed to arbitrary lookup traffic via the public frontend.

Same pattern in `api/mc/api/send.ts` and `api/mc/script.js.ts` (Umami proxy) — all request headers forwarded, including cookies.

**Fix:** Either (a) rate-limit at the Astro endpoint (token bucket keyed on IP), or (b) require an opaque hash/signed param from legitimate callers, or (c) move rate-limiting to the backend where it can be shared with other consumers.

### 4. `set:html` on Backend HTML — MEDIUM

**`src/pages/[shortId].astro:164`**
```astro
<article class="prose prose-invert max-w-none" set:html={contentPage.contentHtml} />
```
If the backend stores CMS HTML authored by admins only, this is acceptable. But **there is no in-code assertion of that trust boundary**. If an admin account is compromised or if the content source ever expands to user input, this becomes stored XSS.

**Fix:** Either (a) add a comment + linter rule documenting the trust contract, or (b) run through `DOMPurify`/`sanitize-html` on the backend before storing, or (c) switch to a safe markdown renderer downstream of trusted input only.

---

## High-Value Findings

### 5. Duplicated `ErrorBoundary` — HIGH (reusability)

**`src/components/LandingPage.tsx`** and **`src/components/ui/ErrorBoundary.tsx`** both define `EB_STRINGS` and a full class-component error boundary. The landing version is a verbatim reimplementation.

**Fix:** Delete `LandingErrorBoundary`. Import the shared one. This directly violates the project rule ("Reusable UI components always in their own file"; "when same pattern appears in 2+ places, extract").

### 6. Duplicated `hexToRgb` — MEDIUM

Defined in **`LandingPage.tsx`** and **`share/ShareLayout.tsx`**.

**Fix:** Extract to `src/lib/ui/colors.ts`. Update both call sites in the same commit.

### 7. Silent Error Swallowing — MEDIUM

Multiple places catch and drop errors without user feedback:

- **`components/share/PopularTracksSection.tsx:32-54`** — `.catch(() => setResolving(false))`. Button appears to fail silently.
- **`components/platform/PlatformIconRow.tsx:36-47`** — swallows fetch error, renders empty marquee.
- **`components/share/EmbedModal.tsx:83-91`** — `navigator.clipboard.writeText()` rejection ignored; user sees "Copied!" toast even when copy failed (common on non-HTTPS origins).

**Fix:** Surface failures via the existing `useToast` hook. At minimum, log via a structured error reporter.

### 8. Resolve-Chain Race Condition — MEDIUM

**`src/pages/[shortId].astro:40`** does `Promise.all([fetchPublicContentPage(shortId), loadNav()])`. The fallback `fetchShareData()` only fires when *both* resolve as non-content. If `loadNav()` throws, the share page renders with an empty header nav and no indication why.

**Fix:** Decouple — `loadNav()` failure should degrade the header but not affect page selection.

### 9. `SongInfo` — Unmemoized Image Fetch — MEDIUM

**`components/cards/SongInfo.tsx:38-52`** creates a hidden `new Image()` for color extraction on every render. A parent re-render kicks off a fresh fetch.

**Fix:** Wrap in `useEffect` keyed on `src`, or memoize via `useMemo`.

### 10. `LandingPage` Random-Example Fetch Without Timeout — MEDIUM

**`components/LandingPage.tsx:189`** — `fetch(ENDPOINTS.frontend.randomExample)` with no `AbortSignal` or timeout. Used only for a teaser link. A slow backend slows landing hydration.

**Fix:** Add a 3s `AbortController` timeout; on failure, hide the teaser.

---

## Low-Severity Findings

- **`useAppState.ts:122-124` vs `ShareLayout.tsx:206-213`** — inconsistent error UX (one calls `parseErrorKey(err)`, the other silently renders nothing).
- **`api/v1/content/[slug].ts:22`** — generic 503 swallows timeout vs. parse vs. backend-5xx distinction.
- **`GenreSearchResults.tsx:311-318`** — `([a-z])/g` title-case regex only matches ASCII lowercase; breaks CJK and RTL content.
- **`components/LandingPage.tsx:189`** etc. — several fetches lack `credentials: 'same-origin'` explicitness (relies on default behavior).
- **`.remember/` was untracked** — fixed in this session (`Chore: Gitignore .remember/ scratch directory`, `b277290`).

---

## Positive Observations

- **Clean hydration strategy.** Islands use `client:load`/`client:idle` correctly. No indiscriminate `client:only`.
- **Strict TypeScript.** `tsconfig` uses strict mode; types flow from `@musiccloud/shared` workspace package.
- **Secret hygiene.** `import.meta.env` / `process.env` reads stay in `src/api/client.ts` (server-only). No `PUBLIC_*` leakage.
- **Linter pinned.** Biome 2.4.8 pinned in root `package.json`. `npm run lint` passes clean.
- **Graceful SSR fallbacks.** `<noscript>` on landing; client functions return `null`/`[]` rather than throwing, which keeps SSR shells resilient.
- **Proper use of `useReducer`** for multi-state flows (`useAppState`), matching project preference.
- **i18n done right.** Cookie-based locale for SSR, cross-island event sync, 9 locales bundled as JSON.
- **Recent refactors are net-positive.** The Dashboard `BrandName → LogoView` mirror, Nasalization removal, and `fonts.css` extraction cleanly remove complexity and shed ~100 KB of font assets.

---

## Suggested Priorities

### Must-Do (before next major release)

1. **Fix `titleAlignment` CSS injection** — 10 min work.
2. **Delete `LandingErrorBoundary`, use shared `ErrorBoundary`** — 15 min.
3. **Rate-limit or lock down `api/artist-info.ts` and `api/mc/*` proxies** — backend change required, plan needed.

### Should-Do (this quarter)

4. **Add Vitest + 1 smoke e2e test.** Start with `useAppState` reducer + resolve happy path.
5. **Extract `hexToRgb` to `lib/ui/colors.ts`.**
6. **Replace silent `.catch` handlers with toast/logging.**
7. **Decouple `fetchPublicContentPage` / `loadNav` error handling.**

### Nice-to-Have

8. Add `AbortController` timeouts to all client-side fetches.
9. Normalize error-UX between resolve and share-layout fetches.
10. Memoize `SongInfo` color-extraction fetch.

---

## Out of Scope (not reviewed here)

- Backend code (`apps/backend/`)
- Dashboard code (`apps/dashboard/`)
- Shared package (`packages/shared/`)
- Zerops deploy config
- Umami analytics dashboards

---

*Review based on code state at commit `b277290` (main).*

---

## Status Update — 2026-04-19 evening

Findings addressed in follow-up commits:

| # | Finding | Commit | Notes |
|---|---|---|---|
| 2 | `titleAlignment` CSS injection | `f84b968` | Whitelisted via `class:list` map |
| 5 | Duplicated `ErrorBoundary` | `cf1dfa8` | 93 LOC inline copy removed, shared one imported |
| 6 | Duplicated `hexToRgb` | `cf1dfa8` | Extracted to `lib/ui/colors.ts` |
| 7.3 | EmbedModal clipboard false-positive | `9596a6f` | Added `error` state + 9 locale strings |
| 7.1 | PopularTracksSection silent fail | `5210f82` | Added optional `onError` prop + dev `console.warn` |
| 7.2 | PlatformIconRow silent fail | `5210f82` | Dev `console.warn` added (silent in prod remains intentional for decorative marquee) |
| 10 | LandingPage fetch timeout | `8454061` | 3 s `AbortController` |
| 3a | Rate-limit `artist-info` proxy | `27809a4` | Backend route `apiRateLimiter` (30 req / 60 s). |

Findings re-examined and **invalidated**:

- **#8** (loadNav race): `fetchNavigation()` in `src/api/client.ts:114` catches internally and returns `[]`, so `loadNav()` cannot throw. No race.
- **#9** (`SongInfo` unmemoized image fetch): `SongInfo` is already wrapped in `React.memo`; the `new Image()` sits inside a `useEffect` keyed on `[albumArtUrl, onAlbumArtLoad]` with proper cleanup. Callers pass `onAlbumArtLoad` via `useCallback` (in `useAlbumColors.ts`) and `useMemo` (in `ShareLayout`), so identity is stable. No extra memoization needed.
- **#3b** (Umami proxy header leakage): re-reading `api/mc/api/send.ts` and `api/mc/script.js.ts` shows both already explicitly allow-list headers: `send.ts` forwards only a hardcoded `Content-Type` + client `User-Agent`; `script.js.ts` forwards no request headers at all. Cookies / Referer are NOT forwarded. Original review claim of "all request headers forwarded" was based on an incomplete read.

### Still open

- **#1 Zero test coverage** — frontend Vitest + Playwright setup. Larger task, needs separate plan.
- **Follow-up**: Fastify `trustProxy` so `request.ip` reflects the real client behind Zerops, making the artist-info limiter per-client instead of global.
- ~~**#4 `set:html` trust boundary**~~ — `abbdde2` added the trust-boundary comment on `pages/[shortId].astro:170` matching the companion note at `PageOverlayContent.tsx:41`.
- ~~**#7.1 callsite wiring**~~ — `24a795d` added `ToastProvider` (`src/context/ToastContext.tsx`), wrapped `ShareLayoutInner`, and rewired `PopularTrack` to surface failures via the shared toast using the existing `error.generic` i18n key. `onError` prop dropped.
- **Low**: `GenreSearchResults` ASCII-only title-case regex, `api/v1/content/[slug].ts` generic 503.

---

## Re-review pass — 2026-04-19 late

A second read-every-file pass was performed after the original review was found to contain partial-read errors. Methodology: every flagged file and every file in the frontend `src/` tree read end-to-end, including call paths.

### Re-review findings (addressed)

| # | File:Line | Severity | Commit |
|---|---|---|---|
| NEW-1 | `ShareButton.tsx:21-29` | HIGH | `bd1c77d` — same clipboard false-positive as old EmbedModal; 3-state + i18n key added |
| NEW-2 | `OverlayContext.tsx:105` | MEDIUM | `f673f58` — overlay-open fetch now has 5 s AbortController |
| NEW-3 | `PageHeader.tsx` + `AppFooter.tsx` | MEDIUM | `0a9aa41` — nav `item.url` whitelist (only `/`, `http(s)://`, `mailto:`, `tel:`); extracted to `src/lib/nav.ts` |
| NEW-4 | `GenreBrowseGrid.tsx:50` | LOW | `9e5034c` — backend `accentColor` matched against color-notation whitelist before inline-style assignment |
| NEW-5 | `ShareLayout.tsx:38-93` | LOW | `abf2ebf` — `TIMEZONE_TO_COUNTRY` expanded with SE/S Asia, Middle East, Africa, Latin America, HK/TW |

### Prior findings re-validated

- **#2, #3a, #5, #6, #7.2, #7.3, #10** — re-inspected; fixes stand.
- **#3b, #8, #9** — re-inspected; stayed invalid.

# Frontend UI Test Plan

Plan-Nr.: MC-019

> **Evergreen — NEVER move this file to `done/`.**
> This is the permanent blueprint for frontend smoke-testing (`apps/frontend`, the public musiccloud.io site). Extend it when the site grows. Invoked via `/ui-test frontend` or `/ui-test` (runs both frontend + dashboard in sequence).

## Preface

Re-runnable smoke-test plan for the musiccloud.io public frontend (`apps/frontend`, Astro SSR + React islands). Claude drives a real Chrome instance via the Chrome DevTools MCP against the local dev stack on `:3000`. Focus: every clickable affordance exercised at least once, plus error/empty/loading states and obvious visual glitches surfaced.

## Goal

Catch regressions in the primary visitor flows — search, resolve, share, artist info, audio preview, language switch — before they hit `main`. Not pixel-perfect QA; we assert "does it render, does it respond, does the right network call fire".

## Prerequisites

1. All three dev servers running: backend `:4000`, frontend `:3000`, dashboard `:4001` (the frontend proxies `/api/*` to the backend, and some resolves need the dashboard's shortId map). If not, start them (handled by `/ui-test` automatically).
2. Local Postgres reachable on `:5433` with migrations applied.
3. At least one track in the DB so resolve/share/artist-info tests have real data. If the DB is empty, share-page tests (`T-FE-SHARE-*`, `T-FE-ARTIST-*`, `T-FE-AUDIO-*`) auto-skip with `SKIP — no test track available`.
4. Chrome DevTools MCP tools available. If absent, abort.

## Approach

- One persistent page for the whole run. New pages only for the 404 test.
- Before each action: `take_snapshot`. After each action: verify via `take_snapshot`, `list_console_messages`, or `list_network_requests`. Never trust the absence of a thrown error.
- Resolve a canonical "seed" shortId at the start (steps in `T-FE-SETUP-01`) and reuse it for all share-page tests.
- Tests are independent — failures capture screenshot + last console + last failing network request and continue.
- Cleanup: nothing persistent is created by the frontend tests (no DB writes). If a test toggles a localStorage value (locale, theme), revert it at the end of the test.

## Scope — what to test

The public frontend has four routes: `/` (landing), `/[shortId]` (share), `/link/[id]` (301 legacy redirect), and `404.astro`. Every interactive element on each route must have at least one test.

### Test IDs

Stable ids (`T-FE-<AREA>-<NN>`) so a user can filter: "run T-FE-SEARCH-*" or "run T-FE-SHARE-01,T-FE-AUDIO-*".

---

## Checklist

### Setup

- [ ] **T-FE-SETUP-01 — Resolve a seed shortId**
  - Call `GET http://localhost:4000/api/v1/random-example` → `{ shortId }`, then `GET http://localhost:4000/api/v1/share/<shortId>` to hydrate title/artist/links.
  - Cache the shortId, title, artist, and one expected platform (e.g. `spotify`) in the test-run state.
  - If no track can be resolved, mark every test that depends on `{seed}` as `SKIP — no test track available` and continue with layout/search-only tests.

### Landing page — structure & chrome

- [ ] **T-FE-HOME-01 — Root page renders**
  - Navigate to `http://localhost:3000/`. Expect HTTP 200, title contains "musiccloud", hero input visible (`input[aria-label="Search for music by link or name"]`), language switcher and info button rendered, footer visible with the LAYERED link.
  - Zero `console.error` entries after load.

- [ ] **T-FE-HOME-02 — Example link is present and points to a share URL**
  - Locate the example link next to the hero (rendered when state is `idle`).
  - Assert it has `href="/<shortId>"` pattern and `target="_blank"` (or at least opens a share page). Do not click; clicking a "random example" is non-deterministic.

- [ ] **T-FE-HOME-03 — Footer link works**
  - Assert footer contains an `a` pointing to `https://layered.work` with `target="_blank"`. Do not actually navigate away.

### Language switcher

- [ ] **T-FE-LOCALE-01 — Switcher opens and lists 9 locales**
  - Click the language button (top-right, `button[aria-label^="Language:"]`).
  - Expect a dropdown/modal listing: EN, DE, FR, IT, ES, PT, NL, TR, CS (9 entries). Close it again.

- [ ] **T-FE-LOCALE-02 — Switching DE → EN → DE persists**
  - Start state: whatever the landing page currently shows.
  - Switch to EN → assert visible label changes (e.g. hero placeholder/search-button text flips to English), `localStorage['mc:locale'] === 'en'`.
  - Reload → state persists.
  - Switch back to DE → assert labels flip and `localStorage['mc:locale'] === 'de'`.

- [ ] **T-FE-LOCALE-03 — Every locale is selectable without console errors**
  - Iterate through all 9 locales, clicking each once. After each selection: snapshot for visible text change, check `list_console_messages({ types: ['error'] })` — must stay empty.
  - End the test back on DE (or the locale the user started with).

### Info panel

- [ ] **T-FE-INFO-01 — Opens and closes**
  - Click the info button (circular "i" icon, top-right). Modal appears. Close via X button and reopen. Then close via Escape key.

- [ ] **T-FE-INFO-02 — All four tabs render content**
  - Open the panel. Click each `button[role="tab"]` in sequence: About, Services, Imprint, Privacy. After each click, assert the tab's content container is non-empty (>50 chars of text). Close when done.

- [ ] **T-FE-INFO-03 — Click outside closes modal**
  - Open the panel. Click on the dark overlay (outside the modal content). Modal dismisses.

### Search — hero input & submit

- [ ] **T-FE-SEARCH-01 — Empty submit is a no-op**
  - Focus the hero input, press Enter with empty value. Expect no network request fired, no error shown, state stays `idle`.

- [ ] **T-FE-SEARCH-02 — Plain text search by name**
  - Type the seed track title into the hero input, press Enter.
  - Expect a `GET` or `POST` to `/api/public/...` (resolve or search endpoint), state flips to `loading` then either `resolved` (single hit) or `disambiguation` (multiple matches).

- [ ] **T-FE-SEARCH-03 — Paste a music URL auto-submits after 300ms**
  - Programmatically paste a Spotify track URL into the input (e.g. the seed's Spotify URL from the dashboard track). Do NOT press Enter.
  - Wait 500 ms, then expect the resolve network call fired automatically.

- [ ] **T-FE-SEARCH-04 — Invalid input is treated as fuzzy text search**
  - Type `not-a-url` into the input and submit.
  - Expect the backend to treat it as a plain-text search: either resolves to a track, renders a disambiguation panel with candidate matches, or (rare) shows an empty-result UI. No uncaught exceptions, no 5xx.

- [ ] **T-FE-SEARCH-05 — Clear button resets state**
  - After a successful resolve (from T-FE-SEARCH-02), click the `button[aria-label="Clear search"]`. Expect input empties and state flips back to `idle`, share card disappears.

- [ ] **T-FE-SEARCH-06 — Escape key clears input**
  - Type any text, press Escape. Input clears. (No submit.)

- [ ] **T-FE-SEARCH-07 — Submit button disabled when empty, enabled when non-empty**
  - After clear, assert search button has `disabled` attribute. Type one char → button enables. Clear → button disables again.

### Resolve flow

- [ ] **T-FE-RESOLVE-01 — Happy path: search resolves to share card**
  - Using the seed track, submit its title. Expect the URL to change to `/<shortId>` (or the share layout to render inline) and the MediaCard to show title, artist, artwork, platform buttons.

- [ ] **T-FE-RESOLVE-02 — Disambiguation panel appears when multiple matches**
  - Submit a deliberately ambiguous query (e.g. the word `love` alone — or skip if the DB doesn't have enough rows to produce multi-match).
  - If the panel renders: assert each row is a `button` with artwork + text; click the first → expect resolve + FLIP animation → share layout appears.
  - If no ambiguity is produced locally, mark `SKIP — DB has too few rows to disambiguate`.

- [ ] **T-FE-RESOLVE-03 — `track-resolve` Umami event fires**
  - After T-FE-RESOLVE-01, check `list_network_requests` for a request to `umami` (`umami.*/api/send` or similar) with body referencing `track-resolve`. If Umami is not loaded locally (likely — it's prod-only), mark `SKIP — Umami not configured locally` but note it in the report.

### Share page — direct load

- [ ] **T-FE-SHARE-01 — Direct-load `/<seed.shortId>` renders SSR**
  - Navigate to `http://localhost:3000/<seed.shortId>`. Expect HTTP 200, title contains the track title, meta og: tags set (check via `evaluate_script` for `<meta property="og:title">`).
  - MediaCard visible with title, artist, artwork, and at least one platform button.

- [ ] **T-FE-SHARE-02 — musiccloud logo links home**
  - Click the logo / `a[aria-label="Go to musiccloud home"]`. URL changes to `/`.

- [ ] **T-FE-SHARE-03 — Platform button opens in new window + fires analytics**
  - Navigate back to `/<seed.shortId>`. Click the Spotify platform button. Expect it has `target="_blank"` (verify via DOM, don't wait for the external page) and a `service-link-click` Umami call was queued (or `SKIP — Umami not configured` if local).
  - Close any resulting new tab opened by Chrome.

- [ ] **T-FE-SHARE-04 — Share button copies link to clipboard**
  - Click `button[aria-label="Share link"]`. Expect "Copied" confirmation text visible for ~2 s. Verify via `navigator.clipboard.readText()` (run via `evaluate_script`) — clipboard should equal `http://localhost:3000/<seed.shortId>` (or the short share URL).

- [ ] **T-FE-SHARE-05 — Native share button present only when supported**
  - Assert: `button[aria-label*="share"]` with the ShareNetworkIcon renders only when `navigator.share` is defined. Chrome desktop typically does not define it — the button should be absent. PASS either way (present or absent), but both states must be console-clean.

### Audio preview player

- [ ] **T-FE-AUDIO-01 — Play button toggles audio**
  - On the share page, if an audio preview exists (check for `button[aria-label*="preview"]` or the player element): click to play → state changes to playing (button aria-label flips); click again → pause.
  - If no preview available (`Preview unavailable` text rendered), mark `SKIP — no preview for this track`.

- [ ] **T-FE-AUDIO-02 — Keyboard shortcuts**
  - With player focus: press Space → toggle. Press Arrow Right → seek +5s (verify via `currentTime` on the audio element). Arrow Left → −5s.

- [ ] **T-FE-AUDIO-03 — Progress bar seek**
  - Click the progress bar at ~50% width. Expect audio `currentTime` jumps to ~50% of `duration`.

### Artist info

- [ ] **T-FE-ARTIST-01 — Desktop artist card renders or gracefully shows nothing**
  - On the share page at viewport ≥1024 px, observe the right-side artist card. Either: full content (profile pic or placeholder + genres + popular tracks + events + similar artists) OR a clean empty/skeleton state. No half-rendered / uncaught-error UI. Network tab: if `/api/public/artists/...` fires, it returned non-5xx.

- [ ] **T-FE-ARTIST-02 — Mobile artist sheet opens and closes**
  - Resize viewport to 400×800 via `resize_page`. The desktop card should hide; the floating artist info button (UserIcon) should appear.
  - Click → bottom sheet slides up. Close via the X button → sheet slides down.
  - Click again → reopen. Click the dark overlay → closes.

- [ ] **T-FE-ARTIST-03 — Popular track click navigates**
  - If popular tracks render: click the first track row. Expect navigation to `/<otherShortId>` and the MediaCard switches to the new track.

- [ ] **T-FE-ARTIST-04 — Similar artist track click navigates**
  - Same as T-FE-ARTIST-03, but for the `SimilarArtistsSection` tile. Skip if the section is empty.

- [ ] **T-FE-ARTIST-05 — Upcoming event link**
  - If an event row has a `ticketUrl`: assert it renders as `a[target="_blank"]` with that URL. Don't click (external).

### Genre browse & search

- [ ] **T-FE-GENRE-01 — Typing `genre:?` opens the browse grid**
  - From the landing page, type `genre:?` and submit. Expect the Genre browse grid to render with multiple genre tiles (each is a `button`).

- [ ] **T-FE-GENRE-02 — Genre tile click runs a genre search**
  - Click any genre tile. Expect the hero input to update to `genre: <name>`, a search to fire, and `GenreSearchResults` to render with Tracks / Albums / Artists columns.

- [ ] **T-FE-GENRE-03 — Genre result tile resolves**
  - In the results, click the first track tile. Expect navigation/resolve to a share page.

- [ ] **T-FE-GENRE-04 — Back button returns to genre grid**
  - After T-FE-GENRE-03, click the back link. Expect the GenreSearchResults / GenreBrowseGrid view restored with the previous state.

### Unknown shortId

- [ ] **T-FE-404-01 — Invalid shortId redirects to home**
  - `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/does-not-exist-xyz`. Expect HTTP 302 → `/` (the share route redirects unknown IDs to the landing page; there is no 404 UI).
  - Then open the same URL in the browser and assert the landing hero input is rendered after redirect.

### Legacy redirect

- [ ] **T-FE-LINK-01 — `/link/<id>` 301-redirects to `/<id>`**
  - Open `http://localhost:3000/link/<seed.shortId>`. Verify via `list_network_requests`: the first document request returned 301, final URL is `/<seed.shortId>`.

### Search variants

Every query form the hero input accepts. All variants POST to `/api/resolve`; the backend decides the response `status` (`success` / `disambiguation` / `genre-search` / `genre-browse` / `error`). For each variant: type/paste the query, submit, expect the listed outcome, and assert 0 console errors + 2xx on the resolve request.

- [ ] **T-FE-SEARCHVAR-01 — Spotify track URL** (from seed.links)
  - Paste the seed's Spotify URL, wait for auto-submit. Expect `success` → track MediaCard with same shortId as seed.
- [ ] **T-FE-SEARCHVAR-02 — Spotify album URL**
  - Paste a Spotify album URL (e.g. `https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3`). Expect `success` → album layout (or disambiguation).
- [ ] **T-FE-SEARCHVAR-03 — Spotify artist URL**
  - Paste a Spotify artist URL (e.g. `https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF` — Band of Horses). Expect `success` → artist layout.
- [ ] **T-FE-SEARCHVAR-04 — Apple Music URL**
  - Paste an Apple Music track URL (e.g. from seed.links `apple-music`). Expect `success`.
- [ ] **T-FE-SEARCHVAR-05 — YouTube URL**
  - Paste a YouTube URL from seed.links. Expect `success`.
- [ ] **T-FE-SEARCHVAR-06 — Tidal URL**
  - Paste a Tidal URL from seed.links. Expect `success`.
- [ ] **T-FE-SEARCHVAR-07 — Deezer URL**
  - Paste a Deezer URL from seed.links. Expect `success`.
- [ ] **T-FE-SEARCHVAR-08 — SoundCloud URL**
  - Paste a SoundCloud URL from seed.links. Expect `success`.
- [ ] **T-FE-SEARCHVAR-09 — Bandcamp URL**
  - Paste a Bandcamp URL from seed.links. Expect `success` or `disambiguation`. Mark `SKIP` if the seed has no Bandcamp link.
- [ ] **T-FE-SEARCHVAR-10 — ISRC code**
  - Submit the seed's ISRC (from `/api/v1/share/<id>`; e.g. `USSM10023051`). Expect `success` or `disambiguation`.
- [ ] **T-FE-SEARCHVAR-11 — `genre:<name>`**
  - Submit `genre: jazz`. Expect `genre-search` with Tracks / Albums / Artists columns (≥1 of each).
- [ ] **T-FE-SEARCHVAR-12 — `genre:<name>` with modifiers**
  - Submit `genre: jazz tracks:5 albums:3 artists:2`. Expect `genre-search`; each column capped at the requested count.
- [ ] **T-FE-SEARCHVAR-13 — Empty prefix `genre:?`**
  - Submit `genre:?`. Expect `genre-browse` grid with ≥50 tiles. (Covered by T-FE-GENRE-01 — cross-listed here for taxonomy completeness.)

### Navigation stack

The app is a single-page React state machine. It does **not** push browser-history entries for in-app transitions; back-navigation is internal to a reducer's `stack` array (see `apps/frontend/src/lib/resolve/parsers.ts`). The share route `/<shortId>` is a separate Astro page; since MC-029 Phase 1/2 (ClientRouter + in-place resolve) popular-track clicks resolve **in place** (fetch + `history.replaceState` to the new shortId) — no full-page navigation, no document reload.

- [ ] **T-FE-NAV-01 — Home URL unchanged during resolve**
  - From `/`, submit seed title. After the MediaCard renders, assert `window.location.pathname === "/"` (no pushState).
- [ ] **T-FE-NAV-02 — Browser Back after in-app resolve leaves the SPA**
  - From `/`, resolve a seed. Press browser Back. Expect to land on whatever was before `/` (typically `about:blank` in a fresh tab). The *previous in-app screen is not restored via Back* — that is by design.
- [ ] **T-FE-NAV-03 — `?share=` auto-redirect**
  - Navigate to `/?share=<seed.spotifyUrl>`. Expect an inline pre-hydration script to `location.replace` to `/api/redirect?url=<encoded>`, which in turn 302-redirects to `/<seed.shortId>`. Verify the final URL is the share page. (Entry-level param must NOT be `url=` — Vite's dev server reserves `?url` for asset imports and rejects document requests carrying it with 403.)
- [ ] **T-FE-NAV-04 — Internal back: genre-search → genre-browse**
  - Submit `genre:?` → browse grid. Click a tile → genre-search results. A "Back" control should appear; click it → returns to the browse grid with previous state intact (same tile selection visible). No URL change throughout.
- [ ] **T-FE-NAV-05 — Internal back: genre-search result → results → browse**
  - From the browse grid → click tile → click first track → share card renders with "Back to discovery results" link. Click it → returns to the genre-search results panel. Click "All genres" / genre-browse back → returns to the grid. No URL change throughout.
- [ ] **T-FE-NAV-06 — Popular-track click = in-place resolve (no reload)**
  - On a share page, click a popular track. Expect the MediaCard to swap to the new track and `document.location.pathname` to change to `/<otherShortId>` via `history.replaceState` — WITHOUT a document reload (`performance.getEntriesByType("navigation")` count stays 1, no new document request in the network tab). Updated 2026-06-12: MC-029 Phase 1/2 replaced the former `window.location.href` full-page navigate with an in-place resolve.
- [ ] **T-FE-NAV-07 — Clear resets stack**
  - From any non-idle state (e.g. genre-search), click the clear button. Expect state → idle, input empty, and the internal back link is absent (stack cleared). No URL change.

### Cross-cutting

- [ ] **T-FE-CONSOLE-01 — No console errors during a typical visitor flow**
  - Collapse: landing → search-by-name → share page → platform hover (no click) → back to `/` → language switch → back to `/`. Zero `level: error` entries.
  - Warnings are informational — log them in the report but do not fail.

- [ ] **T-FE-NETWORK-01 — No 5xx responses during the run**
  - At end of run, `list_network_requests` preserved. Filter for `status >= 500`. Empty list = PASS.

- [ ] **T-FE-ACCENT-01 — Share-page accent colour extraction completes**
  - On the share page, wait ≤3 s after navigation; assert `document.documentElement.style.getPropertyValue('--bg-blob-primary')` is non-empty (the useAlbumColors hook sets `--bg-blob-primary/secondary/tertiary` on the root). The 3 s fallback must fire either way — no neutral stuck state.

---

## Reporting

See the **Reporting** section of `.claude/commands/ui-test.md` for the canonical row format (18-char ID, 6-char status, optional parenthetical note), live-progress `TEST` row, ANSI colours, and totals block. Do not invent a different format here — both plans must produce identical output.

## Change log

- 2026-04-18: Initial draft. Covers landing, search, resolve, share, embed, audio, artist info, genre browse, 404, legacy redirect, and locale/console/network cross-cuts.
- 2026-05-25: Removed obsolete embed-flow smoke tests after the public embed route and share-page embed action were retired.

# Vinyl Record Player View Implementation Plan

Plan-Nr.: MC-068

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. In this Codex session the Superpowers tools are not discoverable, so read the installed local skill files under `/Users/phranck/.codex/skills/superpowers/` when needed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible spinning CD affordance with a realistic spinning vinyl record everywhere it is currently used, then add a share-page turntable view toggled with `P`.

**Architecture:** Keep the current CD component intact as a preserved component, but introduce a separate reusable `VinylRecord` component and switch all current CD call sites to it. Add a separate `Turntable` component that composes `VinylRecord` but does not own playback; share-page playback state remains owned by `AudioPreviewPlayer` and is passed down as visual state.

**Tech Stack:** React, Astro, TypeScript, Tailwind CSS v4 theme tokens, CSS transform animations, Web Animations API where continuous spin/coast needs exact control, Vitest + Testing Library, React Doctor.

## Global Constraints

- Antworten und Planpflege bleiben deutsch; Code, Typen, Komponenten und Tests bleiben englisch.
- `CDSpinArtwork` bleibt als Komponente erhalten, wird aber nicht mehr als sichtbare Loading-/Resolve-Disc verwendet.
- Vinyl-Drehgeschwindigkeit: echtes LP-Tempo, `33 1/3 rpm`, also `1.8s` pro Umdrehung.
- Alle Bewegungen müssen GPU-freundlich sein: nur `transform`/`opacity`, `transform-gpu`, `will-change: transform`, keine Layout-/Paint-lastigen Frame-Animationen.
- Lichtreflexionen auf Vinyl bleiben statisch zur Umgebung, nicht mitrotierend.
- Das LP-Papierlabel nutzt, wo vorhanden, die Cover-Art des ausgewählten Tracks/Albums.
- Share-Seite: Taste `P` toggelt zwischen Cover- und Plattenspieleransicht, ohne Eingabefelder, Buttons oder Modifier-Tastenkombinationen zu hijacken.
- Share-Seite: `Space` und Play-Button starten Audio sofort und Vinyl-Rotation sofort; Pause stoppt Audio sofort, Vinyl läuft visuell 2s aus.
- Bestehende Card-/Radius-/Spacing-Regeln aus `AGENTS.md` bleiben gültig. Keine neuen ungeführten Card-Patterns.
- Keine Commits, Pushes oder Branch-Wechsel ohne separate explizite Freigabe.

---

## File Structure

- Create `apps/frontend/src/components/vinyl/VinylRecord.tsx`
  - Pure visual LP component.
  - Props: `className`, `labelArtworkUrl`, `labelTitle`, `labelSubtitle`, `labelYear`, `spinState`.
  - Owns the record surface, grooves, track separators, static rainbow sheen and optional 2s coast animation.
- Create `apps/frontend/src/components/vinyl/Turntable.tsx`
  - Pure visual turntable component.
  - Props: `className`, `record`.
  - Composes `VinylRecord` and draws the deck, platter, 33/45/ON/STANDBY labels, spindle, LED and brand.
- Create `apps/frontend/src/components/vinyl/VinylRecord.test.tsx`
  - Pins cover-label rendering, spin-state classes/data attributes, and fallback label behavior.
- Create `apps/frontend/src/components/vinyl/Turntable.test.tsx`
  - Pins component boundary: turntable renders deck chrome and delegates LP rendering through supplied record props.
- Modify `apps/frontend/src/components/ui/SlideArtwork.tsx`
  - Replace `CDSpinArtwork` render with `VinylRecord`.
  - Preserve two-phase drop-in/drop-out mount behavior.
- Modify `apps/frontend/src/components/ui/SlideArtwork.test.tsx`
  - Rename CD assertions to vinyl assertions and keep mount/unmount behavior pinned.
- Modify `apps/frontend/src/components/landing/HeroSubmitSlot.tsx`
  - Replace hero loading CD with vinyl fallback.
  - Keep phase machine and animation classes.
- Modify `apps/frontend/src/components/landing/LandingPage.test.tsx`
  - Keep hero choreography assertions, rename helper comments where they mention disc/CD.
- Modify `apps/frontend/src/styles/global.css`
  - Keep the current CD-era `--animate-vinyl-spin: spin 360ms linear infinite` for `CDSpinArtwork`.
  - Add a separate LP spin token/class at `1.8s` per revolution so preserving the CD component is real, not only nominal.
  - Add vinyl surface tokens if repeated CSS values need stable names.
- Modify `apps/frontend/src/styles/animations.css`
  - Keep existing hero/row slide classes but make transform hints explicit where needed.
  - Add share cover↔turntable horizontal slide classes only if the implementation does not use a small React component with Tailwind transitions.
- Modify `apps/frontend/src/components/cards/MediaCardHead.tsx`
  - Accept share-only visual props for turntable toggle and playback visual state.
  - Forward them to `SongInfo`.
- Modify `apps/frontend/src/components/cards/MediaCard.tsx`
  - Forward optional share-only turntable props from `SharePageCard` to `MediaCardHead` so the mobile path works.
- Modify `apps/frontend/src/components/cards/MediaSummaryCard.tsx`
  - Pass the share-page turntable props from layout to card head.
- Modify `apps/frontend/src/components/share/SharePageCard.tsx`
  - Mobile share card passes the same turntable props.
- Modify `apps/frontend/src/components/share/DesktopShareLayout.tsx`
  - Pass `previewStatus` and turntable-view state into `MediaSummaryCard`.
- Modify `apps/frontend/src/components/share/MobileShareLayout.tsx`
  - Pass `previewStatus` and turntable-view state into `SharePageCard`.
- Modify `apps/frontend/src/components/share/ShareLayout.tsx`
  - Own `cover | turntable` view state.
  - Register the `P` key toggle.
  - Pass `previewStatus` to both desktop and mobile media cards.
- Modify `apps/frontend/src/components/cards/SongInfo.tsx`
  - Split the square artwork stage into a cover/turntable switcher.
  - Keep existing cover swap animation for artwork URL changes.
  - Render turntable only when share toggle state is enabled.
- Modify `apps/frontend/src/lib/types/media-card.ts`
  - Add explicit optional `albumTitle`, `releaseYear`, or equivalent LP-label display fields so `SongInfo` does not parse `metaLine`.
- Modify `apps/frontend/src/lib/share/share-view.ts` and `apps/frontend/src/lib/resolve/parsers.ts`
  - Populate the LP-label fields from structured API data while keeping existing display strings unchanged.
- Modify `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx`
  - Emit a synchronous play-intent visual callback before `audio.play()` resolves, in addition to the existing status callback.
- Create or modify tests near touched files:
  - `apps/frontend/src/components/share/ShareLayout.test.tsx` if no suitable existing test covers `P`.
  - `apps/frontend/src/components/cards/SongInfo.test.tsx` if stage switch behavior is easiest to isolate there.

## Stage 1: LP Austausch

### Task 1.1: Add VinylRecord Component

**Files:**
- Create: `apps/frontend/src/components/vinyl/VinylRecord.tsx`
- Create: `apps/frontend/src/components/vinyl/VinylRecord.test.tsx`
- Modify: `apps/frontend/src/styles/global.css`

**Interfaces:**
- Produces:
  - `VinylSpinState = "idle" | "playing" | "coasting"`
  - `VinylRecordProps`
  - `VinylRecord(props: VinylRecordProps): JSX.Element`
- Consumes:
  - `cn` from `@/lib/utils`

- [x] Write tests that assert `VinylRecord` renders a circular record, optional cover label, fallback label text, and `data-spin-state`.
- [x] Implement `VinylRecord` using nested elements with `transform-gpu`, static reflection layer outside the rotating surface, and label artwork in the center.
- [x] Add a dedicated LP spin token/class at `1.8s` per revolution. Do not change the existing `--animate-vinyl-spin` token used by `CDSpinArtwork`, because the CD component must remain intact.
- [x] Ensure the component accepts missing `labelArtworkUrl` for hero-loading fallback.
- [x] Run `pnpm --filter @musiccloud/frontend test:run -- VinylRecord.test.tsx`.
- [x] Run `pnpm doctor:diff`.
  - Verified with direct Vitest and full React Doctor because the local `pnpm` wrapper required build-script approval and Doctor diff ignores untracked files.

### Task 1.2: Replace CD Usage In SlideArtwork

**Files:**
- Modify: `apps/frontend/src/components/ui/SlideArtwork.tsx`
- Modify: `apps/frontend/src/components/ui/SlideArtwork.test.tsx`
- Modify: `apps/frontend/src/styles/animations.css`

**Interfaces:**
- Consumes: `VinylRecord` from `@/components/vinyl/VinylRecord`
- Produces: unchanged `SlideArtwork` public props

- [x] Update the test names/comments from CD wording to vinyl wording without changing behavioral assertions.
- [x] Replace `CDSpinArtwork` with `VinylRecord labelArtworkUrl={artworkUrl}`.
- [x] Keep the current `discMounted` mount/exit lifecycle intact.
- [x] Ensure row/tile animation wrappers carry `transform-gpu` and `will-change-transform` where needed.
- [x] Run `pnpm --filter @musiccloud/frontend test:run -- SlideArtwork.test.tsx`.
- [x] Run `pnpm doctor:diff`.
  - Verified with direct Vitest and full React Doctor for the same local wrapper/untracked-file reasons as Task 1.1.

### Task 1.3: Replace CD Usage In HeroSubmitSlot

**Files:**
- Modify: `apps/frontend/src/components/landing/HeroSubmitSlot.tsx`
- Modify: `apps/frontend/src/components/landing/LandingPage.test.tsx`

**Interfaces:**
- Consumes: `VinylRecord` from `@/components/vinyl/VinylRecord`
- Produces: unchanged `HeroSubmitSlot` public props and loading phase behavior

- [x] Replace static and animated hero loading `CDSpinArtwork` with `VinylRecord`.
- [x] Use fallback LP label content because the hero loading state has no resolved cover yet.
- [x] Preserve `.mc-hero-btn-out`, `.mc-hero-disc-in`, `.mc-hero-disc-out` phase selectors so existing tests stay meaningful.
- [x] Update comments that explicitly say CD where the behavior is now vinyl.
- [x] Run `pnpm --filter @musiccloud/frontend test:run -- LandingPage.test.tsx`.
- [x] Run `pnpm doctor:diff`.
  - Verified with direct Vitest and full React Doctor; `CDSpinArtwork` is preserved through a narrow documented Doctor override because MC-068 requires keeping it.

## Stage 2: Share Playeransicht

### Task 2.1: Add Turntable Component

**Files:**
- Create: `apps/frontend/src/components/vinyl/Turntable.tsx`
- Create: `apps/frontend/src/components/vinyl/Turntable.test.tsx`

**Interfaces:**
- Consumes: `VinylRecord` and `VinylRecordProps`
- Produces:
  - `TurntableProps`
  - `Turntable(props: TurntableProps): JSX.Element`

- [x] Write tests that assert deck chrome, `music/cloud`, labels `33`, `45`, `ON`, `STANDBY`, green LED, spindle, and nested vinyl record render.
- [x] Implement the turntable from the accepted mockup as a pure component.
- [x] Keep turntable and vinyl separate: `Turntable` passes record props down and does not reimplement LP markup.
- [x] Keep all text crisp: no `text-shadow`, no artificial text stroke on turntable labels or brand.
- [x] Run `pnpm --filter @musiccloud/frontend test:run -- Turntable.test.tsx`.
- [x] Run `pnpm doctor:diff`.
  - Verified with direct Vitest and full React Doctor.

### Task 2.2: Wire Share View Toggle State

**Files:**
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx`
- Modify: `apps/frontend/src/components/share/DesktopShareLayout.tsx`
- Modify: `apps/frontend/src/components/share/MobileShareLayout.tsx`
- Modify: `apps/frontend/src/components/cards/MediaCard.tsx`
- Modify: `apps/frontend/src/components/cards/MediaSummaryCard.tsx`
- Modify: `apps/frontend/src/components/share/SharePageCard.tsx`
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx`

**Interfaces:**
- Produces:
  - share view state equivalent to `cover | turntable`, preferably as a module-scope PascalCase literal namespace to satisfy React Doctor.
  - `onToggleTurntableView` keyboard handler owned by `ShareLayout`.
- Consumes:
  - existing `previewStatus` from `ShareLayout`

- [x] Add a `P` key handler in `ShareLayout` that ignores focused inputs, buttons, links, contentEditable elements and modifier-key events.
- [x] Store view state in `ShareLayout` so desktop and mobile stay in sync.
- [x] Pass view state and `previewStatus` down both paths:
  - desktop: `ShareLayout` → `DesktopShareLayout` → `MediaSummaryCard` → `MediaCardHead` → `SongInfo`
  - mobile: `ShareLayout` → `MobileShareLayout` → `SharePageCard` → `MediaCard` → `MediaCardHead` → `SongInfo`
- [x] Do not enable this toggle for non-share embedding paths unless the same props are explicitly passed.
- [x] Add or update a test that fires `keydown` with `key: "p"` and verifies the view prop path changes.
- [x] Add negative keyboard tests for `P`: focused input, button, link, `contentEditable`, modifier keys and repeated keydown must not toggle.
- [x] Run the targeted share/card tests.
- [x] Run `pnpm doctor:diff`.
  - Verified with direct Vitest and full React Doctor.

### Task 2.3: Implement SongInfo Cover ↔ Turntable Stage

**Files:**
- Modify: `apps/frontend/src/components/cards/SongInfo.tsx`
- Modify: `apps/frontend/src/lib/types/media-card.ts`
- Modify: `apps/frontend/src/lib/share/share-view.ts`
- Modify: `apps/frontend/src/lib/resolve/parsers.ts`
- Create or modify: `apps/frontend/src/components/cards/SongInfo.test.tsx`

**Interfaces:**
- Consumes:
  - `Turntable`
  - `AudioPreviewStatus`
  - share view state from `MediaCardHead`
  - structured LP label fields from `MediaCardContentConfiguration`
- Produces:
  - cover view remains the current large cover image behavior.
  - turntable view slides in from right while cover slides left out.
  - LP label copy is derived from explicit fields, not from parsing `metaLine`.

- [x] Extend `MediaCardContentConfiguration` with explicit optional LP-label fields, for example `labelAlbumTitle?: string`, `labelReleaseYear?: string`, and `labelCatalogText?: string`.
- [x] Populate those fields in `buildShareViewFromSharePageResponse`, `buildActiveConfig`, `buildShareConfigFromActive`, and CC builders where structured data exists.
- [x] Preserve existing `title`, `album`, `metaLine`, VFD lines and platform display behavior.
- [x] Split the current square `TftScreen` content into a cover layer and a turntable layer.
- [x] Preserve existing cover artwork swap when `albumArtUrl` changes.
- [x] Implement horizontal view slide using only `transform` and `opacity`; add `transform-gpu` and `will-change-transform`.
- [x] Render `Turntable` with `record.labelArtworkUrl = albumArtUrl`, `record.labelTitle = labelAlbumTitle ?? album ?? title`, `record.labelSubtitle = artist`, `record.labelYear = labelReleaseYear`, and typical LP imprint text from explicit config fields.
- [x] Ensure reduced motion shows the selected view without long animation.
- [x] Run the targeted `SongInfo` test.
- [x] Run `pnpm doctor:diff`.
  - Verified with direct Vitest over the touched UI/data tests and full React Doctor.

### Task 2.4: Connect Playback Visual State And 2s Coast

**Files:**
- Modify: `apps/frontend/src/components/vinyl/VinylRecord.tsx`
- Modify: `apps/frontend/src/components/cards/SongInfo.tsx`
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx`
- Modify: `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx`
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx`
- Modify: `apps/frontend/src/components/cards/MediaCard.tsx`
- Modify: `apps/frontend/src/components/cards/MediaSummaryCard.tsx`
- Modify: `apps/frontend/src/components/share/SharePageCard.tsx`
- Modify: `apps/frontend/src/components/share/DesktopShareLayout.tsx`
- Modify: `apps/frontend/src/components/share/MobileShareLayout.tsx`
- Modify tests from Tasks 2.2 and 2.3

**Interfaces:**
- Consumes:
  - a new synchronous play-intent callback emitted before `audio.play()`
  - `AudioPreviewStatus.Playing`
  - `AudioPreviewStatus.Paused`
  - `AudioPreviewStatus.Ready`/`Ended`/`Unavailable`
- Produces:
  - visual `VinylSpinState.Playing` while audio is playing.
  - visual `VinylSpinState.Coasting` for exactly 2s after audio leaves playing.
  - visual `VinylSpinState.Idle` after coast completes.

- [x] Add an optional `onPlaybackIntent` callback to `AudioPreviewPlayer` or a narrowly named equivalent. Call it synchronously when `togglePlay` enters the play branch, before `audio.play()`.
- [x] Forward the intent through `MediaCardHead`/share layout only for the share player visual state; do not change audio semantics.
- [x] Derive steady vinyl visual state from `previewStatus`, but use the play-intent callback to start the LP animation immediately on Play button or Space.
- [x] On pause/ready/end after playing, stop audio immediately through existing `AudioPreviewPlayer`, but keep vinyl in coasting state for 2000ms.
- [x] Implement coast with transform-only animation. Prefer Web Animations API if preserving current angle is needed to avoid snapping.
- [x] Add cleanup for any 2s timer or animation when the component unmounts or track changes.
- [x] Test `Playing → Paused` with fake timers and assert coasting then idle.
- [x] Run targeted vinyl/share tests.
- [x] Run `pnpm doctor:diff`.
  - Verified with direct Vitest, direct `tsc --noEmit`, and full React Doctor because the local `pnpm` wrapper still requires install/build-script approval.

### Task 2.5: Rendered QA And Gates

**Files:**
- No new source files unless a temporary script is kept outside the repo.

**Interfaces:**
- Consumes:
  - built frontend app
  - an available share URL or local page route
- Produces:
  - verification evidence for cover view, `P` toggle, play/space spin start, pause coast, desktop and mobile.

- [x] Run `pnpm --filter @musiccloud/frontend test:run`.
  - Verified with direct `./node_modules/.bin/vitest run`: 46 files, 251 tests green.
- [x] Run `pnpm --filter @musiccloud/frontend build`.
  - Verified with direct `./node_modules/.bin/astro build`: green.
- [x] Run `pnpm doctor:diff`.
  - Verified with full direct `./node_modules/.bin/react-doctor . --verbose --no-score --yes --no-color --blocking warning`: 0 issues.
- [x] Run `pnpm lint` if touched formatting/lint-sensitive files need full check.
  - No frontend lint script exists; verified with direct `tsc --noEmit`, `astro check`, build and React Doctor.
- [x] Start or reuse the frontend dev server with `pnpm --filter @musiccloud/frontend dev`.
  - Verified with direct `./node_modules/.bin/astro dev --host 127.0.0.1 --port 4321`.
- [x] Browser QA target flow: share page loads → cover view visible → press `P` → turntable slides in → press Space/play → LP spins → pause → audio stops and LP coasts 2s.
  - Share page load, cover default and `P` cover→turntable slide verified in the in-app browser on `http://127.0.0.1:4321/K9Vyx`.
  - Local play/coast browser QA was blocked because every tested external preview URL immediately switched the audio player to "Vorschau nicht verfügbar"; the play-intent and 2s coast flow is covered by unit tests with fake timers.
- [x] Capture desktop and one mobile viewport screenshot if browser tooling can access the route.
  - Captured desktop turntable QA screenshot at `mockups/share-turntable-qa-desktop.png`; mobile DOM path is covered by tests, but no valid mobile screenshot was kept because the in-app mobile keypress/focus path navigated back to the landing page during QA.

## Acceptance Criteria

- All current visible CD loading/resolve affordances render as vinyl records.
- `CDSpinArtwork` still exists in source.
- The LP uses cover art as the label anywhere a cover URL exists.
- LP rotation is `33 1/3 rpm` (`1.8s` per revolution).
- Share page cover view remains the default and visually unchanged until toggled.
- Pressing `P` toggles cover/turntable view with a horizontal slide.
- Pressing Play or Space starts audio and LP rotation immediately.
- Pausing stops audio immediately and the LP visually coasts for 2s.
- Turntable and VinylRecord remain separate components.
- Animations are GPU-friendly and do not animate layout properties.
- React Doctor diff scan has no new warnings.

## Self-Review

- Spec coverage: Stage 1 covers LP replacement everywhere `CDSpinArtwork` is currently used. Stage 2 covers share toggle, turntable view, playback start/stop/coast, and component separation.
- Placeholder scan: no placeholder markers or unnamed implementation steps are intentionally left.
- Type consistency: `VinylRecord`, `Turntable`, `VinylSpinState`, and share view state are named once and reused through later tasks.

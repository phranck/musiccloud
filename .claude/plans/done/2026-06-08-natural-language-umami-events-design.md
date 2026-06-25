# Design: Natural-Language Umami Events

Plan-Nr.: MC-032
Status: Draft
Created: 2026-06-08
Owner: Claude
Vorgänger: MC-027 (`.codex/plans/open/2026-06-06-umami-custom-signals-plan.md`)

## Ziel

Die heutigen acht generischen `music_*`-Events in Umami werden durch eine Liste menschenlesbarer Event-Namen ersetzt. Pro UI-Aktion ein eigener Event-Name in der Form `Group: Detail`. Der Drilldown über Properties entfällt — der Event-Name trägt die Bedeutung. Lokales Tracking ist hart abschaltbar.

## Ausgangslage

- MC-027 hat acht generische Umami-Events eingeführt (`music_search_submitted`, `music_resolve_started`, `music_resolve_failed`, `music_source_search_success`, `music_interaction`, `music_service_link_click`, `music_preview_interaction`, `music_share_interaction`).
- Jeder Event trägt seine echte Bedeutung in Properties (`action`, `surface`, `flow`, `failure_kind`). In der Umami-Events-Übersicht steht damit z.B. nur `music_interaction (71)` — was tatsächlich passiert ist, sieht man erst im Property-Drilldown.
- Lokales Tracking ist heute nicht zuverlässig deaktiviert. Das Toggle `TRACKING_ENABLED` gate't nur den Script-Inject (default `"true"`), und die Default-Behavior in `.env.local` ist „sendet". Dev-Events laufen damit in die Produktions-Statistik.

## Zielbild

### Naming-Konvention

Format: `Group: Detail` (Title Case, Doppelpunkt-Separator).

- "clicked" am Ende weglassen, wenn es das einzige sinnvolle Verb wäre.
- Andere Verben (`started`, `paused`, `completed`, `failed`, `submitted`) bleiben.
- Detail-Payload (Sprache, Display-Modus, Fehler-Reason) entweder direkt im Detail-Teil (`Language: German`) oder als Klammer-Suffix (`Resolve: failed (Client)`) — Klammern nur, wenn das Verb auch Teil des Namens ist.

### Vollständiges Mapping

Heute (links) → Neu (rechts). Spalte "Quelle" referenziert die Callsite.

| Gruppe | Heute | Neu | Quelle |
|---|---|---|---|
| **Preview** | `music_preview_interaction action=play` (first) | `Preview: Started` | `AudioPreviewPlayer.tsx:1095` |
| | `music_preview_interaction action=resume` | `Preview: Resumed` | `AudioPreviewPlayer.tsx:1095` |
| | `music_preview_interaction action=pause` | `Preview: Paused` | `AudioPreviewPlayer.tsx:1138` |
| | `music_preview_interaction action=ended` | `Preview: Finished` | `AudioPreviewPlayer.tsx:957` |
| | `music_preview_interaction action=error` | `Preview: Error` | `AudioPreviewPlayer.tsx:966, 1127` |
| | `music_preview_interaction action=unavailable` | `Preview: Unavailable` | `AudioPreviewPlayer.tsx:502, 512` |
| **Service** | `music_service_link_click` (alle) | `Service: Spotify` / `Service: Apple Music` / `Service: YouTube Music` / `Service: Deezer` / `Service: Tidal` / `Service: Amazon Music` / `Service: Bandcamp` (pro Service-Slug humanized) | `PlatformButton.tsx:73` |
| **Share** | `music_share_interaction action=copy_success` | `Share: Link Copied` | `ShareButton.tsx:39` |
| | `music_share_interaction action=copy_error` | `Share: Link Copy Failed` | `ShareButton.tsx:46` |
| | `music_share_interaction action=share_success` | `Share: Native Completed` | `ShareButton.tsx:63` |
| | `music_share_interaction action=share_cancelled` | `Share: Native Cancelled` | `ShareButton.tsx:69` |
| | (neu) | `Share: Native Button` | ShareButton-Open-Click (sofern getrackt werden soll) |
| **Display** | (neu) | `Display: Analyzer` / `Display: VU Meter` | `analyzerMode.ts` Toggle |
| **Language** | (neu) | `Language: German` / `Language: English` (pro `i18n.locale`) | `i18n`-Switcher |
| **Genre** | (neu) `Genre: Overview` | `Genre: Overview` (Eingabe `?`) | useAppState Genre-Branch |
| | `music_interaction action=genre_result_selected` | `Genre: Ambient` / `Genre: House` / ... (pro Genre-Key, humanized) | `useAppState.ts:229` |
| **Info** | `music_interaction action=info_page_clicked` | `Info: About Site` / `Info: Imprint` / `Info: Help` / ... (pro `pageSlug` humanized) | `ShareLayout.tsx:507`, `navSignals.ts:21` |
| | `music_interaction action=help_page_clicked` | `Info: Help` | `navSignals.ts:11` |
| | `music_interaction action=content_page_clicked` | `Info: {Slug humanized}` | `navSignals.ts:21` |
| **Card** | `music_interaction action=popular_track_clicked` | `Card: Popular Track` | `PopularTracksSection.tsx:69` |
| | `music_interaction action=similar_artist_clicked` | `Card: Similar Artist` | (sofern gerendert) |
| | `music_interaction action=upcoming_event_clicked` | `Card: Upcoming Event` | `UpcomingEventsSection.tsx:28` |
| | `music_interaction action=disambiguation_candidate_selected` | `Card: Disambiguation Candidate` | `useAppState.ts:178` |
| | `music_interaction action=live_example_clicked` | `Card: Live Example` | `LandingPage.tsx:128` |
| **Footer** | `music_interaction action=layered_footer_clicked` | `Footer: Layered Logo` | `AppFooter.tsx:62` |
| **Nav** | `music_interaction action=external_nav_clicked` | `Nav: External` (generisch, kein Label-Splitting) | `navSignals.ts:22` |
| **Search** | `music_search_submitted` | `Search: Submitted` | `useAppState.ts:94` |
| **Resolve** | `music_source_search_success` (alle Flows) | `Resolve: Completed` | `useAppState.ts:125, 134, 143, 160, 203, 253` |
| | `music_resolve_failed failure_kind=client_error` | `Resolve: Failed (Client)` | `useAppState.ts:310`, `PopularTracksSection.tsx:87` |
| | `music_resolve_failed failure_kind=unknown_error` | `Resolve: Failed (Unknown)` | `useAppState.ts:310` |
| | `music_resolve_started` (alle Flows) | (entfällt — wird nicht mehr getrackt) | mehrere |

**Resolve-started entfällt**, weil bereits `Search: submitted` den Start des Funnels markiert und `Resolve: completed` / `Resolve: failed` den Ausgang. Der Zwischenschritt liefert keine zusätzliche analytische Aussage.

### Helper-API

`apps/frontend/src/lib/analytics/umami.ts` wird umgebaut. Statt der heutigen `MusicSignalEvent`-Union plus generic-properties-Argument:

```ts
// Statische Events: Konstanten-Namespaces im PascalCase-PascalCase-Pattern.
export const PreviewSignal = {
  Started: "Preview: Started",
  Resumed: "Preview: Resumed",
  Paused: "Preview: Paused",
  Finished: "Preview: Finished",
  Error: "Preview: Error",
  Unavailable: "Preview: Unavailable",
} as const;

export const ShareSignal = {
  LinkCopied: "Share: Link Copied",
  LinkCopyFailed: "Share: Link Copy Failed",
  NativeButton: "Share: Native Button",
  NativeCompleted: "Share: Native Completed",
  NativeCancelled: "Share: Native Cancelled",
} as const;

export const DisplaySignal = {
  Analyzer: "Display: Analyzer",
  VuMeter: "Display: VU Meter",
} as const;

export const SearchSignal = {
  Submitted: "Search: Submitted",
} as const;

export const ResolveSignal = {
  Completed: "Resolve: Completed",
  FailedClient: "Resolve: Failed (Client)",
  FailedUnknown: "Resolve: Failed (Unknown)",
} as const;

export const CardSignal = {
  PopularTrack: "Card: Popular Track",
  SimilarArtist: "Card: Similar Artist",
  UpcomingEvent: "Card: Upcoming Event",
  DisambiguationCandidate: "Card: Disambiguation Candidate",
  LiveExample: "Card: Live Example",
} as const;

export const FooterSignal = {
  LayeredLogo: "Footer: Layered Logo",
} as const;

export const NavSignal = {
  External: "Nav: External",
} as const;

export const GenreSignal = {
  Overview: "Genre: Overview",
} as const;

// Generators für dynamische Detail-Werte.
export function serviceSignal(serviceKey: string): string;
export function languageSignal(locale: string): string;
export function genreSignal(genreKey: string): string;
export function infoPageSignal(pageSlug: string): string;
```

Generator-Verhalten:

- `serviceSignal("apple_music")` → `"Service: Apple Music"`. Mapping erfolgt durch generisches `humanizeKey(key)` (Underscore zu Space, Title Case), keine kuratierte Map. Wenn das Backend einen Service-Key hinzufügt, taucht der humanized in Umami auf — ohne Frontend-Änderung.
- `languageSignal("de")` → `"Language: German"`. Hier ist die Locale-Liste klein und stabil; ein internes Mini-Mapping (`de` → `German`, `en` → `English`) ist akzeptabel, weil `humanizeKey("de")` nicht das gewünschte Resultat liefert.
- `genreSignal("acid_house")` → `"Genre: Acid House"`. Generisches `humanizeKey`.
- `infoPageSignal("imprint")` → `"Info: Imprint"`. Generisches `humanizeKey`.

`sendMusicSignal(name: string)` bleibt der einzige Sender. Properties-Argument wird ersatzlos entfernt. Privacy: der Event-Name ist das einzige Datum, das übermittelt wird.

### Suppression im Dev

`isTrackingEnabled()` (heute `apps/frontend/src/api/client.ts:160`) behält den Default `true`. Damit funktioniert Prod auch ohne explizites Env-Set. Lokal ist `TRACKING_ENABLED=false` in `apps/frontend/.env.local` Pflicht und wird im Setup-Doc verankert.

Zusätzlich: `sendMusicSignal` greift `isTrackingEnabled()` direkt am Anfang ab und returnt früh, falls `false`. Das gate't nicht nur das Script-Inject (wie heute) sondern auch jeden einzelnen Call. Belt & Suspenders gegen den Fall „Script doch geladen, aber Tracking soll aus".

```ts
export function sendMusicSignal(name: string): void {
  if (!isTrackingEnabled()) return;
  if (typeof window === "undefined") return;
  const umami = window.umami;
  if (!umami || typeof umami.track !== "function") return;
  try {
    void umami.track(name);
  } catch {
    // Analytics never affects the product flow.
  }
}
```

### Migration

Hard cut in einem Commit, keine Parallel-Phase. Alte Event-Namen verschwinden komplett aus dem Code; die historischen Daten in Umami werden durch Time-Range-Einschränkung ausgeblendet, nicht gelöscht.

Betroffene Files:

1. `apps/frontend/src/lib/analytics/umami.ts` — komplettes Rewrite: alte Enums (`MusicInteractionAction`, `MusicInteractionSurface`, `MusicResolveFlow`, `MusicResolveFailureKind`) und alter `MusicSignalEvent`-Type entfernen. Neue Konstanten + Generators einführen. `sendMusicSignal`-Signatur ändern.
2. `apps/frontend/src/lib/analytics/navSignals.ts` — neu schreiben: direkt `Nav: External` oder `Info: {Slug}`.
3. Acht Callsite-Files: `LandingPage.tsx`, `AppFooter.tsx`, `PlatformButton.tsx`, `UpcomingEventsSection.tsx`, `AudioPreviewPlayer.tsx`, `PopularTracksSection.tsx`, `ShareLayout.tsx`, `ShareButton.tsx`, `useAppState.ts`.
4. Neue Callsites: Language-Switcher (Locale-Wechsel), Display-Toggle (`analyzerMode.ts`), Genre-Search-Overview-Handler.
5. `apps/frontend/.env.local` ergänzen um `TRACKING_ENABLED=false`.
6. README / Setup-Notes: lokales Env explizit dokumentieren.

### Privacy

Bleibt restriktiv. Keine rohen Suchbegriffe, keine Track-IDs, keine MBIDs, keine `pageSlug`-Werte als Properties. Nur der Event-Name, und der ist statisch oder aus einem endlichen, dem Frontend bekannten Set (Service-Keys, Locales, Genre-Keys, Slugs) abgeleitet.

## Akzeptanzkriterien

- Keine alten Event-Namen (`music_*`) mehr im Code (`grep -rn "music_" apps/frontend/src/lib/analytics apps/frontend/src/components apps/frontend/src/hooks` ergibt nur die neuen Helper-File-internen Referenzen).
- Keine alten Enums (`MusicInteractionAction`, `MusicInteractionSurface`, `MusicResolveFlow`, `MusicResolveFailureKind`) mehr im Code.
- `sendMusicSignal` akzeptiert nur noch einen `string`-Parameter (Event-Name), kein Properties-Argument.
- In `apps/frontend/.env.local` steht `TRACKING_ENABLED=false`.
- Lokaler Smoke-Test: alle UI-Aktionen ausführen, in Browser-DevTools → Network → keine Requests an `${UMAMI_URL}/api/send`.
- Production Smoke-Test (nach Deploy, mit `TRACKING_ENABLED=true` in Zerops): UI-Aktionen ausführen → entsprechende neue Event-Namen erscheinen in Umami Events-Liste.
- Typecheck, Biome, React Doctor diff grün.

## Verifizierte Fakten

- `apps/frontend/src/lib/analytics/umami.ts`: gelesen, enthält die heute exportierten Konstanten und `sendMusicSignal`.
- `apps/frontend/src/lib/analytics/navSignals.ts`: gelesen, Nav-Slug-zu-Action-Mapping verstanden.
- `apps/frontend/src/api/client.ts:160`: `isTrackingEnabled()` mit Default `"true"` bestätigt.
- `apps/frontend/src/layouts/BaseLayout.astro:57`: `trackingEnabled` gate't den Script-Inject.
- `apps/backend/.env.local`: enthält Umami-Host und Website-ID.
- Callsite-Inventar (acht Files, oben tabelliert): per `grep -rn "sendMusicSignal" apps/frontend/src --include="*.ts" --include="*.tsx"` ermittelt.
- `MC-027` liegt unter `.codex/plans/done/2026-06-06-umami-custom-signals-plan.md`.

## Offene Punkte

- Welche Locales tatsächlich aktiv? `i18n/translations`-Inhalt prüfen, bevor `languageSignal()` implementiert wird.
- Genre-Key-Format aus dem Backend: kommen Underscores oder Hyphens? `humanizeKey()` muss beide tolerieren.
- Existiert bereits ein zentraler Hook fürs Language-Switch, oder muss der Tracking-Call neu eingefädelt werden?
- Display-Toggle: aktuell triggert das Spectrum-/VU-Umschalten über `analyzerMode.ts` (window-keydown). Soll der Tracking-Call dort sitzen oder im Player-Component?

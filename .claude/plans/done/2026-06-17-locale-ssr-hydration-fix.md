# Locale-SSR-Hydration-Fix

Plan-Nr.: MC-040

## Preface

Die Landing-Page loggt zwei React-„Hydration failed"-Fehler: der Server SSRt UI-Texte
auf Englisch, der Client hydratisiert auf Deutsch. Ursache: die Islands bekommen kein
`initialLocale`, also läuft `detectLocale()` (`i18n/locales.ts:12`) server-seitig
(→ "en", keine Browser-APIs) vs. client-seitig (→ "de", `navigator.language`). Die
Share-Seite macht es bereits richtig (`ShareLayout` bekommt `initialLocale`), die
Landing-Islands nicht. Zusätzlich bestimmen alle Astro-Pages die Locale nur aus dem
Cookie (`getLocaleFromCookie`), nicht aus Accept-Language — beim Erstbesuch (kein
Cookie) ergibt das "en", obwohl der deutsche Browser "de" will.

## Ziel

Server und Client rendern dieselbe Locale → keine Hydration-Mismatch-Fehler, und
deutsche Browser bekommen beim Erstbesuch Deutsch (Accept-Language). Verhalten der
Share-Seite unverändert.

## Design

1. **Server-Locale-Detection erweitern** (`i18n/locales.ts`): neue reine Funktion
   `getRequestLocale(cookieValue, acceptLanguage)` = Cookie (falls gesetzt) → sonst
   erste unterstützte Sprache aus Accept-Language → sonst `DEFAULT_LOCALE`. Spiegelt
   die Client-Reihenfolge in `detectLocale` (Cookie → `navigator.language` → en).
2. **`initialLocale` an alle Landing-Islands durchreichen** (Muster wie `ShareLayout`):
   - `PageHeaderIsland`, `AppFooterIsland`, `PageOverlayIsland`, `LandingPage` bekommen
     je eine optionale `initialLocale?: Locale`-Prop, die an ihren `LocaleProvider`
     geht.
   - Astro-Seiten berechnen die Request-Locale und übergeben sie:
     - `BaseLayout.astro` → `PageHeaderIsland`.
     - `index.astro` → `LandingPage` + `PageOverlayIsland`.
     - `[shortId].astro` → `PageOverlayIsland` (+ `ShareLayout` von `getLocaleFromCookie`
       auf `getRequestLocale` umstellen).
     - `DeferredFooter.astro` (server:defer) → `AppFooterIsland`.
3. Da bei gesetztem `initialLocale` der Provider-Persist-Effekt früh returnt
   (`context.tsx:42`), bleibt das Cookie-Setzen dem `LanguageSwitcher` (`setLocale`)
   überlassen — Erstbesuche deckt Accept-Language serverseitig ab.

## Implementation

1. `i18n/locales.ts`: `parseAcceptLanguage` + `getRequestLocale`.
2. `PageHeaderIsland.tsx` / `AppFooterIsland.tsx` / `PageOverlayIsland.tsx` /
   `LandingPage.tsx`: `initialLocale`-Prop → `LocaleProvider initialLocale={...}`.
3. `BaseLayout.astro`: `headerLocale` via `getRequestLocale(cookie, accept-language)`,
   `initialLocale={headerLocale}` an `PageHeaderIsland`; `lang`-Default bleibt.
4. `index.astro`: `locale` via `getRequestLocale`, `initialLocale` an `LandingPage` +
   `PageOverlayIsland`.
5. `[shortId].astro`: `locale` via `getRequestLocale`, `initialLocale` an
   `PageOverlayIsland`; `ShareLayout initialLocale={locale}` bleibt (Wert jetzt aus
   `getRequestLocale`).
6. `DeferredFooter.astro`: `locale` via `getRequestLocale`, `initialLocale` an
   `AppFooterIsland`.
7. Verifikation im Browser (Chrome): Konsole frei von Hydration-Fehlern; DE- und
   EN-Locale testen (Cookie + Accept-Language).
8. Gates: `astro check`, `pnpm lint`, `pnpm doctor:diff`, Vitest (i18n-/Island-Tests).

## Verified facts

- [x] `detectLocale()` server→"en", client→localStorage/Cookie/`navigator` —
  `i18n/locales.ts:12-19`. `getLocaleFromCookie` Cookie-only — `:21-24`.
- [x] `LocaleProvider` nutzt `initialLocaleProp ?? detectLocale()`; Persist-Effekt
  returnt bei gesetztem `initialLocale` — `i18n/context.tsx:38,42`.
- [x] Mountpunkte ohne `initialLocale`: `LandingPage.tsx:479`, `AppFooterIsland.tsx:18`,
  `PageOverlayIsland.tsx:185`, `PageHeaderIsland.tsx:18`. Mit: `ShareLayout.tsx:385`.
- [x] Astro-Wrapper + heutige Cookie-Locale: `BaseLayout.astro:33,134`,
  `index.astro:9,67,73`, `[shortId].astro:44,164,185,222`, `DeferredFooter.astro:14,19`.
- [x] `output: "server"` + Node-Adapter → SSR, Accept-Language verfügbar —
  `astro.config.mjs`. `[shortId].astro` `prerender = false`.
- [x] `LOCALES`, `DEFAULT_LOCALE`, `isLocale`, `Locale` aus `@musiccloud/shared` via
  `i18n/locales.ts:1`.

## Checklist

- [x] Alle Code-Referenzen verifiziert (Funktionen, Props, Pfade) — s.o.
- [x] `getRequestLocale` (Cookie → Accept-Language → Default) + `parseAcceptLanguage`
  in `locales.ts`; toter `getLocaleFromCookie` entfernt.
- [x] `initialLocale`-Prop an PageHeaderIsland / AppFooterIsland / PageOverlayIsland /
  LandingPage → jeweils `LocaleProvider`.
- [x] Astro-Wrapper (BaseLayout, index, [shortId], DeferredFooter, DeferredShareContent)
  berechnen Request-Locale + übergeben `initialLocale`; `DeferredFooter` nimmt die
  Page-Locale zusätzlich als Prop (server:defer-Sicherheit).
- [x] Browser (Chrome): keine Hydration-Fehler mehr in der Konsole — EN (Accept-Language,
  kein Cookie) rendert Englisch, DE (Cookie) rendert Deutsch, beide ohne Mismatch.
- [x] Gates grün: `astro check` (0 errors), `pnpm lint`, `pnpm doctor:diff` (0 issues),
  Frontend-Vitest 143 passed.

## Completed

Umgesetzt + verifiziert am 2026-06-17. Noch nicht committet (User entscheidet).

Geänderte Files: `i18n/locales.ts` (`getRequestLocale`/`parseAcceptLanguage`,
`getLocaleFromCookie` entfernt), `PageHeaderIsland.tsx`, `AppFooterIsland.tsx`,
`PageOverlayIsland.tsx`, `LandingPage.tsx` (je `initialLocale`-Prop → `LocaleProvider`),
`BaseLayout.astro`, `index.astro`, `[shortId].astro`, `DeferredFooter.astro`,
`DeferredShareContent.astro` (Request-Locale + `initialLocale` durchgereicht). `ShareLayout`
war bereits korrekt. 404 nutzt den `DeferredFooter`-Fallback (kein Locale-Prop nötig).

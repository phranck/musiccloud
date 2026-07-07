# Developer-Portal: Icon-Migration Phosphor → Iconsax (TwoTone, Rounded)

Plan-Nr.: MC-103

## Preface / Kontext

User-Anweisung 2026-07-06: Alle Icons im Developer-Portal (`apps/developer`) auf **Iconsax, Twotone, Free, Rounded** umstellen (https://app.iconsax.io/?style=twotone&corner=Rounded). Das npm-Paket `iconsax-react@0.0.8` liefert genau dieses Set (das Standard-Iconsax-Free-Set ist das Rounded-Design; `variant="TwoTone"`).

**Bewusste Ausnahme von der globalen Phosphor-only-Regel** (`~/.claude/rules/icons.md`): Der User (Autor der Regel) ordnet die Umstellung explizit an — sie gilt **nur für `apps/developer`**; Frontend/Dashboard bleiben Phosphor. Wird in der Projekt-Memory dokumentiert.

**Brand-Ausnahme:** Iconsax (Free) enthält keine Marken-Logos → `GithubLogoIcon` (GitHubButton) bleibt Phosphor; `@phosphor-icons/react` bleibt dafür als Dependency.

## Design

- Neuer DRY-Wrapper **`apps/developer/src/lib/icons.tsx`**: bindet pro verwendetem Icon `variant="TwoTone"` + `color="currentColor"` (iconsax-react hat KEINEN color-Default — ohne wären die Icons unsichtbar) und re-exportiert unter `<Name>Icon`. Call-Sites setzen nur noch `className` (+`aria-*`); Größen weiterhin via `size-*`-Utilities.
- `astro.config.mjs` `optimizeDeps.include`: + `"iconsax-react"` (Phosphor-Eintrag bleibt für den GitHub-Button).
- Alle 15 icon-führenden Dateien umstellen (Imports auf `@/lib/icons`, Tags/Props anpassen, `weight="duotone"` entfällt).

### Icon-Mapping (Exportnamen gegen `iconsax-react` d.ts verifiziert)

| Phosphor | Iconsax | Einsatz |
|---|---|---|
| KeyIcon | `Key` | überall |
| ArrowLeftIcon | `ArrowLeft` | Back-Buttons |
| CircleNotchIcon (Spinner) | `Refresh` (+ bestehendes `animate-spin`) | Submit/Verify/Logout |
| CheckCircleIcon | `TickCircle` | Commitments, verified |
| CheckIcon | `TickCircle` | Copy-Feedback |
| LinkIcon | `Link` | Features/Docs |
| WarningCircleIcon | `Warning2` | AuthStatus, unverified |
| BookOpenIcon | `Book` | Docs |
| BookIcon | `Book1` | Landing |
| XIcon | `CloseCircle` | Copy-Fehlschlag |
| VinylRecordIcon | `Cd` | CC-Feature |
| UserPlusIcon | `ProfileAdd` | Docs-Step |
| UserIcon | `Profile` | Avatar-Fallback |
| UserCircleIcon | `ProfileCircle` | Artist-Feature |
| TerminalWindowIcon | `CommandSquare` | API-Referenz |
| SquaresFourIcon | `Category` | AvatarMenu Dashboard |
| SignOutIcon | `Logout` | AvatarMenu Logout |
| ShieldCheckIcon | `ShieldTick` | Privacy |
| ScrollIcon | `Scroll` | Terms |
| ProhibitIcon | `Forbidden` | Key deaktivieren |
| PlusIcon | `Add` | Token erstellen |
| PlugsConnectedIcon | `Flash` | Docs-Step „Request access" |
| PaperPlaneTiltIcon | `Send2` | Antrag senden |
| HandshakeIcon | `Like1` | Pricing-Hero (kein Handshake im Set) |
| CurrencyEurIcon | `Coin` | Free-Badge (kein Euro-Icon im Set) |
| GlobeIcon | `Global` | Base URL |
| EnvelopeSimpleIcon | `Sms` | AuthStatus Mail |
| CopyIcon | `Copy` | Token kopieren |
| ChartLineIcon | `Diagram` | Usage |
| BracketsCurlyIcon | `Code` | JSON |
| ArrowsClockwiseIcon | `Refresh2` | Token rotieren |
| GithubLogoIcon | — bleibt Phosphor | GitHubButton (Brand) |

## Verified facts (2026-07-06)

- `iconsax-react@0.0.8` installiert (pnpm, apps/developer); `IconProps extends SVGAttributes<SVGElement>` mit `variant/color/size`; `rest` (inkl. className/aria) wird aufs `<svg>` gespreadet; **kein color-Default** (Add.js gelesen: `stroke: color` roh); 993 Exporte; alle Mapping-Ziele per `grep -cxE` = 29/29 vorhanden (+ `Profile`, `Warning2` einzeln geprüft).
- Icon-Inventar: 32 Phosphor-Namen über 15 Dateien (grep-Zählung dokumentiert); `astro.config.mjs:25` optimizeDeps `["@phosphor-icons/react"]`.
- `plans next` = MC-103.

## Nachtrag 2026-07-06 (User-Anweisungen nach der Migration)

1. **TwoTone dimmed Layer kaum sichtbar** → Wrapper vergibt jetzt die Klasse `mc-icon`; `global.css` (`@layer components`) hebt `.mc-icon path[opacity]` von hardcoded `.4` auf `0.65` (DevTools-verifiziert: computed 0.65).
2. **Fonts auf Barlow** → `fonts.css` lädt `@fontsource/barlow` 400/500/700 + `@fontsource/barlow-condensed` 500/600/700 (roboto-condensed als Dependency entfernt); `--font-condensed` = "Barlow Condensed"; neue `@layer base`-Regel: alle `h1`–`h6` laufen in `var(--font-condensed)`, Body bleibt Barlow (DevTools-verifiziert).
3. **Em-Dash-Verbot** → kompletter Sweep über `apps/developer/src` (88 Stellen, 39 Dateien): alle UI-Strings, TSDoc und Kommentare als vollständige Sätze umformuliert (Punkt/Semikolon/Doppelpunkt statt „—"); Pricing-H1 neu „Honest and upfront pricing"; Dashboard-planLabel-Fallback „—" → „None". `grep "—" apps/developer/src` = 0. Memory `feedback_no_emdash_in_content` angelegt.

## Checklist

- [x] `lib/icons.tsx` (TwoTone/currentColor-Wrapper, TSDoc; inkl. Coin für den Euro-Ersatz)
- [x] astro.config optimizeDeps + iconsax-react (Kommentar aktualisiert)
- [x] Alle Dateien umgestellt — einziger verbleibender Phosphor-Import ist der dokumentierte GitHub-Button (grep = 1)
- [x] GitHub-Button-Ausnahme dokumentiert (Kommentar)
- [x] Projekt-Memory `portal-iconsax-exception` + MEMORY.md-Index
- [x] Gates grün: astro check 0/0/0, lint 979, doctor 0; DevTools-Sichtprüfung Landing + Pricing (TwoTone-Icons sichtbar, Server mit frischem .vite-Cache neugestartet)
- [x] Nachtrag 1: `mc-icon`-Klasse + Opacity-Override 0.65 (DevTools computed verifiziert)
- [x] Nachtrag 2: Barlow/Barlow-Condensed via fontsource, h1–h6 = Condensed (DevTools computed verifiziert)
- [x] Nachtrag 3: Em-Dash-Sweep `apps/developer/src` = 0 Treffer, Gates erneut grün
- [x] Nachtrag 4 (User-Befund „Icon zu hoch/Text zu tief bei H1"): Headings-Box auf sichtbare Glyphen getrimmt — `text-box: trim-both cap alphabetic` in der h1-h6-Regel (global.css). Root cause: Barlow Condensed reserviert 10px Descent in der em-Box, die Großbuchstaben kaum nutzen; Box-Mitte war exakt zentriert (Delta 0), Glyphen-Mitte aber 2,6px unter Icon-Mitte (Canvas-TextMetrics gemessen). Nach dem Trim: Icon vs. Glyphen-Box = 0px auf h1 und h3; progressive enhancement (ohne text-box-Support bleibt der Ist-Zustand)
- [x] Nachtrag 5 (User-Anweisung 2026-07-06): Iconsax-Variante von TwoTone auf **Bulk** umgestellt — betrifft öffentliches Portal und eingeloggten Developer-Dashboard-Bereich (beide ziehen aus `lib/icons.tsx`). Wrapper `twotone()` → `bulk()`, `IconVariant.Bulk`, TSDoc + displayName angepasst; alle Export-Namen unverändert (keine Call-Site-Änderung). Bulk nutzt denselben hardcoded `opacity=".4"`-Sekundärlayer wie TwoTone, daher greift die `.mc-icon path[opacity]`-Regel (0.65) weiter; global.css-Kommentar nachgezogen. DevTools-verifiziert: gefüllte Pfade (`fill: currentColor`), dimmed layer computed 0.65, astro check 0/0/0
- [x] Kleine logische Commits (lokal committet 2026-07-07)

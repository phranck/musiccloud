# Tiers: Iconsax-Icon pro Tier + Picker im Dashboard-Editor

Plan-Nr.: MC-105

## Preface / Kontext

User-Wunsch 2026-07-07: Jedes Tier bekommt ein Iconsax-Icon, das im Admin-Dashboard-Tier-Editor über einen Icon-Picker gewählt wird und in den Pricing-Cards des Developer-Portals erscheint. Picker-Umfang laut User-Entscheidung: **ca. 100 handverlesene Icons** (nicht der volle 993er-Katalog, keine winzige 30er-Liste). Default-Zuordnung für die bestehenden Tiers: Free=`Medal`, Club=`MedalStar`, Arena=`Cup`, Stadium=`Crown1`.

Baut auf MC-104 (priceYearly) und dem bestehenden Iconsax-Setup des Portals ([[portal-iconsax-exception]], Bulk-Variante, nur freies npm-Set).

## Design

- **Geteilte Icon-Liste**: `packages/shared/src/tier-icons.ts` — kuratiertes `as const`-Array von ~100 Iconsax-Namen (Kategorien: Rang/Award, Musik, Building/Venue, Abstrakt/Kategorie, Business, Natur/Element). Single source of truth für (a) Dashboard-Picker, (b) Backend-Validierung, (c) Portal-Anzeige. Nur Namen aus dem freien `iconsax-react`-Set (gegen d.ts verifiziert). Exportiert `TIER_ICONS` (Namen) und einen `TierIconName`-Typ.
- **DB**: neue Spalte `tiers.icon` (text, nullable) — hält den Iconsax-Namen oder `null` (kein Icon). Migration via `pnpm db:generate`, additiv. Backfill: Free→Medal, Club→MedalStar, Arena→Cup, Stadium→Crown1 (per Name-Match, `--> statement-breakpoint`).
- **Backend**: `Tier`/`TierCreateData`/`TierUpdateData` + `icon: string | null`; Adapter-Row-Mapping + INSERT/UPDATE; `admin-tiers.ts` validiert `icon` gegen `TIER_ICONS` (nur erlaubte Namen oder null); public `/api/v1/tiers` liefert es automatisch. Test: create/patch mit icon.
- **Dashboard**: `iconsax-react` als neue Dependency (bewusste Erweiterung der Iconsax-Ausnahme auf `apps/dashboard`, bisher Phosphor-only — begründet: der Picker MUSS die Iconsax-Motive zeigen). Neue `TierIconPicker`-Komponente (Grid der ~100 Icons als Bulk, currentColor, Klick wählt; aktuelle Auswahl markiert; optional Textfilter über die Namen). `TierResponse`/api-Picks + `icon`; `TierFormData` + Feld; `TierEditorPage`-Integration (Picker neben Color/Sort); Tabellen-Zelle zeigt das Icon; Messages DE+EN.
- **Portal**: `apps/developer` bindet die ~100 kuratierten Icons als Bulk in einer Map `tierIconComponents` (Muster `lib/icons.tsx`); `pricing.astro` rendert `tier.icon` in der Card (neben dem Farbpunkt/Namen). Fallback: kein Icon → nur Farbpunkt wie bisher.

## Verified facts (Plan-write-time 2026-07-07)

- `tiers`-Schema: `apps/backend/src/db/schemas/postgres.ts` — `color: text("color").notNull().default(...)`, `price/priceYearly: text(...)` nullable; `icon` fehlt (grep). Muster für additive nullable-text-Spalte vorhanden.
- Adapter `postgres-tiers.ts`: `TierRow`-Interface, `toTier()`, INSERT (jetzt 12 Spalten inkl. price_yearly), dynamisches UPDATE-Pattern. Kontrakt `tiers-repository.ts`.
- Admin-Route `admin-tiers.ts`: POST/PATCH-Validierung (HEX_COLOR_RE etc.); public `public-tiers.ts` = `listTiers()` 1:1.
- Dashboard `TierEditorPage.tsx`: TierFormData/EMPTY_FORM/toSubmitBody/OpenEdit-Mapping, Color-Feld (`type="color"`), Tabellen-Spalten (useTierColumns). `api.ts` TierResponse + create/updateTier-Picks. Messages `i18n/messages.ts` (Interface + DE ~925 + EN ~1650).
- `apps/dashboard` nutzt React 19.2.4 → `iconsax-react` kompatibel. Kein iconsax bisher (Phosphor-only).
- Portal `pricing.astro`: TierDto + Card-Markup (Farbpunkt + h3 Name); `lib/icons.tsx` Bulk-Wrapper-Muster.
- `packages/shared` (`@musiccloud/shared`): flache `src/*.ts`-Module + `index.ts`-Barrel. `iconsax-react` ist NICHT in shared (nur Namen als Strings dort, Komponenten in den Apps).
- `pnpm db:generate` = Root-Skript. `plans next` = MC-105.

## Checklist

- [x] `packages/shared/src/tier-icons.ts`: **256** kuratierte Iconsax-Namen (User-Anweisung 2026-07-07: aus 118 → 256) in 22 Themengruppen (`TIER_ICONS` + `TierIconName` + `isTierIconName`-Guard), alle gegen d.ts verifiziert, Krypto/Brands/Sternzeichen ausgeschlossen, im Barrel exportiert; shared baut sauber, Biome clean. Defaults (Medal/MedalStar/Cup/Crown1) enthalten
- [x] Schema + Migration: `tiers.icon` (text, nullable) via db:generate (0064) + Default-Backfill (Free=Medal, Club=MedalStar, Arena=Cup, Stadium=Crown1); lokal angewendet, im public-Endpoint verifiziert
- [x] Backend: Kontrakt (`Tier.icon`) + Adapter (Row/Mapping/INSERT/UPDATE) + Validierung gegen `isTierIconName` (POST+PATCH) + Test (create/patch, reject invalid); 15 admin-tiers-Tests grün, tsc 0
- [x] Dashboard: `iconsax-react`-Dependency; `TierIconPicker` (+ `TierIconGlyph`, inline-Panel mit Suche über 256 Bulk-Icons); `TierResponse.icon`, api-Picks, Messages DE+EN (`colIcon`/`iconPickerSearch`/`iconNone`), Form-State, Editor-Feld, Tabellen-Zelle (Icon statt Farbpunkt). tsc 0, Biome clean
- [x] Portal: `TierIcon.tsx` (dynamischer Bulk-Renderer per Name, `mc-icon`-Klasse) + Anzeige in Pricing-Cards (Icon in Tier-Farbe, Fallback = Farbpunkt); `TierDto.icon`. DevTools-verifiziert: 4 Cards mit Icons, dimmed 0.42
- [x] Memory `portal-iconsax-exception` erweitert (Iconsax jetzt auch in apps/dashboard, scoped nur auf den Tier-Picker; Dashboard-Chrome bleibt Phosphor)
- [x] Gates grün (tsc developer+dashboard+backend, lint 981, doctor 0, Backend-Tests) + DevTools-Verify: Pricing-Cards (Medal/MedalStar/Cup/Crown1 in Tier-Farbe) + Dashboard-Picker (257 Buttons/256 Icons, aktuelles markiert, Suche) inkl. Screenshots
- [x] Nachtrag (User-Mockup 2026-07-07, abgenommen): Pricing-Tier-Cards neu gestaltet — Medaille oben (Kreis in Tier-Farbe, ragt über den Card-Rand), Card-Inhalt zentriert (`items-center text-center`), Preis zentriert direkt über dem Subscribe-Button (`mt-auto`-Block, Button full-width in Tier-Farbe). Grid `pt-11` + `gap-y-16`. Monthly/Yearly-Crossfade beibehalten
- [x] Nachtrag 3 (User „Card-Hintergrund oben Lichtschein in Tier-Farbe"): `.tier-card` in global.css — radialer Glow (`radial-gradient` von oben-mitte, `color-mix(var(--tier), transparent 80%)`) als background-image über `bg-surface`, von der `border-radius` geclippt (kein overflow:hidden, damit die Medaille überhängen kann). `--tier` von der Medaille auf die Card gehoben, Medaille erbt es. DevTools-verifiziert: Glow aktiv, Vererbung greift; lint 981 clean
- [x] Nachtrag 2 (User „nicht nur farbige Kreisflächen, mach das schön!"): Medaille als echtes metallisches Badge — `.tier-medal`/`.tier-medal-face` in global.css, alle Töne per `color-mix` aus einem inline `--tier`. Zwei Schichten (erhabener Metallring + vertiefte innere Scheibe), Bevel via inset-Shadows, Glanzlicht (radial sheen), Drop-Shadow für Tiefe; Icon als geprägtes Metall (voll-weiß, drop-shadow, Bulk-Dimming in der Medaille auf 0.68). size-[4.5rem]. DevTools-verifiziert: color-mix rendert die Metalltöne, Schatten/Bevel aktiv; lint 981 clean. Free silbrig-blau, Club magenta, Arena bronze, Stadium gold
- [x] Kleine logische Commits (lokal committet 2026-07-07)

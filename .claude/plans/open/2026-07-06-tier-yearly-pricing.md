# Tiers: Jahrespreis + Currency-Formatting + Monthly/Yearly-Switch

Plan-Nr.: MC-104

## Preface / Kontext

User-Wunsch 2026-07-06: Die Preise auf der Pricing-Seite bekommen Currency-Formatting mit ausgewiesener Währung Euro. Über den Tier-Cards (rechts, auf Höhe der „Available tiers"-Headline) sitzt ein Switch zwischen monatlicher und jährlicher Zahlung. Dafür braucht jedes Tier einen Jahrespreis, den der Admin im Dashboard beim Anlegen/Bearbeiten pflegen kann — inkl. DB-Migration.

## Design

- **DB (additiv, kein Rename)**: `tiers.price` bleibt der Monatspreis (text, nullable). Neue Spalte `price_yearly` (text, nullable). Migration via `pnpm db:generate` (Root-Skript, drizzle-kit; DATABASE_URL-Dummy nötig, additive Spalte → kein Rename-Prompt).
- **Preis-Semantik**: Preise bleiben Strings mit numerischem Inhalt („9", „90"). Das Portal parsed `Number()` und formatiert per `Intl.NumberFormat("en", { style: "currency", currency: "EUR" })` (ganze Beträge ohne Nachkommastellen, sonst 2); nicht-numerische Altwerte rendern unverändert als Fallback.
- **Backend**: `Tier`/`TierCreateData`/`TierUpdateData` + `priceYearly`; Adapter-INSERT/UPDATE + Row-Mapping; public `GET /api/v1/tiers` liefert das Feld automatisch (SELECT *). Validierung wie `price` (Freitext, kein Constraint). Test: create + patch Roundtrip mit `priceYearly`.
- **Dashboard**: `TierResponse` + `priceYearly`; create/updateTier-Picks erweitert. TierFormDialog: Monats- und Jahrespreis nebeneinander (zwei Spalten), numerische Placeholder („9.90"). Tabellen-Preisspalte zeigt Monatspreis, Jahrespreis klein dahinter falls gesetzt. Neue Message-Keys `colPriceMonthly`/`colPriceYearly` (DE+EN).
- **Portal pricing.astro**: 
  - `formatEuro(raw)` Helper im Frontmatter (TSDoc), Anzeige „€9 / month" bzw. „€90 / year".
  - Billing-Switch als Segmented-Pill rechts der „Available tiers"-h2 (`flex justify-between`), Buttons Monthly/Yearly mit `aria-pressed`, Token-Styling (aktiv `bg-accent text-on-accent`).
  - SSR rendert beide Preis-Varianten pro Card übereinander (Grid-Stack); ein kleines `<script>` toggelt `data-billing` auf der Section, CSS blendet mit opacity-Transition (Animations-Regel) um.
  - Tier ohne Jahrespreis zeigt im Yearly-Modus weiter den Monatspreis samt „/ month"-Label (kein erfundener Preis); Free-Tiers (price null) zeigen „Free" in beiden Modi.

## Verified facts (Plan-write-time 2026-07-06, per Read/grep in dieser Session)

- `tiers`-Schema: `apps/backend/src/db/schemas/postgres.ts:1786-1807`, `price: text("price")` nullable; Checks nur auf requests-Spalten.
- Adapter: `apps/backend/src/db/adapters/postgres-tiers.ts` — `TierRow`-Interface, `toTier()`, INSERT mit 11 Spalten, dynamisches UPDATE-Feld-Pattern.
- Kontrakt: `apps/backend/src/db/tiers-repository.ts` — `Tier`/`TierCreateData`/`TierUpdateData` mit `price: string | null`.
- Admin-Routes: `apps/backend/src/routes/admin-tiers.ts` (POST/PATCH validieren name/limits/color/description/disableReason; price ungeprüfter Freitext). Tests: `admin-tiers.test.ts`.
- Public Route: `apps/backend/src/routes/public-tiers.ts` → `repo.listTiers()` 1:1.
- Dashboard: `apps/dashboard/src/features/developer/api.ts:140-195` (`TierResponse`, createTier/updateTier-Picks); `TierEditorPage.tsx` (TierFormData/EMPTY_FORM/toSubmitBody/OpenEdit-Mapping, Preis-Feld Z. 301-312, Preis-Spalte Z. 494-501).
- Messages: `apps/dashboard/src/i18n/messages.ts` — Interface Z. 200-215, DE Z. 925-940, EN Z. 1650-1665 (`colPrice` vorhanden).
- Portal: `apps/developer/src/pages/pricing.astro` — `TierDto` (price: string | null), Cards Z. 99-152, „Available tiers"-h2 Z. 101.
- `pnpm db:generate` = Root-Skript (package.json:24, drizzle-kit generate).
- `plans next` = MC-104.

## Checklist

- [x] Schema + Migration: `price_yearly` (text, nullable) via db:generate — `0063_chemical_bug.sql`, rein additiv, lokal angewendet (Backend-Restart)
- [x] Backend: Kontrakt + Adapter + Tests (create/patch mit priceYearly) — tsc 0, 46 Tests grün (admin-tiers + developer-auth)
- [x] Dashboard: TierResponse/api-Picks, Form-Felder Monats-/Jahrespreis (grid-cols-2, inputMode decimal), Tabellen-Zelle „9 / 90 p.a.", Messages DE+EN (`colPriceMonthly`/`colPriceYearly`)
- [x] Portal: formatEuro (Intl EUR en, ganze Beträge ohne Dezimalen) + Anzeige „€9 / month" / „€90 / year"; Tier ohne Jahrespreis zeigt im Yearly-Modus ehrlich den Monatspreis
- [x] Portal: Billing-Switch (Segmented-Pill rechts der h2, aria-pressed, data-mode) + Opacity-Crossfade der gestackten Preis-Spans (0.25s)
- [x] Gates grün (tsc Backend/Dashboard/Developer, lint 978, doctor 0, Backend-Tests 46) + DevTools-Verify: Monthly „€9/€29/€149 / month" → Klick → Yearly „€90/€290/€1,490 / year", aria-pressed toggelt, Screenshots Portal + Dashboard-Dialog; Jahrespreise lokal per Admin-PATCH gesetzt (Club 90, Arena 290, Stadium 1490)
- [x] Nachtrag (User-Anweisung): Tier-Namen in den Cards kleiner und Regular — h3 von `text-card-title font-semibold` (28px/600) auf `text-lead font-normal` (24px/400). DevTools-verifiziert: 24px / weight 400 / Barlow Condensed
- [x] Nachtrag 2 (User-Anweisung): Billing-Switch mit gleitendem Segment und flacher — absolut positionierter `.billing-thumb` (Accent, width 50% minus Innenpadding) rutscht per `transform: translateX(100%)` mit 0.25s-Transition (GPU-only, Animations-Regel) zwischen den gleich breiten Optionen (grid-cols-2); Buttons wechseln nur die Textfarbe; Höhe kompakter via `py-0.5` + `text-nav` (34px statt 42px). DevTools-verifiziert: mid-transition-Sample bei translateX 67px, Endlage deckt den Yearly-Button exakt
- [x] Kleine logische Commits (lokal committet 2026-07-07)

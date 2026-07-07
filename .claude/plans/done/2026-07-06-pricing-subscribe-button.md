# Pricing: Subscribe-Button pro Tier → Sign-Up mit Tier-Vorauswahl

Plan-Nr.: MC-101

## Preface / Kontext

User-Wunsch 2026-07-06: Jede Tier-Card auf der Pricing-Seite bekommt unten einen „Subscribe"-Button, der das Tier auswählt und zur Sign-Up-Seite wechselt. Baut auf MC-100 auf (`developer_accounts.tier_id`); der Signup weist das gewählte Tier direkt beim Anlegen zu (kein Billing — Tiers sind heute unbezahlte Definitionen, „Subscribe" = Tier-Zuweisung bei Registrierung).

## Ziel

1. Pricing-Card (nur **enablete** Tiers): „Subscribe"-Button → `/signup?tier=<id>`.
2. Signup-Seite: `tier`-Param server-seitig gegen `/api/v1/tiers` validieren (existiert + enabled); Hinweis „Signing up for the X tier" (mit Farb-Swatch) über dem Formular.
3. Signup-POST nimmt `tierId` mit; Backend validiert (enabled) und legt den Account mit `tier_id` an. Ungültiger/disableter Param wird **still ignoriert** (Signup scheitert nie an einem stale Link; Account startet dann ohne Tier).

## Design

- `apps/developer/src/pages/pricing.astro`: in der Card (flex-col) unten `mt-auto`-Button `Subscribe` (Stil des bestehenden `rounded-button bg-accent text-on-accent`-CTAs, full-width, `pt-2`-Abstand); nur wenn `tier.enabled`.
- `apps/developer/src/pages/signup.astro`: `Astro.url.searchParams.get("tier")`; SSR-Fetch `/api/v1/tiers` (Muster pricing.astro, try/catch, Fallback = kein Hinweis); nur enablete Treffer; `selectedTier` → Props an `SignupForm`.
- `apps/developer/src/components/auth/SignupForm.tsx`: neue optionale Props `tier?: { id: string; name: string; color: string }`; Hinweis-Zeile über den Feldern (Swatch + „Signing up for the **{name}** tier"); POST-Body `tierId: tier?.id`.
- `apps/backend/src/routes/developer-auth.ts` (signup): `body.tierId` optional; wenn gesetzt → `getTierRepository().listTiers()`-Lookup, nur `enabled` übernehmen, sonst ignorieren; `createDeveloperAccount({ …, tierId })`.
- `apps/backend/src/db/developer-repository.ts` + `adapters/postgres-developer.ts` + `adapters/postgres.ts` (Wiring): `createDeveloperAccount` um `tierId?: string | null`; INSERT um `tier_id`.
- Tests `developer-auth.test.ts`: signup mit gültigem tierId → `createDeveloperAccount` mit tierId aufgerufen; mit unbekanntem/disabled tierId → ohne tierId (null).

## Bewusste Grenze

Der GitHub-OAuth-Signup nimmt das Tier **nicht** mit (der `tier`-Param müsste durchs State-JWT des OAuth-Flows geschleust werden — eigener Change, falls gewünscht). Email/Passwort-Signup deckt den Subscribe-Flow ab; GitHub-Registrierungen starten ohne Tier (Admin weist zu).

## Verified facts (Plan-write-time 2026-07-06, per Read in dieser Session)

- pricing.astro: Card-Markup `flex flex-col gap-3` (Z. ~113), CTA-Stil `rounded-button bg-accent text-on-accent px-5 py-2.5` (Z. ~158-162), `tier.enabled`/`disableReason` im `TierDto`; SSR-Fetch-Muster mit try/catch.
- signup.astro: SSR (`prerender = false`), `getDeveloperSession`-Redirect, `<SignupForm client:load>` mit Children (GitHubButton/OrDivider).
- SignupForm.tsx: useReducer-State, POST via `postAuth(ENDPOINTS.dev.auth.signup, { email, password, displayName })` (Z. 130-134), Success-Panel ersetzt Form.
- Signup-Route: `developer-auth.ts` Z. 181ff (`body.email/password/displayName`, `createDeveloperAccount`); `getTierRepository` dort bereits importiert (MC-100 `/me`).
- `createDeveloperAccount`: Kontrakt `developer-repository.ts:115-120`; Adapter-INSERT `postgres-developer.ts` (id, email, password_hash, display_name, avatar_url, created_at, updated_at); Wiring `postgres.ts:1104-1109`.
- `plans next` = MC-101.

## Nachtrag 2026-07-06 (User-Anweisung, Pricing-Layout)

1. **Tiers alle nebeneinander**: Tier-Grid auf `lg:grid-flow-col lg:auto-cols-fr` (eine Reihe, gleiche Breiten, unabhängig von der Tier-Anzahl aus der DB); darunter weiter 1/2-spaltig responsive. DevTools-verifiziert: 4 Cards, gleiche `top`, je 232px.
2. **Subscribe in Tierfarbe**: `bg-accent` ersetzt durch `style="background-color:<tier.color>"` (Label bleibt `text-on-accent`); redundantes `pt-2.5` neben `py-2.5` entfernt. DevTools-verifiziert: computed background = Demo-Tierfarbe.
3. **h2 größer**: `--text-card-title` in global.css 1.25rem → 1.5rem (portalweites Token, trägt alle h2-Section- und Card-Titel). DevTools-verifiziert: h2 computed 24px.
4. **Content portalweit breiter** (Folge-Anweisung): Seitencontainer `max-w-5xl` → `max-w-6xl` (PublicHeader, Landing/Pricing main, alle Footer; deckt sich jetzt mit dem Dashboard-Shell 6xl) und Text-Seiten-main `max-w-3xl` → `max-w-4xl` (docs, docs/api, terms, privacy). Auth-Card (`max-w-md`) und Hero-Absatz (`max-w-2xl`) bewusst unverändert. DevTools-verifiziert: main/header/footer 1152px, Docs-main 896px.
5. **h2 noch größer** (Folge-Anweisung): `--text-card-title` 1.5rem → 1.75rem. DevTools-verifiziert: h2 computed 28px.
6. **Pricing-Feinschliff** (Folge-Anweisung): „Our commitment"-h2 aus der Card heraus über die Section gestellt (Muster „Available tiers"; Card-Styling jetzt auf der `ul`), und die beiden CTAs am Seitenende („Get started for free"/„Read the docs") entfernt — die Seite endet mit den Tier-Cards. DevTools-verifiziert.

## Checklist

- [x] pricing.astro: Subscribe-Button (nur enablete Tiers) → `/signup?tier=<id>` — browser-verifiziert
- [x] Nachtrag: Tiers einreihig (`lg:grid-flow-col lg:auto-cols-fr`), Subscribe in Tierfarbe, `--text-card-title` 1.5rem — DevTools-verifiziert, astro check 0/0/0
- [x] Nachtrag 4+5: Container 6xl/4xl portalweit, `--text-card-title` 1.75rem — DevTools-verifiziert (1152px/896px/28px), astro check 0/0/0
- [x] Nachtrag 6: Commitment-h2 außerhalb der Card + Seitenende-CTAs entfernt — DevTools-verifiziert, astro check 0/0/0
- [x] signup.astro: tier-Param + SSR-Validierung (existiert + enabled, Fallback plain) + Props
- [x] SignupForm: Tier-Hinweis (Swatch + Name) + tierId im POST
- [x] Backend signup: tierId validiert (enabled, sonst still ignoriert) → createDeveloperAccount
- [x] Repository/Adapter/Wiring: createDeveloperAccount mit tierId (INSERT tier_id)
- [x] Tests: signup mit valid tierId → zugewiesen; unknown/disabled → null (Backend 1353)
- [x] Gates grün: Typecheck 0, lint 978, doctor 0, Tests Backend 1353 / Frontend 313 / Dashboard 61; DevTools-Verify Pricing-Button + „Signing up for the Free tier."-Hinweis (stale .vite-Cache der developer-App zwischendurch per bekanntem Fix geräumt)
- [x] Kleine logische Commits (auf User-Freigabe)

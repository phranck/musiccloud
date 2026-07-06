# Portal-Header: Avatar-Menü für eingeloggte Developer + Nav-Umbau

Plan-Nr.: MC-102

## Preface / Kontext

User-Wunsch 2026-07-06: Besucht ein eingeloggter Developer die öffentlichen Portal-Seiten, erscheint sein Avatar im Header; Klick öffnet ein Menü mit „Dashboard", Trennlinie, „Logout". „Log in"/„Sign up" verschwinden dann. Zusätzlich Nav-Umbau: „Pricing" wandert vom Footer in die Top-Nav, „Status" verschwindet aus der Top-Nav (bleibt im Footer). Position per User-Korrektur: **rechts oben ganz außen** (ursprünglich links angefragt, dann revidiert).

**Deutung (dokumentiert):** Der Nav-Umbau (Pricing hoch, Status oben raus) gilt für beide Zustände (ein- und ausgeloggt) — Navigation bleibt konsistent; nur Avatar vs. Log in/Sign up hängt am Login-Status.

**Nachtrag im selben Zug:** `--text-body` des Portals 1rem → 1.125rem (Card-/Fließtexte portal-weit größer, dritter „größer"-Wunsch in Folge).

## Ziel

1. Neue shared **`PublicHeader.astro`** ersetzt die 6 duplizierten Seiten-Header (DRY): Logo, Nav (Docs, API reference, Pricing; aktiver Link hervorgehoben), ausgeloggt Log in/Sign up, eingeloggt Avatar-Menü links.
2. Neue Island **`AvatarMenu.tsx`**: Avatar-Button (Bild oder Initial-Fallback, Muster `DashboardLayout`), Popover-Menü „Dashboard" / Divider / „Logout" (POST `/api/dev/auth/logout` + hard navigate `/`, Muster `LogoutButton`); Outside-Click + Escape schließen.
3. `FOOTER_LINKS`: Pricing-Eintrag raus (Status bleibt unten).
4. Alle 6 öffentlichen Seiten resolven die Session (`getDeveloperSession`) und rendern `PublicHeader` (output ist `server`, SSR überall).

## Verified facts (Plan-write-time 2026-07-06, per Read/grep in dieser Session)

- Header identisch dupliziert in: `pages/index.astro`, `pages/docs/index.astro`, `pages/docs/api.astro`, `pages/pricing.astro`, `pages/privacy.astro`, `pages/terms.astro` (Logo-SVG + Nav Docs/API reference/Status/Log in/Sign up; aktive Seite via `text-fg`). `login.astro`/`AuthCard.astro` sind Auth-Shell, nicht betroffen.
- `astro.config.mjs`: `output: "server"` (Z. 7) — jede Seite SSR, Session-Check möglich.
- `FOOTER_LINKS` (`lib/footerLinks.ts`): Docs, Pricing, Terms, Privacy, Status(extern).
- `getDeveloperSession(Astro)` (`lib/session.ts:63`): `Account | null`, Felder inkl. `displayName/avatarUrl/email/tierName`.
- Avatar-Muster: `DashboardLayout.astro:36/53-67` (img 36px rund bzw. Initial-Fallback `size-9 rounded-full border border-border bg-surface`).
- Logout-Muster: `LogoutButton.tsx` (`postAuth(ENDPOINTS.dev.auth.logout, {})` + `window.location.href = "/"`, Spinner-Phase).
- `plans next` = MC-102.

## Checklist

- [x] `AvatarMenu.tsx` (Island): Avatar-Button + Menü (Dashboard / Divider / Logout), Outside-Click/Escape, a11y; neues Token `--color-surface-solid` für den opaken Popover-Grund
- [x] `PublicHeader.astro`: account/active-Props, Avatar rechts außen (nach der Nav; Popover rechtsbündig), Nav Docs/API/Pricing (aktiver Link hervorgehoben), ausgeloggt Log in/Sign up, kein Status
- [x] Nachtrag: `--text-body` 1rem → 1.125rem (Card-Texte 18px, DevTools-gemessen)
- [x] Nachtrag 2 (Konsistenz): Dashboard-Header nutzt dieselbe `AvatarMenu` (neues `showDashboard`-Prop; im Dashboard nur „Logout", kein Divider); Account-Block (Avatar+E-Mail+Sign-out-Button) ersetzt, `LogoutButton.tsx` entfernt (tot); verifiziert per echtem Login mit neuem lokalem Smoke-Dev-Account `claude-dev@local.test`
- [x] Nachtrag 3 (User-Anweisung 2026-07-06): „Sign up"-Button aus der Navbar entfernt — Sign-up erfolgt ausschließlich über die Tier-Auswahl auf /pricing (Subscribe-Flow MC-101); ausgeloggt bleibt nur „Log in"; TSDoc aktualisiert; DevTools-verifiziert im isolierten (ausgeloggten) Browser-Kontext: Nav = Docs/API reference/Pricing/Log in, kein `/signup`-Link im Header
- [x] Nachtrag 4 (User-Anweisung 2026-07-06): Wordmark-Umbau — Cloud-Icon entfernt; „musiccloud" rendert im Original-Regenbogen des Website-Banners (8 Stops aus `apps/frontend/public/img/musiccloud-banner-very-small.svg`, als `--gradient-logo-rainbow`-Token + `.text-logo-rainbow` mit `background-clip: text` — ein durchgehender Gradient als Maske, keine per-Buchstabe-Farben); Logo-Markup als shared `Wordmark.astro` extrahiert (PublicHeader + DashboardLayout, DRY); Footer-„Docs"-Link aus `FOOTER_LINKS` entfernt (Docs lebt in der Top-Nav). DevTools-verifiziert (computed background-image + backgroundClip:text, Footer = Terms/Privacy/Status, Dashboard-Header identisch)
- [x] Nachtrag 5 (User-Anweisung 2026-07-06): „musiccloud"-Schriftzug in beiden Headern größer + semibold — neues Token `--text-wordmark: 1.5rem`, Span `font-semibold`; Barlow 600 in fonts.css nachgeladen (war nicht im Bundle); Spans baseline-aligned statt items-center. DevTools-verifiziert: 24px / weight 600 / Barlow, `document.fonts` enthält Barlow 600
- [x] Nachtrag 6 (User-Anweisung 2026-07-06): Content-Breite portalweit vereinheitlicht — die vier Text-Seiten (docs, docs/api, terms, privacy) von `max-w-4xl` auf `max-w-6xl`; damit haben ALLE Seiten (Header, Main, Footer, Dashboard) dieselbe 1152px-Breite. SSR-verifiziert (alle vier mains = max-w-6xl) + live computed 1152px
- [x] Nachtrag 7 (User-Beschwerde Font-„Blitzen" bei Navigation): BaseLayout preloadet die sechs above-the-fold-Gewichte als woff2 (`?url`-Imports: Barlow 400/500/600/700, Barlow Condensed 500/600, mit `crossorigin`) — der Font-Fetch startet mit dem HTML statt nach der CSS-Kaskade, bei Navigation greift der Cache vor dem First Paint; BaseLayout hat jetzt einen @file-TSDoc. DevTools-verifiziert: 6 Preload-Links im Head, keine „unused preload"-Console-Warnungen
- [x] Nachtrag 7b (Blitzen bestand fort): Root cause war fontsource's hartkodiertes `font-display: swap` (erster Paint IMMER Fallback, Tausch danach = sichtbarer Sprung). Fix: fontsource-CSS abgelöst — `styles/fonts.css` gelöscht; BaseLayout generiert die sechs `@font-face`-Regeln selbst (inline `<style is:inline set:html>`) mit **`font-display: optional`** (kein Swap nach First Paint, Spec-garantiert) aus denselben `?url`-Imports wie die Preloads (kein URL-Mismatch/Doppel-Fetch möglich). Verifiziert: `document.fonts` alle display=optional; Immediate-Check direkt nach Navigation = Webfonts loaded vor First Paint; Netzwerk: jede woff2 exakt 1x (304 Cache); ungenutzte Gewichte bleiben „unloaded" bis eine Seite sie braucht
- [x] Nachtrag 8 (User-Anweisung 2026-07-06): AuthCard (Sign in/Sign up/Forgot/Reset/Verify) nutzt die shared `Wordmark` (Rainbow) statt des alten Icon+Text-Blocks; `Wordmark.astro` um optionale `class`-Prop erweitert (`justify-center mb-8` für die zentrierte Auth-Variante). DevTools-verifiziert auf /login: Rainbow-Gradient, zentriert, 24px/600, kein SVG-Icon
- [x] Nachtrag 9 (User-Anweisung 2026-07-06): Wordmark-Suffix umgebaut — „/ developers" → „/ developer" (Singular); Suffix jetzt in `--text-wordmark`-Größe (24px, wie „musiccloud"), `font-normal`, und heller: `text-fg-muted` statt `text-fg-subtle` (Slash eingeschlossen); überflüssiges `text-logo font-medium` vom Link entfernt (beide Spans setzen Größe/Gewicht selbst). DevTools-verifiziert: Suffix 24px/400/#9fb0bc — gilt automatisch für alle drei Einsatzorte (PublicHeader, Dashboard, AuthCard)
- [x] Nachtrag 10 (User-Anweisung 2026-07-06): Alle vier „Back to …"-Icon-Buttons entfernt (docs „Back to home", docs/api „Back to documentation", terms + privacy „Back to home") inkl. `ArrowLeftIcon`-Importe; toter `ArrowLeftIcon`-Export samt `ArrowLeft`-Import aus lib/icons.tsx entfernt; TSDoc der Placeholder-Seiten angepasst („and a link home" gestrichen). Die „Back to sign in"-Textlinks der Auth-Flows (forgot/reset/verify) bleiben bewusst — Flow-Navigation, keine Seiten-Back-Buttons. SSR-verifiziert: 0 „Back to home/documentation"-Treffer, „API reference"/„Create an account" auf /docs unverändert
- [x] 6 Seiten auf `PublicHeader` + Session-Resolve umgestellt (Header-Duplikate entfernt; „statically generated"-TSDoc der Docs-Seiten korrigiert)
- [x] `FOOTER_LINKS`: Pricing raus (Status bleibt unten)
- [x] Gates grün: astro check 0/0/0, lint 979, doctor full 0 Issues (alle 4 Projekte); Verify: SSR-curl (ausgeloggt Log in/Sign up + Pricing, eingeloggt Account menu ohne Login-Links) + DevTools eingeloggt (Avatar-Bild, Menü Dashboard/Divider/Logout, Logout-Roundtrip → `/`, Cookie weg, Login-Links zurück) via lokal signiertem Session-JWT
- [ ] Kleine logische Commits (auf User-Freigabe)

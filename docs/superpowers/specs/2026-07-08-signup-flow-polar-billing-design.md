# Signup-/Signin-Flow-Redesign + Polar-Billing (gated) — Design-Spec

Status: Design abgenommen — bereit für Plan-Split (A–E)
Erstellt: 2026-07-08

## Überblick

Der Signup-/Signin-Flow des Developer-Portals (`apps/developer`) wird neu gedacht, weil er heute inkonsistent ist und ein Sicherheitsloch hat: ein brandneuer Nutzer kann sich per GitHub „anmelden“, wird ohne Tier auto-angelegt und landet **ohne Subscription** im Dashboard. Gleichzeitig wird **Polar-Billing von Anfang an mitgebaut** (lokal gegen Sandbox), live aber mit **inaktiven Bezahl-Tiers** deployed und am „Tag X“ per Schalter scharf geschaltet.

Kernentscheidungen (abgenommen):

- **Gate-Bedeutung:** Jeder Account hat künftig immer genau einen Tier. „Ohne Subscription kein Signup“ heißt „einen Tier wählen ist Pflicht“ — **Free zählt als gültige Wahl.** Damit ist der Flow ohne Polar reparierbar; Bezahl-Tiers kommen obendrauf.
- **Billing:** **Polar** (polar.sh, Merchant of Record) wird jetzt gebaut, nicht mehr zurückgestellt. Entwicklung/Tests lokal gegen **Polar-Sandbox**. Prod-Deploy mit inaktiven Bezahl-Tiers („Coming soon“), Aktivierung per Schalter am Tag X.
- **Aktivierung:** **Globaler Master-Schalter** (der Tag-X-Flip) **plus** pro-Tier `enabled`.
- **UX-Priorität:** Der Nutzer bleibt **so lange wie möglich on-site.** Was via Polar-API abgedeckt werden kann, wird on-site gebaut; nur die harte PCI-Grenze (rohe Kartendaten) führt zu Polar-hosted.
- **Sicherheit ist First-Class:** Nichts darf den Flow brechen — keine URL-/Formular-Manipulation, keine unvorhergesehenen Zustände. Der Client wird nie vertraut.

Dieses Dokument ist die Design-/Entscheidungsgrundlage. Die Umsetzung wird nach der Plan-Size-Regel in fünf eigenständige Pläne (A–E) aufgeteilt (siehe „Plan-Split“). Plan-Nummern werden erst beim Plan-Schreiben via `plans next` vergeben.

## Ist-Zustand (verifiziert 2026-07-08)

- **Datenmodell:** Es gibt **keine** „Subscription“-Entität. Am `developer_accounts` hängt nur ein nullable `tierId` (FK → `tiers`, `onDelete: set null`) — `apps/backend/src/db/schemas/postgres.ts:1567`. Die `tiers`-Tabelle trägt `price`, `priceYearly` (`:1795`), `enabled` (default true, `:1800`), `recommended` (default false, `:1802`), `color`, `icon`, `disableReason` u.a. **Kein Polar-Feld.** Geseedet ist nur `tier_free`.
- **Der Bug:** Der GitHub-OAuth-Exchange legt den Account **ohne Tier** an — `repo.createDeveloperAccount({ email, displayName, avatarUrl })` ohne `tierId`, `apps/backend/src/routes/developer-github.ts:115`. Zum Vergleich übergibt der Email-Signup den Tier (`:229`), aber nur wenn `tier?.enabled` (`:207–211`), sonst wird er **still verworfen**.
- **Kein Gate:** `apps/developer/src/pages/dashboard/index.astro` prüft nur „Session ja/nein“ (Redirect `/login`), kein Tier-Check.
- **GitHub trägt keinen Tier:** `apps/developer/src/pages/auth/github.ts` kennt keinen Tier-Parameter; der Callback (`auth/github/callback.ts`) legt bei neuem Nutzer an.
- **Polar:** Im gesamten Code **nicht referenziert** (verifiziert per grep; nur Astronomie-Treffer „Polaris/polar screen“).
- **Pricing/Signup existieren teilweise passend:** `pricing.astro` rendert Tiers aus `GET /api/v1/tiers` und verlinkt aktive Tiers auf `/signup?tier=<id>`; `signup.astro` validiert `?tier=` server-seitig gegen aktive Tiers; `SignupForm.tsx` schickt `tierId`.

## Sektion 1 — Der Flow

**Grundprinzip:** Jeder Account hat immer genau einen Tier. „Tier-los“ ist nach dem Umbau nur noch ein Anomalie-Zustand (Altlasten → Backfill auf Free). Ein Bezahl-Tier ist nur wählbar, wenn **Master an ∧ `tier.enabled` ∧ Polar-Product-IDs vorhanden**; sonst „Coming soon“. Free ist immer wählbar.

**Zwei klar getrennte Einstiegspunkte:**

1. **Neuer Nutzer → Pricing-Seite (`/pricing`) = Pflicht-Gate.**
   - Free-Karte → `/signup?tier=tier_free`.
   - Bezahl-Tier, kaufbar → `/signup?tier=<id>&interval=month|year`.
   - Bezahl-Tier, nicht kaufbar → „Coming soon“, Button inaktiv (kein Link).
   - `/signup` ohne gültigen/kaufbaren Tier → Redirect `/pricing`. Kein Weg dran vorbei.

2. **`/signup?tier=<id>`** — zeigt deutlich **für welchen Tier + Intervall** der Signup läuft. GitHub + Email:
   - **Email:** Account mit `tierId` anlegen. Free → verifizieren → Login → Dashboard. Bezahlt → nach Verifizierung/Login Embedded Checkout (Sektion 3).
   - **GitHub:** `intent=signup` + `tier` + `interval` im **signierten** State. Callback: neuer Nutzer → Account mit Tier; bezahlt → Checkout. Existiert der Account schon → als **Sign-in** behandeln, Tier-Pick ignorieren, ins Dashboard.

3. **`/login` = nur Rückkehrer.** GitHub/Email melden **an**, wählen keinen Tier.
   - Email: unverändert.
   - **GitHub-Bugfix:** meldet nur **existierende** Accounts an (`intent=login`). Kein Account → **kein Auto-Create**, Redirect `/pricing` („Noch kein Account — wähle einen Plan“).

**Dashboard-Gate:** Account ohne Tier (nur Altlasten) → Redirect `/pricing`. Migration backfillt bestehende tier-lose Accounts auf `tier_free`.

**Bezahl-Abbruch:** Der Account wird erst durch den **Webhook** (bezahlt & aktiv) auf den Bezahl-Tier gesetzt. Wählt jemand einen Bezahl-Tier, bricht aber den Checkout ab → bleibt auf **Free**. Nie ein dangling tier-loser Account; „Tier wählen ist Pflicht“ bleibt erfüllt (Free ist der Fallback).

## Sektion 2 — Sicherheitsmodell

**Leitprinzip: Der Client wird nie vertraut.** `?tier=`, `?interval=`, Formularfelder sind ausschließlich **UX-Hints**. Jede Tier-Zuweisung, Kaufbarkeitsprüfung, Account-/Session-Auflösung und jeder Subscription-Statuswechsel wird **server-seitig** validiert und ausgeführt. **Der einzige Schreiber eines Bezahl-Tiers ist der signatur-verifizierte, idempotente Polar-Webhook.**

| Angriff | Verteidigung |
|---|---|
| URL-Manipulation `?tier=<coming-soon/fake>`, `?interval=quatsch` | Server validiert bei jedem Request: Tier existiert + im Kontext wählbar + Kaufbarkeit (`istKaufbar`) server-seitig. Ungültig → Redirect `/pricing`. `interval ∈ {month,year}` mit realem Polar-Product. |
| Formular-Manipulation `tierId=<paid>` POSTen | `account.tierId` wird durch keinen client-steuerbaren Pfad auf einen Bezahl-Tier gesetzt. Signup mit `tierId=paid` setzt provisorisch **Free** + startet nur einen Checkout. Free-Upgrade ohne Zahlung strukturell unmöglich. |
| Bezahl-Tier trotz „coming soon“ erzwingen | Backend re-prüft `istKaufbar` **vor** Checkout. Nicht kaufbar → 4xx, kein Checkout, keine Tier-Änderung. „Coming soon“-Ausblenden ist nur Kosmetik; echtes Gate im Backend. |
| Webhook-Fälschung / Replay | Signatur-Prüfung (Polar-Signing-Secret), sonst 403. Idempotent über den `webhook-id`-Header (Standard-Webhooks-Spec, **nicht** `data.id`). Account via unserem `externalCustomerId`, Tier aus unserem Product→Tier-Mapping — nie aus freien Payload-Feldern. |
| Out-of-order-Events | Polar garantiert **keine** Zustellreihenfolge. Nur anwenden, wenn das Event neuer ist (Timestamp/Status-Präzedenz), sonst verwerfen — verhindert einen wieder-aktivierten, eigentlich gekündigten Zugang. |
| Webhook-Endpoint-Deaktivierung | Polar deaktiviert nach 10 aufeinanderfolgenden Nicht-2xx **stillschweigend** und verwirft dann Events. Regel: **immer sofort 2xx**, Verarbeitung dahinter (acknowledge-first). |
| OAuth-CSRF / State-Tampering | `tier`, `interval`, `intent` liegen im **signierten** State-JWT. Bestehender CSRF-Schutz (State↔httpOnly-Cookie-Match) bleibt. `intent=login` legt nie einen Account an. |
| IDOR | Checkout-, Customer-Session- und Portal-Aktionen leiten Account-/Polar-Customer-ID **immer aus der authentifizierten Session** ab, nie aus einem Request-Parameter. |
| E-Mail-Verifikation umgehen | Paid-Checkout nur für authentifizierte (verifizierte) Session. Email-Signup: erst verifizieren → Login → dann Checkout für den gemerkten Tier. GitHub ist per OAuth inhärent verifiziert. |
| Direkte Tier-/Cancel-Manipulation | Kein Client-Endpunkt flippt Tiers. Bezahl-Tier-Wechsel/Cancel instruieren Polar → Webhook → wir spiegeln. |
| Master-/Tier-Flags fälschen | Master + `enabled` sind server-seitiger DB-State, bei jeder Kaufbarkeitsprüfung server-seitig gelesen. |
| Spam/Flooding | Signup/Login/OAuth/Webhook rate-limited (bestehende `RateLimiter`-Infra; Webhook per Signatur statt IP). |

**Verifizierungs-Disziplin:** Die Angriffsfälle bekommen echte Tests (manipulierter `?tier=`, gefälschter/replayter Webhook, `intent`-Flip, IDOR-Versuch, Checkout-Abbruch bleibt Free, Master-off blockt Checkout server-seitig). Sicherheit wird getestet, nicht behauptet.

## Sektion 3 — Polar-Mechanik (on-site, Redirect nur wo unvermeidbar)

**Datenmodell:**

1. **Tier→Polar-Product-Mapping lebt in Env-Config, NICHT in der DB** (Entscheidung 2026-07-08, zugunsten problemloser Prod-Dumps): eine env-getriebene Map `tier-id → { month, year }` → Polar-Product-ID. Dev = Sandbox-Map (`.env.local`), Prod = Prod-Map (Zerops). Free hat keinen Eintrag. `tiers` bleibt schemamäßig unverändert (kein Polar-Feld).
2. **Neue Tabelle `developer_subscriptions`** (Billing-Detail + Webhook-Idempotenz):
   `id`, `accountId` (FK), `tierId` (FK), `polarSubscriptionId` (unique), `polarCustomerId`, `status` (active/canceled/past_due/revoked/incomplete), `interval` (month/year), `currentPeriodEnd`, `cancelAtPeriodEnd`, `createdAt`, `updatedAt`.

**Verantwortungstrennung (SRP):** `account.tierId` bleibt der **effektive Tier** (Quelle der Wahrheit für Limits/Enforcement), vom Webhook synchron gehalten. `developer_subscriptions` trägt nur Polar-Billing-Details. Free = `account.tierId → tier_free`, keine Subscription-Zeile.

**Preis-Quelle & Multi-Currency (Entscheidung 2026-07-08):** Die **Bezahl-Preise sind Single Source of Truth bei Polar** (Produkt-Preis-Sets), nicht mehr in `tiers`. Die öffentliche Pricing-Seite liest sie über unser Backend (Org-Token server-seitig, **kurzer Katalog-Cache**) aus Polar — nie direkt aus dem Browser. **Multi-Currency geo-basiert, ehrlich (Anzeige = Zahlung):** wir erkennen die Besucher-Region (Client-IP via X-Forwarded-For, dieselbe Grundlage wie `customer_ip_address` am Checkout) und zeigen genau die Währung, die Polar auch berechnet — passende aktivierte Währung, sonst Org-Default. **Kein manueller Umschalter** (Polar bestimmt die Zahlungs-Währung per Region; ein „force currency“ existiert nicht → ein Umschalter wäre Anzeige≠Zahlung). Unsere Region→Währungs-Auswahl muss Polars Auswahl spiegeln, sonst driftet Anzeige gegen Abrechnung. **Free** (€0) bleibt bei uns. `tiers` hält weiter Name/Limits/Flags/Farbe/Icon/`enabled`/`recommended`/Beschreibung — nur die monetären Bezahl-Preise wandern nach Polar. **Folge:** die Preis-Felder im bestehenden Tier-Editor werden für Bezahl-Tiers display-only bzw. entfallen (Preis wird bei Polar gesetzt).

**On-site bei uns (via Polar-API):**

- **Checkout = Embedded Checkout, kein Redirect.** `@polar-sh/checkout` (`PolarEmbedCheckout.create(checkoutLink, { theme })`), iframe-Overlay auf unserer Seite. Checkout-Session via API mit `externalCustomerId = account.id`, `customerIpAddress = <weitergereichte Client-IP über X-Forwarded-For>` (sonst rechnet Polar VAT gegen die Server-IP falsch), und **`embed_origin` = unsere exakte Page-Origin** (Security: iframe↔parent-Messaging). Kartendaten bleiben in Polars iframe (PCI). Erfolg → Webhook ist die Wahrheit, nicht der Redirect.
- **Subscription-Management via Customer-Portal-API** (eigene UI im Dashboard, Token server-seitig):
  - Plan-Status ansehen; **Upgrade/Downgrade** (`PATCH /v1/customer-portal/subscriptions/{id}`, Switch-Product) mit **charge-preview** vorab; **Kündigen** (`DELETE …/{id}`, cancel-at-period-end, Zugang bis Periodenende); **Rechnungen/Belege** ansehen/downloaden/editieren (VAT-Nr., Firma, Adresse).
- **Refund-Anfrage** on-site entgegennehmen → Merchant-Refund-API (`POST /v1/refunds`) nach unserer Policy (siehe Sektion 5).

**Nur diese zwei sind unvermeidbar → Polar-hosted (harte PCI-Grenze, per API bewusst NICHT verfügbar):**

- **Default-Zahlungsmittel ändern/hinzufügen** (rohe Kartendaten dürfen unsere Server nie berühren).
- **Failed-Payment-Recovery / Dunning.**

**Security-Verankerung:** Der Customer-Session-Token (`polar_cst_…`) wird **server-seitig** für den Polar-Customer des authentifizierten Accounts erzeugt und bleibt im Backend — **nie im Browser**. Unser Dashboard ruft unser Backend, das Backend ruft Polar. Entitlement bleibt webhook-getrieben: on-site-Aktionen instruieren nur Polar; erst der signierte, idempotente `subscription.*`-Webhook schreibt `account.tierId`.

**Webhook — Handling:** signatur-validiert (Signing-Secret), idempotent über den `webhook-id`-Header, **2xx-first** (acknowledge, dann verarbeiten — sonst Auto-Disable nach 10 Fails), **Out-of-order-Schutz** (nur neuere Status anwenden). Account via `externalCustomerId`, Tier aus dem Env-Product-Mapping; unbekanntes Product/Account → geloggt, ignoriert. Endpoint: `POST /api/webhooks/polar` (Backend, **direkt** von Polar aufgerufen — nicht über den Astro-BFF; finaler Pfad in Plan C). In Polar einzutragende URL = **öffentliche Tunnel-URL → Backend-Port** + dieser Pfad. Ein Endpoint, mehrere Events — **nie `http://localhost`** (Polar ist ein Cloud-Dienst und erreicht deinen Rechner nicht direkt).

**Benötigte Webhook-Events:**

*Verarbeitet (entitlement-wirksam, treiben `account.tierId`):*
- `subscription.created`
- `subscription.active`
- `subscription.updated`
- `subscription.uncanceled` (Reaktivierung nach Kündigung)
- `subscription.past_due` (Zahlungsproblem — Zugang läuft bis `revoked` weiter, ggf. Hinweis anzeigen)
- `subscription.canceled` (gekündigt, greift zum Periodenende)
- `subscription.revoked` (Zugang endet sofort → zurück auf Free)

*Empfangen + geloggt (Buchhaltung/Reconciliation + Sandbox-Tests, NICHT entitlement-wirksam):*
- `order.paid` (Zahlungsbestätigung, initial + Renewals)
- `order.refunded`
- `refund.created`
- `refund.updated`

**Nicht** nötig (wir nutzen keine Polar-„Benefits“; unser Entitlement ist `account.tierId`): `benefit_grant.*`, `customer.*`, `checkout.*`, `order.created/updated`.

Der Endpoint kann in der Sandbox schon jetzt mit Events + Signing-Secret angelegt werden; bis Plan C die Route baut, liefert sie 404 — es feuern aber ohnehin keine Events, bevor ein Checkout läuft.

**Sandbox/Prod-Trennung auf unserer Seite (config-/daten-getrieben, keine Code-Verzweigung):**

- **Credentials + Server-Target per Env**, gespiegelt am bestehenden GitHub-OAuth-Muster (Dev-App lokal vs Prod-App in Zerops): `POLAR_SERVER` (`sandbox`|`production`) → `new Polar({ server })`; `POLAR_ACCESS_TOKEN` + `POLAR_WEBHOOK_SECRET` via `requireEnv` (`apps/backend/src/lib/env.ts`), in `apps/backend/.env.local` (Sandbox) vs Zerops (Prod) — analog zu `GITHUB_OAUTH_CLIENT_ID/SECRET` (`apps/backend/src/services/developer-github.ts:66`). Also ein „Dev-Polar“ und ein „Prod-Polar“, kein geteilter Account. `embed_origin`/Success-URLs aus den env-spezifischen Origins (`DEVELOPER_URL`/`PUBLIC_URL`).
- **Product-ID-Mapping liegt in Env-Config (nicht in DB):** eine env-getriebene Tier→{month,year}-Map; dev = Sandbox-IDs (`.env.local`), prod = Prod-IDs (Zerops). Env-spezifische IDs leben damit in Env-Vars wie alle anderen Secrets — konsistent mit dem bestehenden Muster.
- **`/db-dump` bleibt problemlos:** Weil keine Polar-IDs in der DB stehen, bringt ein Prod-Dump keine falschen Product-IDs nach lokal — kein Fixup nötig. **Datenhygiene:** das bestehende `scripts/dbdump` (250 Zeilen; Restore = Abschnitt „7. pg_restore“, Verify/Cleanup = „8.“) wird um einen **Scrub-Schritt** nach dem Restore erweitert, der die realen `developer_subscriptions`-Zeilen (echte Kunden-/Billing-Daten) leert. Table-existence-guarded (`to_regclass`-Check in einem `DO`-Block), damit ältere Dumps ohne die Tabelle nicht brechen.
- **Boot-Guard:** in `apps/backend/src/lib/boot-env.ts` prüfen, dass `POLAR_SERVER` zum Token passt (fail-fast). Webhook-Signatur ist env-spezifisch → falsch verdrahtete Events failen mit 403 (fail-safe).
- **Zwei orthogonale Schalter:** „welches Polar“ (sandbox/prod) und `billingActive` (ob gekauft werden kann) sind unabhängig. Prod bleibt bis Tag X `billingActive=aus` → keine echten Zahlungen, auch bei verdrahtetem Prod-Polar.
- **Secrets/OSS:** `.env.local` gitignored, Prod-Secrets in Zerops, Polar-Token nie committen (gitleaks-Hook aktiv).

## Sektion 4 — Aktivierungsschalter + „Coming soon“

**Master-Schalter (Tag-X-Flip):** globaler, server-seitiger `billingActive`-Zustand. Default **aus**. Dev lokal **an**. Prod **aus** bis Tag X, dann per Admin-Dashboard **ein** Flip — kein Redeploy. (Mechanismus: bestehende Settings-Infra wiederverwenden falls vorhanden, sonst minimale server-seitige Setting-Zeile — beim Plan-Schreiben gegen den Code verifizieren.)

**Pro-Tier `enabled`** (existiert inkl. Dashboard-Toggle + `disableReason`): entscheidet bei Master an, ob der einzelne Bezahl-Tier live ist.

**Eine server-seitige Kaufbarkeits-Regel** (Single Source of Truth, konsumiert von Pricing, Signup-Gate und Checkout-Endpunkt):

```
istKaufbar(tier, interval) = polarProductMap[tier.id][interval] vorhanden
                             ∧ (tier.id == tier_free  ODER  (billingActive ∧ tier.enabled))
```

- Free: immer kaufbar (kein Polar-Eintrag nötig).
- Bezahl-Tier: nur bei Master an ∧ `enabled` ∧ Env-Product-Mapping für das Intervall vorhanden.

**Darstellung:** kaufbarer Bezahl-Tier → aktiver „Choose …“-Button. Nicht kaufbar → Karte **sichtbar mit Preis** (aus Polar, geo-Währung), Button ersetzt durch inaktives **„Coming soon“** (bzw. `disableReason`). Free unberührt. Damit die Coming-soon-Karten in Prod schon vor Tag X echte Preise zeigen, können die Prod-Produkte bei Polar bereits vor Tag X angelegt werden — `billingActive` bleibt trotzdem das Kauf-Gate.

**Enforcement, nicht Kosmetik:** Signup-Gate und Checkout-Endpunkt rufen dieselbe `istKaufbar`-Regel; handgebaute Requests auf nicht-kaufbare Tiers werden server-seitig abgelehnt.

**Tag X:** Master aus → an. Ab dann entscheiden die per-Tier-`enabled`-Flags. Kein Redeploy außer dem Flip. Free-Nutzer bleiben unberührt und können danach on-site upgraden.

## Sektion 5 — Refunds

**Polar macht die Refunds** (MoR): Kunde fragt an (on-site-Formular oder Polar-Support) oder wir stoßen via `POST /v1/refunds` an — Polar bewegt Geld, dreht die Steuer zurück, macht die Rechnung. Wir verarbeiten keine Zahlungen/Rückzahlungen selbst.

**Entscheidender Punkt (wir verkaufen Subscriptions, keine Einmalkäufe):** Ein Refund allein **beendet den Zugang nicht.** Zugang endet nur bei **Kündigung/Widerruf** der Subscription → `subscription.revoked` → Polar entzieht Benefits automatisch. Deshalb hängt unsere Tier-Logik **ausschließlich an `subscription.*`-Events, nie an Refund-Events.** `refund.created`/`refund.updated`/`order.refunded` sind reine Buchhaltungs-Events — optional geloggt, nie entitlement-wirksam (YAGNI: für jetzt nicht nötig).

**MoR-Auto-Refund:** Polar darf innerhalb 60 Tagen nach eigenem Ermessen erstatten und die Subscription kündigen (Chargeback-Schutz). Kommt als `subscription.revoked` rein → Downgrade auf Free. Nur reagieren.

**Rechtlich (AT/EU):** Polar trägt als MoR die Verkäuferpflichten (inkl. 14-Tage-Widerrufsrecht-Handling für digitale Leistungen). Wir zeigen höchstens eine eigene Policy an; Polars MoR-Rechte gehen für Chargeback-Schutz vor.

## Sektion 6 — Plan-Split (nach Plan-Size-Regel)

Fünf eigenständige Pläne, je mit eigener `Plan-Nr.` (via `plans next`), Checkliste, verifizierten Fakten:

- **Plan A — Flow-Redesign (ohne Polar).** *Unabhängig, liefert zuerst, behebt den Bug.* Tier-Gate am Signup; GitHub trägt `intent`+`tier`+`interval` im signierten State; `intent=login` legt nie an (Bugfix); Dashboard-Gate; Migration Alt-Accounts → `tier_free`. Free ist der einzige reale Tier, Bezahl-Tiers mangels Polar-Product automatisch „coming soon“.
- **Plan B — Polar-Fundament.** *Datenmodell + Config.* Env-getriebenes Tier→Product-Mapping (Tier→{month,year}); Tabelle `developer_subscriptions`; Polar-SDK-Client; Config/Secrets (`POLAR_*`); Sandbox-Setup; **Polar-Katalog-Fetch** (Produkt-Preise + Währungen, server-seitig gecacht); **Erweiterung von `scripts/dbdump`** um den Datenhygiene-Scrub (`developer_subscriptions` nach dem Restore leeren, table-existence-guarded).
- **Plan C — Checkout + Webhook.** *Hängt an B.* Embedded Checkout (`embed_origin`, `externalCustomerId`, Client-IP); Customer-Session server-seitig; Webhook-Handler (signatur-verifiziert, idempotent über `webhook-id`, 2xx-first, Out-of-order-Schutz); `subscription.*` → `account.tierId` + `developer_subscriptions`; cancel/revoke → Free.
- **Plan D — On-site Subscription-Management-UI.** *Hängt an C.* Dashboard: Plan-Status, Upgrade/Downgrade (+charge-preview), Kündigen/Reaktivieren, Rechnungen, Refund-Anfrage; Redirect zu Polar-hosted nur für Zahlungsmittel-Update + Failed-Payment-Recovery.
- **Plan E — Master-Schalter + „Coming soon“-Gate.** *Hängt an A + B.* Globaler `billingActive`-Master (Admin-Toggle) + `istKaufbar`-Regel (SSOT) in Pricing/Signup-Gate/Checkout; „Coming soon“-Darstellung; server-seitige Ablehnung; Pricing-Seite liest Bezahl-Preise aus Polar (geo-Währung, Anzeige=Zahlung); Tier-Editor-Preisfelder für Bezahl-Tiers display-only/entfernt.

**Reihenfolge:** A zuerst (unabhängig, Bugfix). B parallel möglich. C nach B. D nach C. E nach A+B (kann mit C/D überlappen). Tag X: nur der Master-Flip in E.

## Polar-Setup — was du wann wo tun musst

Chronologische Handreichung. **Was du manuell bei Polar machst** vs. was der Code erledigt. Sandbox und Production sind bei Polar **komplett getrennt** (eigene Logins, Tokens, Products, Webhooks) — alles Product-/Token-/Webhook-Setup wird für Production später erneut gemacht. (Exakte Menü-Labels bei Polar können sich ändern; im Zweifel der aktuellen Polar-Doku folgen.)

**Phase 0 — Konten & Sandbox (jetzt, vor Plan B):**
1. Bei **sandbox.polar.sh** registrieren und eine Organisation anlegen (die Sandbox ist getrennt von der Production auf polar.sh).
2. In der Sandbox-Org einen **Organization Access Token** erzeugen → das ist `POLAR_ACCESS_TOKEN` in `.env.local`; dazu `POLAR_SERVER=sandbox`.

**Phase 1 — Products anlegen (Sandbox), zu Plan B:**
3. Für **jeden Bezahl-Tier zwei Products** anlegen: eines mit monatlichem, eines mit jährlichem recurring price (bei Polar ist jede Preisoption ein eigenes Product). Free bekommt **kein** Product.
4. Je Product die **Product-ID kopieren** (Product-Kontextmenü → Copy Product ID) und in die **Env-Config** eintragen (Tier→{month,year}-Map; `.env.local` für Sandbox). Free bekommt keinen Eintrag.

**Phase 2 — Webhook einrichten (Sandbox), zu Plan C:**
5. Im Polar-Dashboard **einen** Webhook-Endpoint hinzufügen (ein Endpoint, mehrere Events — nicht einer pro Event). **Nicht `http://localhost`** (Polar ist Cloud, erreicht deinen Rechner nicht). Für lokale Tests einen **Tunnel** (z. B. ngrok) auf den **Backend-Port** legen; als Endpoint die öffentliche Tunnel-URL + Pfad `/api/webhooks/polar` eintragen.
6. **Signing Secret** erzeugen → `POLAR_WEBHOOK_SECRET` in `.env.local`.
7. Events abonnieren gemäß Liste „Benötigte Webhook-Events“ (Sektion 3): alle `subscription.*` (created/active/updated/uncanceled/past_due/canceled/revoked) + `order.paid` + `order.refunded` + `refund.created/updated`. Für den Sandbox-Durchlauf ruhig alle aktivieren.

**Phase 3 — Testen (Sandbox):**
8. Sandbox nutzt **Test-Karten** (keine echten Zahlungen). Alle Fälle durchspielen: Checkout-Erfolg, -Abbruch (bleibt Free), Cancel (Portal-API), Upgrade/Downgrade, Refund, `past_due`, gefälschter/replayter Webhook.

**Phase 4 — Go-Live (Tag X, Production):**
9. Auf **polar.sh** (Production) eine Organisation anlegen und die **Business-/Steuer-/Payout-Daten** hinterlegen (Identitätsprüfung + Auszahlungskonto). Das braucht Vorlauf und muss vor echten Verkäufen erledigt sein — MoR-Voraussetzung.
10. Dieselben **Products** (monatlich + jährlich je Bezahl-Tier) in der Production-Umgebung neu anlegen (Sandbox-Products gelten in Production nicht). Prod-Product-IDs in die **Prod-Env-Config** (Zerops) eintragen.
11. **Production Access Token** + **Webhook-Endpoint** (prod Backend-URL) + **Signing Secret** in die Prod-Env (Zerops) setzen; `POLAR_SERVER=production`.
12. Den Master-Schalter `billingActive` in Prod per Admin-Dashboard auf **an** flippen. Fertig.

## Verifizierte Fakten (2026-07-08)

**Code (per grep/Read verifiziert):**
- `developer_accounts.tierId` nullable FK → `tiers`, `onDelete: set null`: `apps/backend/src/db/schemas/postgres.ts:1567`.
- `tiers`: `priceYearly` `:1795`, `enabled` default true `:1800`, `recommended` default false `:1802`; **kein** Polar-Feld.
- Bug: GitHub-Exchange `createDeveloperAccount(...)` ohne `tierId` — `apps/backend/src/routes/developer-github.ts:115`. Email-Signup übergibt `tierId` (`:229`) nur wenn `tier?.enabled` (`:207–211`), sonst still verworfen.
- Dashboard ohne Tier-Gate: `apps/developer/src/pages/dashboard/index.astro`.
- GitHub-OAuth ohne Tier-Parameter: `apps/developer/src/pages/auth/github.ts`, Callback `auth/github/callback.ts`.
- Pricing → `/signup?tier=<id>`, Signup validiert `?tier=` server-seitig: `apps/developer/src/pages/pricing.astro`, `signup.astro`, `components/auth/SignupForm.tsx`.
- Öffentliche Tiers: `GET /api/v1/tiers` — `apps/backend/src/routes/public-tiers.ts`.
- Rate-Limit-Infra vorhanden: `apps/backend/src/lib/infra/rate-limiter.ts`.
- **Polar im Code nicht referenziert** (grep, nur Astronomie-Falschtreffer).
- Env/Config-Infra: `apps/backend/src/lib/env.ts` (+ `config.ts`, `boot-env.ts`); `requireEnv(...)`-Helper genutzt für `GITHUB_OAUTH_CLIENT_ID/SECRET` in `apps/backend/src/services/developer-github.ts:66,88`. Secrets in `apps/backend/.env.local` (gitignored) vs Zerops-Prod-Env. `NODE_ENV === "production"` steuert Cookie-`secure`/HSTS; env-spezifische Origins `PUBLIC_URL`/`DEVELOPER_URL`/`DASHBOARD_URL`/`FRONTEND_URL`.
- DB-Dump-Workflow: `scripts/dbdump` (Bash, 250 Zeilen) — VPN → `pg_dump` prod → VPN down → Backend stop → `pg_restore --clean --if-exists` → Verify `drizzle.__drizzle_migrations`. Restore in „7. pg_restore“, Verify/Cleanup in „8.“. Scrub-Erweiterungspunkt: nach erfolgreichem Restore, vor Schritt 8.

**Polar (recherchiert 2026-07-08):**
- MoR; API `api.polar.sh/v1`; TS-SDK `@polar-sh/sdk`; Sandbox getrennt (`sandbox.polar.sh`, eigene Tokens/Products).
- Jede Preisoption = eigenes Product; Products via Dashboard oder `POST /v1/products/`. Kein Massen-Katalog-Import.
- Checkout: `checkouts.create({ products, externalCustomerId, customerIpAddress })`; `embed_origin` für Embedded Checkout.
- Embedded Checkout: `@polar-sh/checkout`, `PolarEmbedCheckout.create`, iframe-Overlay, Events `loaded/confirmed/success/close`.
- Customer-Portal-API (`polar_cst_…`): List/Update-Subscription (Switch-Product, charge-preview), Cancel (`DELETE`, cancel-at-period-end), Invoices. **Zahlungsmittel-Update NICHT per API** → nur Polar-hosted (PCI).
- Webhook: Standard-Webhooks; Idempotenz über `webhook-id`; keine Order-Garantie; Auto-Disable nach 10 Nicht-2xx.
- Refunds: `refund.created/updated`, `order.refunded`; bei Subscriptions beendet ein Refund den Zugang nicht — nur `subscription.revoked` tut das; MoR-Auto-Refund binnen 60 Tagen.
- Multi-Currency (seit 2026-02-28): Preis-Sets pro Währung am Produkt via API; Checkout-Währung **geo/IP-basiert**, Fallback Org-Default; **kein** dokumentierter force-currency-Parameter (offen: Issue #7946).
- Org-Setting **„Default payment currency = Euro“** + **„Default tax behavior = Location based“** (EU inklusive / US exklusiv) — passt zu MoR + EU-Betreiber + geo-ehrlicher Anzeige.

## Offene technische Punkte (bei Plan-Schreiben zu klären/verifizieren)

- **Master-Schalter-Mechanismus:** Existiert bereits eine Settings-/Config-Infra im Backend für einen global toggle-baren `billingActive`? Falls ja wiederverwenden, sonst minimale server-seitige Setting-Zeile. Grep bei Plan E.
- **Exakte Webhook-Event-Namen/Payload-Felder** gegen die aktuelle Polar-API-Version (`2026-04`) verifizieren, bevor der Handler gebaut wird.
- **Timing Email-Signup + Paid:** Checkout erst nach Email-Verifikation/Login (Sicherheit) — genauen UX-Übergang (gemerkter Tier nach Verifikation) beim Plan C/A-Schnitt festlegen.
- **Client-IP-Weiterreichung** an Polar (X-Forwarded-For durch den SSR-Proxy) gegen das bestehende Ratelimiter-/Proxy-Muster abgleichen.
- **Env-Shape des Product-Mappings** (ein JSON-Var `POLAR_PRODUCTS` vs. per-Tier-Vars) bei Plan B festlegen; von `env.ts`/`boot-env.ts` validieren lassen.
- **Region→Währungs-Erkennung** muss Polars Geo-Auswahl spiegeln (sonst Anzeige≠Zahlung); Cache-TTL des Polar-Katalogs festlegen.
- **Tier-Editor:** Preis-Felder für Bezahl-Tiers auf display-only/entfernt umstellen (Preis-Quelle = Polar); Impact auf bereits gebaute Tier-Editor-/Yearly-Pricing-Features prüfen.

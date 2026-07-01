# Email-Template-System v2 (Block-Body + globales Branding + System-Actions) — Design-Spec

Status: Design abgenommen (2026-07-01)
Scope: Ablösung des heutigen, aus dem lmaa-Projekt übernommenen Email-Template-Editors durch ein vollwertiges System mit block-basiertem Body, zentral gepflegtem globalem Header/Footer, eigener Bild-Ablage und einer Action-Registry, über die Code-Ereignisse lose mit Templates verknüpft werden — inklusive Migration der heute hart codierten Developer-Portal-Auth-Mails.
Verwandt: [developer-site-design.md](2026-06-26-developer-site-design.md) (Developer-Portal-Fundament), MC-064/065 (Developer-Account-System inkl. GitHub-OAuth, bereits live).

## Kontext / Ausgangslage

Das heutige admin-verwaltete Email-Template-System (`email_templates`-Tabelle, [postgres.ts:957-969](../../../apps/backend/src/db/schemas/postgres.ts:957)) wurde strukturell vom lmaa-Projekt übernommen und nie auf musiccloud-Bedürfnisse erweitert. Aktuell existiert genau eine Zeile in der lokalen DB („New User", die Dashboard-Einladungsmail).

**Verifizierte IST-Fakten:**

- Datenmodell: `id`, `name` (unique), `subject`, `headerBannerUrl`/`headerText` (optional), `bodyText` (Pflicht), `footerBannerUrl`/`footerText` (optional), `isSystemTemplate`, Timestamps. Fest verdrahtete Reihenfolge, kein Block-Konzept.
- Rendering ([email-renderer.ts](../../../apps/backend/src/services/email-renderer.ts)): `interpolate()` (Zeile 27-29) ersetzt `{{var}}` per Regex **ohne jede Validierung** — eine fehlende Variable wird stillschweigend zu einem leeren String (`variables[name] ?? ""`). Für Content-Mails unkritisch, für Auth-Mails mit Token-Links ein echtes Risiko.
- Kein Button/CTA-Block. Die Developer-Portal-Auth-Mails (Verify-Email, Passwort-Reset) leben komplett separat und hart codiert in [developer-email.ts](../../../apps/backend/src/services/developer-email.ts) mit einem eigenen, dort dupliziertem Button-HTML (`renderDeveloperEmail`, Zeile 31-64).
- Asset-Handling: `headerBannerUrl`/`footerBannerUrl` sind rohe URL-Text-Felder. `resolveAssetUrl()` ([email-renderer.ts:55-63](../../../apps/backend/src/services/email-renderer.ts:55)) hängt relative Pfade an `PUBLIC_URL` — das koppelt Email-Assets an die Env-Konfiguration einer anderen App (Frontend) und war die Ursache des lokal beobachteten Broken-Image-Bugs (`PUBLIC_URL` zeigte auf Port 3000, Frontend lief auf 3001).
- Kein Objekt-Storage im Projekt vorhanden. Einziger Upload-Präzedenzfall ist der Admin-Avatar-Upload ([admin-users.ts:213-251](../../../apps/backend/src/routes/admin-users.ts:213)), der Bilder als Base64-`data:`-URI in der DB ablegt — für Email-Bilder ungeeignet, da viele Mail-Clients (v.a. Outlook) Base64-`data:`-URIs unzuverlässig rendern. Es gibt aber bereits einen bytea-Präzedenzfall: `genre_artworks.jpeg` ([postgres.ts:944](../../../apps/backend/src/db/schemas/postgres.ts:944)), ausgeliefert über eine simple Streaming-Route mit `Content-Type`/`Cache-Control`-Headern ([genre-artwork.ts](../../../apps/backend/src/routes/genre-artwork.ts)).
- Jeder Sende-Call-Site kennt heute eine feste Template-ID oder Render-Funktion (`sendTemplatedEmail({ templateId: 1, ... })`, `sendDeveloperVerificationEmail(...)`) — keine Indirektion zwischen Code-Ereignis und Template.
- Dashboard-Sidebar hat bereits eine „System"-Sektion mit flachen `NavLink`-Einträgen (`/users`, `/services`, `/system`, `/design`) — [Sidebar.tsx:744-789](../../../apps/dashboard/src/components/layout/Sidebar.tsx:744), registriert in [routes.tsx:55-70](../../../apps/dashboard/src/routes.tsx:55).

## Ziel

Ein Email-Template-System, das (a) Button/CTA-Blöcke unterstützt, (b) globales Branding einmal zentral pflegt statt pro Template dupliziert, (c) Bilder zuverlässig über eine eigene, same-origin Backend-Route ausliefert, (d) Variablen pro Template deklariert und validiert statt sie best-effort zu ersetzen, und (e) Code-Ereignisse lose über eine Action-Registry mit beliebig vielen Templates verknüpft — so dass auch die heute hart codierten Developer-Portal-Auth-Mails darüber laufen können.

## Nicht-Ziele

- **Kein Media-Manager-Port aus lmaa.** Für eine Handvoll Email-Bilder rechtfertigt sich der Umfang eines vollständigen Medien-Verwaltungssystems nicht (explizite Entscheidung gegen den ursprünglichen Vorschlag).
- **Keine Auswahl-Logik zwischen mehreren Templates einer Action** (kein Locale-Routing, kein A/B-Testing, keine gewichtete Auswahl). Alle aktivierten Templates einer Action feuern gleichzeitig (Fan-out) — das deckt den bestätigten Anwendungsfall „mehrere Empfänger/Zwecke gleichzeitig" (z.B. Nutzer-Mail + interne Admin-Benachrichtigung bei derselben Action) vollständig ab.
- **Keine Drip-/Zeitversetzte-Sequenzen.** Würde einen eigenen Scheduler brauchen — nicht gebraucht für den bestätigten Anwendungsfall.
- **Kein Inline-WYSIWYG-Canvas.** Der Editor bleibt beim Formular-Karten-links/Live-Preview-rechts-Muster, das die heutige Preview-Iframe-Architektur erweitert statt ersetzt.
- **Keine Migration der Auth-Mails im selben Zug wie das Fundament.** Migration erfolgt in einer zweiten Rollout-Phase (siehe unten), nicht gleichzeitig mit Schema/Renderer/Editor.

## Architektur

### Datenmodell

**`email_branding`** (neu, Singleton-Zeile — genau ein Datensatz):
- `headerAssetId` (nullable, FK → `email_assets.id`)
- `footerAssetId` (nullable, FK → `email_assets.id`)
- `footerText` (nullable, Markdown)
- `updatedAt`

Wird von JEDEM Template automatisch außen um den Body gelegt — nicht pro Template konfigurierbar.

**`email_templates`** (Migration des bestehenden Schemas):
- `id`, `name` (unique), `subject`, `isSystemTemplate`, Timestamps — unverändert.
- `headerBannerUrl`/`headerText`/`bodyText`/`footerBannerUrl`/`footerText` entfallen.
- Neu: `blocks` (JSONB, geordnetes Array; Shape siehe unten).
- Neu: `requiredVariables` (JSONB-Array von `{ name: string, description: string }`) — der **eigene, Action-agnostische** Variablen-Vertrag des Templates. Ein Template weiß nichts von Actions; es deklariert nur, welche `{{var}}`-Platzhalter es selbst verwendet.

**Block-Shape** (discriminated union, `type` als Diskriminante):
```
{ type: "text", markdown: string }
{ type: "button", label: string, url: string }
{ type: "image", assetId: string, altText: string }
{ type: "divider" } | { type: "spacer", heightPx: number }
```

`markdown` und `url` durchlaufen beide dieselbe `{{var}}`-Interpolation wie heute (`interpolate()`) — ohne das könnte ein Button-Block z.B. keinen `{{resetUrl}}`-Link transportieren.

**`email_assets`** (neu, analog zu `genre_artworks`):
- `id`, `mimeType`, `bytes` (bytea), `createdAt`.
- Route `GET /api/admin/email-assets/:id`: liest Bytes + `mimeType`, setzt `Content-Type` + langlebiges `Cache-Control` (immutable, analog [genre-artwork.ts:63-67](../../../apps/backend/src/routes/genre-artwork.ts:63)), streamt die Bytes. Same-origin zum Backend — kein `PUBLIC_URL`-Abgleich mit einer anderen App nötig, behebt die Bug-Klasse von oben strukturell.

**`email_action_bindings`** (neu, M:N):
- `id`, `actionKey` (text, entspricht einem Wert aus dem Code-Enum unten), `templateId` (FK → `email_templates.id`), `enabled` (bool), `createdAt`.
- Ein Template kann in null, einer oder mehreren Bindings auftauchen; eine Action ebenso in mehreren.

### System-Actions (Code-Enum, kein Freitext)

Nach dem Muster von `AuthProvider`/`TokenPurpose` in [developer-auth.ts](../../../apps/backend/src/services/developer-auth.ts): ein `as const`-Namespace, z.B.

```
EmailAction.DeveloperVerifyEmail   → liefert { email, verifyUrl },  required: true
EmailAction.DeveloperPasswordReset → liefert { email, resetUrl },   required: true
EmailAction.DeveloperAccountDeleted → liefert { email },            required: false
EmailAction.AdminInviteSent        → liefert { email, inviteUrl },  required: false
```

Jede Action deklariert im Code: die Variablen, die sie beim Auslösen bereitstellt, und ob mindestens ein gebundenes Template zwingend vorhanden sein muss.

**Trigger-API:** `triggerEmailAction(actionKey, { to, variables })` ersetzt die heutigen direkten Aufrufe (`sendDeveloperVerificationEmail(...)`, `sendTemplatedEmail({templateId, ...})`). Ablauf:
1. Holt alle `enabled`-Bindings für `actionKey`.
2. Ist die Action `required` und keine Bindings vorhanden → wirft einen Fehler (kein stilles Ausbleiben eines Verify-Mail-Versands).
3. Für jedes gebundene Template: prüft, dass jede in `requiredVariables` deklarierte Variable des Templates in den von der Action gelieferten `variables` enthalten ist (Kompatibilitäts-Check — siehe unten, wann genau geprüft wird), rendert und sendet.

### Variablen-Validierung — zwei Zeitpunkte

- **Beim Verknüpfen** (Admin bindet ein Template an eine Action auf der Actions-Seite): sofortige Prüfung, ob alle vom Template deklarierten `requiredVariables` in den von der Action bereitgestellten Variablen enthalten sind. Fehlt eine, blockiert/warnt die UI vor dem Speichern der Bindung.
- **Beim Senden** (`triggerEmailAction`): dieselbe Prüfung nochmal defensiv, falls sich Action- oder Template-Definition seit dem Binden geändert hat — wirft statt still mit leerem String zu interpolieren (behebt die oben verifizierte Lücke in `interpolate()`).

### Rendering

`renderEmailTemplate` bleibt der fixe HTML-Rahmen (Light/Dark via `prefers-color-scheme`, Barlow-Font, musiccloud-Palette — alles unverändert aus dem heutigen `email-renderer.ts`), aber die Body-Zeilen entstehen jetzt aus `blocks` statt aus festen Feldern. `email_branding` wird immer außen um die Blocks gelegt (Header-Asset oben, Footer-Asset + Footer-Text unten) — identisch für jedes Template.

Der Button-Block übernimmt das bereits bewährte, dark-mode-sichere Button-HTML aus `renderDeveloperEmail` ([developer-email.ts:31-64](../../../apps/backend/src/services/developer-email.ts:31)) — zentralisiert in den gemeinsamen Renderer verschoben statt dort dupliziert zu bleiben.

## Editor-UX

- **Body-Editor:** sortierbare Liste von Block-Karten (Text/Button/Bild/Trenner), je ein kompaktes Formular pro Karte, „+ Block hinzufügen" am Ende der Liste.
- **Preview:** bestehendes Iframe-Preview-Muster ([EmailPreview.tsx](../../../apps/dashboard/src/features/templates/email-templates/EmailPreview.tsx)) bleibt architektonisch erhalten, nur der `preview`-Endpoint-Payload wechselt von den festen Feldern auf `blocks` + `email_branding`.
- **Globales Branding:** eigene Einstellungsseite (nicht pro Template), auf der Header-/Footer-Asset und Footer-Text zentral gepflegt werden.
- Template-Editor selbst bleibt vollständig Action-agnostisch — keine Variablen-Chips aus einer Action, nur die selbst deklarierten `requiredVariables` des Templates.

## Dashboard: System Actions

Neuer Eintrag **„Actions"** unter der bestehenden „System"-Sektion ([Sidebar.tsx:744](../../../apps/dashboard/src/components/layout/Sidebar.tsx:744), Route `actions` analog zu `users`/`services`/`system`/`design` in [routes.tsx:55-70](../../../apps/dashboard/src/routes.tsx:55)) — **keine** eigene Top-Level-Sektion.

**Layout: Liste + Detail**, im selben Navigations-Muster wie die heutige Template-Liste → Edit-Seite:
- Links: Liste aller Code-Actions (Label, Required/Optional-Badge).
- Rechts (bei Auswahl): Variablen der Action als Chips (read-only, aus dem Code), Liste der gebundenen Templates mit Enable/Disable-Toggle und Entfernen, „+ Template zuordnen" (Auswahl aus bestehenden Templates, mit Kompatibilitäts-Check beim Zuordnen).

## Rollout-Phasen

1. **Fundament:** Schema-Migration (`email_branding`, `blocks`+`requiredVariables` auf `email_templates`, `email_assets`, `email_action_bindings`), Renderer-Umbau, Editor-UI, Actions-Seite. „New User"-Template auf die neue Block-Struktur migriert — beweist die Pipeline ohne sicherheitsrelevanten Inhalt.
2. **Auth-Mail-Migration:** Verify-Email, Passwort-Reset und die Danger-Zone-Bestätigungsmail aus `developer-email.ts` als Templates + Action-Bindings ins neue System überführt, sobald Button-Block und Variablen-Validierung aus Phase 1 sich bewährt haben. Der handgerollte Renderer in `developer-email.ts` entfällt danach vollständig.

## Verwandt

- Broken-Preview-Bug (lokal, `PUBLIC_URL`-Port-Mismatch) ist die konkrete Motivation für die same-origin Asset-Route.
- `genre_artworks`-Tabelle ([postgres.ts:942-948](../../../apps/backend/src/db/schemas/postgres.ts:942)) ist das strukturelle Vorbild für `email_assets` (bytea + Streaming-Route statt Base64-in-Spalte oder externem Objekt-Storage).

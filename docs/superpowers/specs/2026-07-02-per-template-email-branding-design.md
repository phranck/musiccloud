# Per-Template Email Branding + Tag/Nacht-Himmel-Hintergrund — Design

## Kontext

MC-078 (Email Template System v2, gemergt nach `main`) hat Branding (Header-Bild, Footer-Bild, Footer-Text) bewusst als **globale Singleton-Einstellung** gebaut, gültig für JEDE Vorlage. Diese Entscheidung wird hiermit revidiert: Branding wird **pro Vorlage überschreibbar**, mit der bestehenden globalen Branding-Seite als Default-Vorbelegung. Zusätzlich bekommt jede Vorlage (und der globale Default) einen neuen **Tag/Nacht-Hintergrund** für die äußere Seiten-Fläche der Email — ein Verlauf (immer vorhanden) plus optional ein Bild, das die Websites Himmel-Optik (Tag-Wolken / Nacht-Sterne) statisch nachbildet.

Aufbauend auf dem bereits gemergten MC-078-Code:
- `apps/backend/src/services/email-renderer.ts` (komplett gelesen, aktueller Stand oben referenziert)
- `apps/backend/src/db/admin-repository.ts`: `EmailTemplateRow`/`EmailTemplateWriteData` (`:128-146`), `EmailBrandingDto` (`:149-153`), `EmailAssetDto` (`:156-160`)
- `apps/backend/src/db/schemas/postgres.ts`: `emailTemplates`, `emailBranding`, `emailAssets` Tabellen
- `apps/dashboard/src/features/templates/email-templates/EmailBrandingPage.tsx` (globale Branding-Seite, Task 11)
- `apps/dashboard/src/features/templates/email-templates/EmailTemplateEditPage.tsx` + `BlockEditor.tsx` (Vorlagen-Editor, Task 10)
- Website-Himmel-Shader: `apps/frontend/src/components/background/nightSky/settings.ts` (`NIGHT_SKY_DEFAULTS`, exakte Farbwerte)

## Ziel

1. Jede Vorlage kann Header-Bild, Footer-Bild, Footer-Text UND den neuen Tag/Nacht-Hintergrund individuell setzen — oder es beim globalen Default belassen.
2. Bereits hochgeladene Bilder (egal ob global oder in einer anderen Vorlage) lassen sich in jeder neuen Vorlage wiederverwenden (Shared-Assets-Picker), ohne erneuten Upload.
3. Bereits verwendete Gradient-Farbkombinationen werden als Klick-Vorschläge angeboten.
4. Der Tag/Nacht-Hintergrund zeigt in Mail-Clients mit hellem Farbschema eine Tag-Wolken-Optik, mit dunklem Farbschema eine Nacht-Sterne-Optik — als statische Grafik, die farblich der echten Website-Himmel-Shader-Optik entspricht.

## Nicht-Ziele

- Keine Zeit-basierte Tag/Nacht-Umschaltung (die Website hat einen "Automatic"-Modus nach Uhrzeit; das ergibt für eine einmal versendete, statische Email keinen Sinn — die Unterscheidung läuft ausschließlich über das Farbschema des Mail-Clients, exakt wie das bestehende Light/Dark-Rendering bereits funktioniert).
- Keine pixelgenaue Nachbildung der prozeduralen Wolken-/Sternfeld-Textur (Perlin-Noise-FBM) — die generierte Grafik ist eine handgefertigte, farblich passende Annäherung.
- Kein volles VML/Outlook-Desktop-Hintergrundbild-Fallback (nur ein einfaches Legacy-`background`-HTML-Attribut als günstige Zusatzmaßnahme) — konsistent mit dem bisherigen Verzicht auf VML im gesamten Renderer.
- Keine automatische Übernahme der generierten Bilder als Default — der User lädt sie bewusst über die Branding-UI hoch, wenn sie ihm gefallen.

## Datenmodell

`email_branding` (global, Singleton) bleibt strukturell bestehen und wird um die neuen Hintergrund-Felder erweitert. `email_templates` bekommt dieselben Branding-Felder zusätzlich, alle **nullable** (kein Eintrag = "kein Override, nutze globalen Default").

**Neue/erweiterte Spalten auf `email_templates`** (additiv, nullable — bestehende Vorlagen brauchen kein Backfill, `NULL` erbt automatisch weiterhin exakt das globale Branding). Die SQL-Blöcke hier sind illustrativ (Zielschema); die tatsächliche Migration entsteht wie üblich aus den Drizzle-Schema-Änderungen in `postgres.ts` heraus via `pnpm db:generate`, nicht durch Copy-Paste dieser Blöcke:

```sql
ALTER TABLE "email_templates"
  ADD COLUMN "header_asset_id" text REFERENCES "email_assets"("id") ON DELETE SET NULL,
  ADD COLUMN "footer_asset_id" text REFERENCES "email_assets"("id") ON DELETE SET NULL,
  ADD COLUMN "footer_text" text,
  ADD COLUMN "light_background_asset_id" text REFERENCES "email_assets"("id") ON DELETE SET NULL,
  ADD COLUMN "dark_background_asset_id" text REFERENCES "email_assets"("id") ON DELETE SET NULL,
  ADD COLUMN "light_gradient_top" text,
  ADD COLUMN "light_gradient_bottom" text,
  ADD COLUMN "dark_gradient_top" text,
  ADD COLUMN "dark_gradient_bottom" text;
```

**Neue Spalten auf `email_branding`** (der bestehenden Singleton-Tabelle, additiv, NOT NULL mit Default — ein Gradient braucht immer zwei Farben, um sinnvoll zu rendern, deshalb hier kein Nullable-Fallback-Chain nötig):

```sql
ALTER TABLE "email_branding"
  ADD COLUMN "light_background_asset_id" text REFERENCES "email_assets"("id") ON DELETE SET NULL,
  ADD COLUMN "dark_background_asset_id" text REFERENCES "email_assets"("id") ON DELETE SET NULL,
  ADD COLUMN "light_gradient_top" text NOT NULL DEFAULT '#0076d5',
  ADD COLUMN "light_gradient_bottom" text NOT NULL DEFAULT '#69d1fd',
  ADD COLUMN "dark_gradient_top" text NOT NULL DEFAULT '#0b1318',
  ADD COLUMN "dark_gradient_bottom" text NOT NULL DEFAULT '#10273b';
```

Die vier Default-Farbwerte sind exakt `NIGHT_SKY_DEFAULTS.skyTopDay`/`skyBottomDay`/`skyTop`/`skyBottom` aus dem echten Website-Shader (`apps/frontend/src/components/background/nightSky/settings.ts:121-168`) — ein frisches Setup sieht damit ohne jede Admin-Aktion schon stimmig aus.

**Neue Repository-Typen** (`apps/backend/src/db/admin-repository.ts`):

```typescript
/**
 * Branding-Felder, die eine Vorlage individuell überschreiben kann. Felder
 * sind REQUIRED (immer vorhanden, Wert `null` bedeutet "kein Override,
 * globalen Default nutzen") — das ist die vollständig aus der DB gelesene
 * Form, analog zu EmailBrandingDto. Für Partial-Updates (present-keys-only
 * Semantik) wird dieser Typ in Partial<> gewrappt, nie doppelt-optional
 * deklariert.
 */
export interface EmailTemplateBrandingOverrides {
  headerAssetId: string | null;
  footerAssetId: string | null;
  footerText: string | null;
  lightBackgroundAssetId: string | null;
  darkBackgroundAssetId: string | null;
  lightGradientTop: string | null;
  lightGradientBottom: string | null;
  darkGradientTop: string | null;
  darkGradientBottom: string | null;
}

export interface EmailTemplateRow {
  id: number;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  requiredVariables: EmailTemplateVariable[];
  isSystemTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
  branding: EmailTemplateBrandingOverrides; // NEU
}

export interface EmailTemplateWriteData {
  name: string;
  subject: string;
  blocks: EmailBlock[];
  requiredVariables?: EmailTemplateVariable[];
  isSystemTemplate?: boolean;
  branding?: Partial<EmailTemplateBrandingOverrides>; // NEU, present-keys-only Semantik wie updateEmailBranding
}

/** Globales Branding — jetzt inkl. Tag/Nacht-Hintergrund. */
export interface EmailBrandingDto {
  headerAssetId: string | null;
  footerAssetId: string | null;
  footerText: string | null;
  lightBackgroundAssetId: string | null;
  darkBackgroundAssetId: string | null;
  lightGradientTop: string;
  lightGradientBottom: string;
  darkGradientTop: string;
  darkGradientBottom: string;
}
```

Der present-keys-only Update-Mechanismus, der `updateEmailBranding` bereits nutzt (verifiziert, aktueller Stand in `postgres-content-email.ts`), wird 1:1 auf die neuen `email_templates`-Override-Spalten übertragen: ein weggelassenes Feld im Update-Body lässt den bisherigen Wert unverändert, ein explizites `null` löscht den Override (Vorlage fällt zurück auf den globalen Default).

## Renderer-Auflösung

Neue kleine, reine Funktion in `email-renderer.ts`, VOR jedem Rendering aufgerufen (Send- und Preview-Pfad gleichermaßen):

```typescript
/** Resolved branding for one render: template override wins per field, else global default. */
export interface ResolvedBranding {
  headerAssetId: string | null;
  footerAssetId: string | null;
  footerText: string | null;
  lightBackgroundAssetId: string | null;
  darkBackgroundAssetId: string | null;
  lightGradientTop: string;
  lightGradientBottom: string;
  darkGradientTop: string;
  darkGradientBottom: string;
}

function resolveBranding(
  overrides: EmailTemplateBrandingOverrides,
  global: EmailBrandingDto,
): ResolvedBranding {
  return {
    headerAssetId: overrides.headerAssetId ?? global.headerAssetId,
    footerAssetId: overrides.footerAssetId ?? global.footerAssetId,
    footerText: overrides.footerText ?? global.footerText,
    lightBackgroundAssetId: overrides.lightBackgroundAssetId ?? global.lightBackgroundAssetId,
    darkBackgroundAssetId: overrides.darkBackgroundAssetId ?? global.darkBackgroundAssetId,
    lightGradientTop: overrides.lightGradientTop ?? global.lightGradientTop,
    lightGradientBottom: overrides.lightGradientBottom ?? global.lightGradientBottom,
    darkGradientTop: overrides.darkGradientTop ?? global.darkGradientTop,
    darkGradientBottom: overrides.darkGradientBottom ?? global.darkGradientBottom,
  };
}
```

`buildBlockRows`/`buildEmailHtml` nehmen ab jetzt ein `ResolvedBranding` statt eines rohen `EmailBrandingDto` entgegen — die Aufrufer (`renderBlocks`, `renderEmailTemplate`, `renderEmailPreview`) rufen `resolveBranding(...)` selbst auf, bevor sie in die bestehende Rendering-Pipeline gehen. So kann die Merge-Logik nie zwischen Versand und Vorschau auseinanderlaufen.

**Preview-Endpoint-Änderung:** `POST /api/admin/email-templates/preview` bekommt zusätzlich ein optionales `branding: Partial<EmailTemplateBrandingOverrides>` im Body (der Admin bearbeitet ggf. noch ungespeicherte Override-Werte im Editor — die Vorschau muss diese live zeigen können, nicht nur bereits gespeicherte Werte einer existierenden Vorlage).

## Hintergrund-Rendering (HTML/CSS)

Der Hintergrund kommt auf die äußere `<td>`-Zelle (aktuell `apps/backend/src/services/email-renderer.ts:204`, `<td align="center" style="padding:40px 16px;">`), nicht auf `<body>` — etablierte Email-HTML-Praxis: Outlooks Word-Rendering-Engine unterstützt Zellen-Hintergründe deutlich besser als Body-Hintergründe.

```html
<td align="center"
    class="em-page-bg"
    background="${lightBackgroundAssetUrl ?? ''}"
    style="padding:40px 16px;
           background-color:${lightGradientBottom};
           background-image:${lightBackgroundAssetUrl ? `url(${lightBackgroundAssetUrl}), ` : ''}linear-gradient(180deg, ${lightGradientTop}, ${lightGradientBottom});
           background-size:cover;
           background-position:center;">
```

- `background-color` ist der solide Fallback für die eingeschränktesten Clients (kein Gradient-, kein Bild-Support).
- `background-image` trägt IMMER den Gradient, optional mit dem Bild als zusätzliche, oben liegende Ebene (CSS erlaubt mehrere kommagetrennte `background-image`-Werte; das zuerst genannte liegt oben).
- Das Legacy-`background="..."`-HTML-Attribut (nur gesetzt, wenn ein Bild vorhanden ist) ist eine günstige Zusatzmaßnahme für ältere Outlook-Versionen, die die reinen CSS-Properties ignorieren — kein VML, keine Conditional Comments.

**Dark-Mode (Send-Pfad):** analog zum bestehenden `DARK_RULES`-Muster (`email-renderer.ts:27-37`), per `@media (prefers-color-scheme: dark)` mit `!important`:

```css
@media (prefers-color-scheme: dark) {
  .em-page-bg {
    background-color: ${darkGradientBottom} !important;
    background-image: ${darkBackgroundAssetUrl ? `url(${darkBackgroundAssetUrl}), ` : ''}linear-gradient(180deg, ${darkGradientTop}, ${darkGradientBottom}) !important;
  }
}
```

**Preview-Pfad (erzwungenes Farbschema):** exakt wie der bestehende `colorScheme === "dark" ? DARK_RULES : ""`-Umschalter — die passende Variante (hell oder dunkel) wird direkt als Basis-Style gesetzt, kein `@media`-Query nötig.

`buildEmailHtml`s Signatur wächst um einen dritten Parameter für den aufgelösten Hintergrund-Style-Block (Basis + ggf. Dark-Override), analog zum bestehenden `css`-Parameter für Textfarben.

## Shared-Assets-Picker

**Neuer Endpoint:** `GET /api/admin/email-assets` — Liste aller `email_assets`-Zeilen (existiert aktuell nicht; nur Upload `POST` und Serve-by-ID `GET :id` sind vorhanden, verifiziert in `apps/backend/src/routes/admin-email-assets.ts` und `email-assets.ts`).

```typescript
// Neue Repository-Methode (postgres-content-email.ts)
export async function listEmailAssets(pool: Pool): Promise<EmailAssetDto[]> {
  const r = await pool.query(`SELECT id, mime_type, created_at FROM email_assets ORDER BY created_at DESC`);
  return r.rows.map((x) => ({ id: x.id, mimeType: x.mime_type, createdAt: x.created_at }));
}
```

Response: `EmailAssetDto[]` (Typ existiert bereits, `admin-repository.ts:156-160`, bislang nur für den Upload-Response genutzt).

**Neue Dashboard-Komponente** `AssetPicker` (o.ä.): Galerie-Ansicht bestehender Assets (Thumbnail über die bestehende, öffentliche Serve-Route `/api/admin/email-assets/:id`) + "Neu hochladen"-Option (bestehender `useUploadEmailAsset()`-Flow). Ersetzt den reinen Upload-Button überall dort, wo aktuell ein Bild gewählt wird:
- `EmailBrandingPage.tsx`s `BrandingImageSlot` (Header/Footer/neu: Tag-/Nacht-Hintergrund)
- Der neue "Branding"-Bereich im Vorlagen-Editor (siehe unten)

## Gradient-Vorauswahl

Keine neue Route nötig. `useEmailTemplates()` lädt bereits alle Vorlagen (inkl. der neuen `branding`-Override-Felder). Eine kleine Client-Funktion dedupliziert die vorkommenden `(gradientTop, gradientBottom)`-Paare (aus allen Vorlagen-Overrides + dem globalen Default) und zeigt sie als klickbare Farbverlauf-Vorschau-Swatches im Gradient-Picker — kein serverseitiger Aufwand.

## Generierte Grafik

Zwei handgefertigte SVG-Grafiken, exportiert als PNG, basierend auf den echten Shader-Werten (`NIGHT_SKY_DEFAULTS`, `apps/frontend/src/components/background/nightSky/settings.ts:121-168`):

**Tag:** Verlauf `#0076d5` (oben) → `#69d1fd` (unten), 3–4 weiche Wolken-Blob-Formen in `#e6edf3` mit dezentem warmem Streiflicht (mimt `sunIntensity`/`sunAngle`).

**Nacht:** Verlauf `#0b1318` (oben) → `#10273b` (unten), verstreute Sternpunkte in den drei Farbfamilien des Katalogs (Blau-Weiß `rgb(0.72,0.82,1.00)`, Weiß-Gelb `rgb(0.95,0.97,1.00)`, Warmgold `rgb(1.00,0.86,0.68)`), 1–2 dezente dunkle Wolkensilhouetten in `#2c3b47` für Tiefe, leichte Vignette an den Rändern (10%, mimt `vignette: 0.1`).

Format: ~1200×1600px (hochformatig), `background-size:cover` deckt die tatsächliche Darstellungsgröße ab. Beide Bilder werden als Dateien abgelegt, der User sieht sie sich an und lädt sie bei Gefallen selbst über die Branding-UI hoch (kein automatisches Seeding, siehe Nicht-Ziele).

## Editor-UI

**Vorlagen-Editor** (`EmailTemplateEditPage.tsx`): neuer aufklappbarer "Branding"-Bereich, unterhalb des bestehenden Block-Editors. Pro Feld (Header-Bild, Footer-Bild, Footer-Text, Tag-Hintergrund, Nacht-Hintergrund) ein Zustand: "nutzt globalen Default" (Anzeige des aktuell geerbten Werts, ausgegraut) oder "eigener Override" (aktiv editierbar, mit "zurücksetzen auf Default"-Aktion, die den Override-Wert explizit auf `null` setzt).

**Globale Branding-Seite** (`EmailBrandingPage.tsx`, Task 11): bekommt dieselben neuen Tag-/Nacht-Hintergrund-Felder (Gradient-Farbwähler + `AssetPicker` fürs optionale Bild), keine "Default"-Unterscheidung nötig (sie IST der Default).

## Migration/Rückwärtskompatibilität

- Bestehende Vorlagen: alle neuen `email_templates`-Spalten sind `NULL` nach der additiven Migration → erben unverändert das komplette globale Branding, exakt wie vor dieser Änderung. Kein Backfill nötig.
- Bestehendes globales Branding: die vier neuen Gradient-Spalten bekommen die Shader-Default-Farben, `light_background_asset_id`/`dark_background_asset_id` bleiben `NULL` (kein Bild, bis der User eins hochlädt) → jede Email zeigt ab der Migration sofort den Gradient-Hintergrund (neu, aber unaufdringlich), bis der User optional ein Bild ergänzt.

## Testing

- Renderer: neue Unit-Tests für `resolveBranding` (Override gewinnt pro Feld unabhängig, `null` fällt zurück, fehlende Overrides fallen zurück) und für den Hintergrund-CSS-Output (Gradient immer vorhanden, Bild-Ebene nur wenn gesetzt, Dark-Media-Query-Block korrekt gebaut).
- Route-Ebene: Preview-Endpoint mit/ohne `branding`-Override-Body.
- Repository: present-keys-only-Semantik für die neuen `email_templates`-Override-Spalten (analog zum bereits verifizierten `updateEmailBranding`-Verhalten).

## Verwandt / Folge

- Baut auf MC-078 (gemergt) auf, revidiert dessen "Branding ist rein global"-Entscheidung gezielt um ein Override-Modell.
- Phase 2 aus dem MC-078-Spec (Developer-Portal-Auth-Mails auf `triggerEmailAction` umstellen) bleibt unberührt und offen als eigener Folge-Plan.

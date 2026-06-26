# SystemMenuBar für Public Frontend und Dashboard

Plan-Nr.: MC-028

## Skip-Grund

Vom User als obsolet eingestuft und am 2026-06-26 nach `skipped/` verschoben. Die SystemMenuBar wird nicht umgesetzt; der bestehende Header (Info, Help, Sprachumschalter) bleibt bestehen. Der Plan dient nur noch als Analyse-Artefakt.

> Analyseplan, keine Implementierung.

Die aktuelle Main Navigation mit Info, Help und Sprachumschalter soll auf Desktop und Tablet wie eine macOS-Menubar funktionieren. Mobile Screens bekommen diese Leiste nicht. Scope: Desktop und Tablet only, React-Komponente, pluginartige Items, Dashboard-Konfiguration.

## Executive Summary

### Frontend

`SystemMenuBar` entsteht innerhalb von `PageHeader`. Der Datenfluss bleibt stabil: `BaseLayout`, `PageHeaderIsland`, `PageHeader`, `SystemMenuBar`. `DeferredHeader` existiert im aktuellen Code nicht mehr.

### Responsive Scope

Die Menubar rendert nur auf großen Displays. Default-Kandidat: `hidden md:flex`. Unterhalb davon muss vor Umsetzung bewusst entschieden werden, ob Sprache und Header-Links entfallen oder anders erreichbar bleiben.

### Dashboard

Alignment, Visible/Hidden, Enabled/Disabled und Plugin-Herkunft brauchen eine echte Konfigurationssicht. Das bestehende `nav_items`-Modell reicht dafür nicht.

## Ist-Zustand im Code

Abgleich vom 2026-06-05. Diese Tabelle beschreibt den aktuellen Code, nicht das Zielbild.

| Bereich | Primärquelle | Befund |
|----|----|----|
| Globaler Public Header | `apps/frontend/src/layouts/BaseLayout.astro:30-68` | `BaseLayout` liest die Locale aus dem Cookie, ruft `fetchNavigation("header", locale)` direkt auf und rendert `PageHeaderIsland`. |
| Header-Island | `apps/frontend/src/components/layout/PageHeaderIsland.tsx:16-20` | `PageHeaderIsland` kapselt `PageHeader` in einem `LocaleProvider`. |
| Header-UI | `apps/frontend/src/components/layout/PageHeader.tsx:51-70` | Aktuell fixe Top-Right-Leiste mit Header-Links und `LanguageSwitcher`. Es gibt noch keine `SystemMenuBar`. |
| Overlay-Interception | `apps/frontend/src/components/layout/PageHeader.tsx:20-45` | Klicks auf Overlay-Pages dispatchen `mc:overlay-open`, wenn ein Overlay-Host aktiv ist. |
| Overlay-Presence | `apps/frontend/src/context/OverlayContext.tsx:111-157` | `window.__mcOverlayActive` entscheidet zwischen Overlay und Full-Page-Navigation. |
| Shared Nav Types | `packages/shared/src/content.ts:8-58` | `NavItem` kennt nur Link, Label, Target und Position. |
| Backend-Validation | `apps/backend/src/services/admin-nav.ts:17-143` | Hart auf Header/Footer und sichere URL/Page-Link-Items begrenzt. |
| Dashboard-Editor | `apps/dashboard/src/features/content/navigation/NavManagerPage.tsx:116-124`, `:444-543` | Editor verwaltet Drag-Reihenfolge, Label-Override, URL/Page-Auswahl, Target und Uebersetzungen. Alignment, Visible/Hidden, Enabled/Disabled und Plugin-IDs fehlen. |
| Tests | `apps/backend/src/__tests__/admin-nav-translations.test.ts`, `public-content-locale.test.ts`, `apps/frontend/src/__tests__/page-overlay-island.test.tsx` | Tests decken Nav-Uebersetzungen, Locale-Fallback und Overlay-Verhalten ab. Es gibt keine erkennbare `SystemMenuBar`- oder Dashboard-Menubar-Testabdeckung. |

## Zielbild: Anatomy der SystemMenuBar

Die Menubar gliedert sich in drei Zonen: Leading, Center und Trailing. Items tragen Zustand und Herkunft.

**Zustände:** `visible=false` wird nicht gerendert; `enabled=false` ist sichtbar, aber nicht aktiv; `alignment` bestimmt die Zone; `order` die Sortierung.

**Item-Eigenschaften:**

- `source`: `managed-nav`, `system` oder `plugin`
- `kind`: `menu`, `link`, `status`, `custom`
- `alignment`: `leading`, `center`, `trailing`
- `state`: sichtbar, versteckt, aktiv, deaktiviert, nicht verfügbar

## Public Frontend Datenfluss

Der Plan vermeidet Duplikate. Fetch, LocaleProvider und Overlay-Click-Handling bleiben in der bestehenden Header-Kette. `SystemMenuBar` ist nur der neue Renderer für große Displays.

## Empfohlene Frontend-API

```ts
export type SystemMenuAlignment = "leading" | "center" | "trailing";
export type SystemMenuItemKind = "menu" | "action" | "link" | "status" | "custom" | "separator";

export interface SystemMenuItem {
  id: string;
  source: "managed-nav" | "system" | "plugin";
  kind: SystemMenuItemKind;
  alignment: SystemMenuAlignment;
  order: number;
  label?: React.ReactNode;
  ariaLabel?: string;
  href?: string;
  target?: "_self" | "_blank";
  visible?: boolean | ((ctx: SystemMenuContext) => boolean);
  disabled?: boolean | ((ctx: SystemMenuContext) => boolean);
  disabledReason?: string;
  onSelect?: (ctx: SystemMenuContext) => void;
  children?: SystemMenuItem[];
  render?: (ctx: SystemMenuContext) => React.ReactNode;
}
```

`LanguageSwitcher` bleibt ein eigenes `custom/status`-Item. Es wird nicht in ein generisches Link-Item gepresst.

## Dashboard-Abbildung

Managed Nav Items plus System- und Plugin-Contributions werden als konfigurierbare Rows sichtbar. Beispiel-Rows mit Alignment-Auswahl (Leading/Center/Trailing):

- **Info** — `managed-nav:info`
- **Help** — `managed-nav:help`
- **Language** — `system:language`
- **Plugin Status** — `plugin:services`

| Property | UI-Control | Semantik |
|----|----|----|
| `alignment` | Segmented Control | Gruppierung in der Menubar, danach Sortierung per Drag. |
| `visible` | Toggle | Unsichtbare Items werden nicht gerendert, bleiben aber konfigurierbar. |
| `enabled` | Toggle | Disabled Items bleiben sichtbar, sind aber nicht aktivierbar. |
| `pluginId` / `stableKey` | Readonly Badge oder Plugin Picker | Stabile Identität für Contributions und Overrides. |

## Implementierungsphasen

0. **Regression** — Landingpage-Header sauberstellen, ohne Mobile versehentlich mitzunehmen.
1. **Public Renderer** — `SystemMenuBar` lokal aus bestehenden `NavItem[]` bauen.
2. **Types** — Frontend-Contribution-Typ und späteren Wire-Typ trennen.
3. **Dashboard UI** — Menubar-Properties als neue Section oder Tab in Navigationen.
4. **Backend** — Separates Menubar-Modell, Migration, Admin- und Public-Endpoints.
5. **Plugins** — System-, Feature- und Plugin-Contributions registrieren.
6. **QA** — Desktop, Tablet, Mobile-Abwesenheit, Overlays und Keyboard prüfen.

## Checkliste

Jeder offene Punkt muss nach seiner Abarbeitung ein fehlerfreies, compilierbares Produkt hinterlassen. DB- oder Migrationsarbeiten dürfen nur über den projektspezifischen Drizzle-Workflow laufen.

- [x] **Plan gegen aktuellen Header-Datenfluss rebaselinen** — `DeferredHeader` entfernen und die reale Kette `BaseLayout -> PageHeaderIsland -> PageHeader` dokumentieren. Gate: `git diff --check`.
- [x] **Bestehende Public-Bausteine dokumentieren** — `PageHeader`, `LanguageSwitcher`, `OverlayContext`, `navHref`/`navLabel` und `trackContentPageClick` sind die aktuelle Basis. Gates bei Frontend-Codeaenderung: `pnpm --filter @musiccloud/frontend test:run` und Frontend-Build.
- [x] **Bestehendes Nav-Modell als Linklisten-Baseline festhalten** — `NavItem`, `nav_items`, Admin- und Public-Endpunkte koennen Header/Footer-Linklisten, aber kein Alignment, Visible/Enabled oder Plugin-Keys. Gates bei Backend-Aenderung: Backend-Typecheck und `admin-nav`/`public-content-locale`-Tests.
- [ ] **Public `SystemMenuBar` als Frontend-only Renderer bauen** — Neue Renderer-Komponente aus vorhandenen `NavItem[]` plus systemischem Sprach-Item, ohne DB/API-Migration. Gates: `pnpm --filter @musiccloud/frontend test:run` und `pnpm --filter @musiccloud/frontend build`.
- [ ] **Mobile-Verhalten bewusst entscheiden und testen** — Aktuell rendert der Header auch mobil. Bei `hidden md:flex` muss klar sein, ob Sprache/Header-Links mobil entfallen oder anders erreichbar bleiben. Gates: Frontend-Test fuer mobile Menubar-Abwesenheit und notwendige Controls.
- [ ] **`LanguageSwitcher` als trailing custom/status item integrieren** — Locale-Logik nicht duplizieren; bestehender Provider und Switcher bleiben Quelle. Gates: Frontend-Tests und Frontend-Build.
- [ ] **Info/Help Overlay-Regression absichern** — Overlay-faehige Links muessen weiter `mc:overlay-open` dispatchen; externe und fullscreen Links navigieren normal. Gate: `pnpm --filter @musiccloud/frontend test:run` mit PageHeader/SystemMenuBar-Faellen.
- [ ] **Tracking-Regression absichern** — Header-Info/Help-Klicks muessen weiter als Content-Page-Klicks mit Surface `header_nav` erfasst werden. Sprachwechsel nur als eigenes Event aufnehmen, wenn das Produkt es bewusst will. Gate: Frontend-Unit-Test mit Analytics-Mock.
- [ ] **Menubar-A11y entscheiden** — Entscheiden, ob es semantisch eine echte `menubar` oder kompakte Navigation ist. Bei echter Menubar: Arrow Keys, Escape, Fokusfuehrung und Menuitem-Rollen testen. Gate: Testing-Library Keyboard-Tests.
- [ ] **Dashboard UI-Entscheidung treffen** — Neue Menubar-Section in `NavManagerPage` oder eigene Route. Zuerst UI-Shell ohne Persistenz bauen und compilebar halten. Gates: `pnpm --filter @musiccloud/dashboard typecheck` und Dashboard-Tests.
- [ ] **Shared UI-Primitives nur bei echter Wiederverwendung extrahieren** — Gemeinsame Menubar-Primitives erst nachweisen, wenn Public und Dashboard dieselbe primitive API brauchen. Gates: `pnpm --filter @musiccloud/dashboard-ui typecheck` und betroffene App-Typechecks.
- [ ] **Backend-Datenmodell separat umsetzen** — `menu_surfaces`/`menu_items` nicht nebenbei in `nav_items` hineinbiegen. Nur nach freigegebener Umsetzung via Drizzle-Migrationstool. Gates: Drizzle-Generate/Apply, Shared-Typecheck, Backend-Typecheck.
- [ ] **Persistierte Menubar-Konfiguration anschliessen** — Dashboard und API fuer `alignment`, `visible`, `enabled`, stabile Keys und Plugin-/System-Source anbinden. Gates: Backend-Tests, Dashboard-Typecheck und `pnpm build`.
- [ ] **Finale QA-Gates ausfuehren** — Nach vollstaendiger Umsetzung: Desktop, Tablet, Mobile-Abwesenheit, Overlays, Sprache, Keyboard und Dashboard-Persistenz pruefen. Gates: `pnpm lint`, relevante Tests und `pnpm build`.

## Akzeptanzkriterien

### Public Frontend

- Auf Desktop/Tablet wirkt die Leiste wie eine kompakte macOS-Menubar.
- Auf Mobile wird sie nicht gerendert.
- Info und Help erscheinen als managed Nav Items.
- Der Sprachumschalter ist ein trailing Status-Item.
- Overlay-Pages öffnen weiterhin per Overlay, wenn `PageOverlayIsland` aktiv ist.

### Dashboard und Daten

- Visible/Hidden und Enabled/Disabled sind getrennte Zustände.
- Alignment und Sortierung sind im Dashboard nachvollziehbar.
- Plugin-Herkunft und stabile IDs sind sichtbar.
- Disabled Items sind nicht ausführbar und erklären ihren Zustand.
- Konfigurationsänderungen laufen über klare API- und DB-Grenzen.

## Offene Entscheidungen

- Breakpoint: `md` als Tablet/Desktop-Grenze oder erst `lg`?
- Public-Menubar synchron rendern oder weiter als Server-Island nachladen?
- Dashboard: neue Seite/Section oder Erweiterung der vorhandenen Navigationen-Seite?
- `nav_items` langfristig ablösen oder nur in `menu_items` spiegeln?
- Initialer Status-Scope: nur Sprache oder auch Theme/Profile?

## Risiken

### A11y

Eine echte Menubar braucht sauberes Keyboard-Verhalten. Das vorhandene Dropdown ist eher Listbox-orientiert und kann nicht blind wiederverwendet werden.

### Z-Index

Die Menubar darf Overlays nicht überdecken. Aktuell nutzen Backdrop und Header `z-40`, Overlay-Frame `z-50`.

### Modelldrift

Dashboard-Routen, Public-Nav und Plugin-Contributions dürfen keine getrennte Sichtbarkeitslogik bekommen.

# MarkdownEditor HintsBar — Badge-Notation-Hints

> **Status:** Brainstorming abgeschlossen 2026-05-02. Bereit für Implementation-Plan.
>
> **Scope:** Die `HintsBar` im Dashboard-`MarkdownEditor` lernt zwei zusätzliche Hint-Einträge, die zeigen wie man die neuen `[[REQ]]` / `[[OPT]]`-Badge-Marker (eingeführt mit Commit `3bb8294c`, Branch `feat/mc-query-and-inline-ext`) im Markdown notiert. Jeder Hint zeigt links die Source-Notation und rechts ein farbiges Pill-Preview, getrennt durch ein `→`.

## Ziel

Editoren beim Tippen einer Hilfe-Page direkt im Editor zeigen, dass die `[[REQ]]`- und `[[OPT]]`-Markup-Syntax existiert und wie das gerenderte Resultat aussehen wird. Reduziert Discovery-Friktion (vorher: nur in der Spec/Doku auffindbar).

Nicht im Scope: Kbd (`{{...}}`), mc-query-Code-Blöcke, Alias `[[REQUIRED]]`. Aliase sind im rendered Output trivial sichtbar; Kbd/mc-query bekommen ggf. später eigene Hints.

## Architektur

Ein einzelner File-Touch: `apps/dashboard/src/components/ui/MarkdownEditor.tsx`. Drei lokale Hilfs-Components werden ergänzt (alle in derselben Datei wie `Key`/`Hint`):

1. **`NotationCode`** — Code-Chip im Look der bestehenden `Key`-Tasten, aber breiter (mehrere Zeichen statt einem Symbol). Gleiche Border-/Bg-Tokens wie `Key`, kein `min-width`-Constraint.
2. **`PillPreview`** — Mini-Pill mit den zwei Variants `req` und `opt`. Nutzt Dashboard-Theme-Tokens (`--ds-danger-bg`/`--ds-danger-text` für `req`, `--ds-bg-elevated`/`--ds-text-muted` für `opt`). Grösse und Padding analog zu `Key`, sodass die Höhe in der Bar einheitlich bleibt.
3. **`NotationHint`** — Komposition aus `NotationCode` + `→` + `PillPreview`. Nimmt Props `notation: string`, `variant: "req" | "opt"`, `pillLabel: string`. Identische `<span className="flex items-center gap-0.5">`-Struktur wie der bestehende `Hint`, sodass beide Hint-Sorten visuell konsistent in einer Reihe leben.

In der `HintsBar` selber wird ein zweiter Wrap-Container ergänzt: rechts neben dem bestehenden `<div className="flex items-center gap-2.5">…Tasten…</div>` kommt ein zweiter `<div className="flex items-center gap-2.5 flex-wrap">` mit den zwei `NotationHint`-Einträgen. Das äussere `justify-between` der Bar (bereits im Code) sorgt für die Trennung. Bei engem Container fallen die rechten Hints durch `flex-wrap` automatisch in eine zweite Zeile.

`HINTS_BAR_MIN_WIDTH` bleibt bei 420 — die Bar versteckt sich nur, wenn der gesamte Editor-Container darunter fällt. Wrap-Verhalten bei mittleren Breiten ersetzt das harte Hide-Threshold-Bumping.

## Token-Mapping

| Variant | Background | Foreground | Border (optional) |
|---|---|---|---|
| `req` (Required) | `var(--ds-danger-bg)` | `var(--ds-danger-text)` | keine — Pill-Look ohne Border, matcht Frontend |
| `opt` (Optional) | `var(--ds-bg-elevated)` | `var(--ds-text-muted)` | `var(--ds-border)` (subtile Abgrenzung weil Bg sonst mit Bar-Bg verschmilzt) |

`req` matcht semantisch (rot/Warnung) das Frontend-Pendant `bg-error/15 + text-error`, ohne 1:1 Pixel-Match. Theme-aware via `--ds-*`-Tokens (light/dark).

`opt` ist im Frontend `bg-text-muted/20 + text-text-muted` (embossed) bzw. `bg-white/15 + text-white/70` (translucent). Im Dashboard wäre `bg-text-muted/20` möglich, würde aber bei muted-text-on-muted-bg schlecht lesbar. Stattdessen `--ds-bg-elevated` mit Border für Lesbarkeit.

## NotationCode-Styling

Genau die Klassen vom bestehenden `Key`, aber `min-w-[1.25rem]` rausgenommen und Padding `px-1` (statt `px-[0.25rem]`) damit längere Strings (`[[REQ]]` = 7 Zeichen) sauber atmen. Font-Family bleibt monospace via Tag (`<kbd>` semantisch korrekt für "Eingabe", oder `<code>` semantisch korrekt für "Code-Snippet" — wir wählen `<code>` weil das Icon ein Markdown-Snippet ist, kein Tastendruck).

## Layout-Verhalten

Bei 3 Notations × ~80px + 4 Tasten-Hints × ~60px + Gaps + Padding kommt die Bar auf ~530-560px nominale Breite. Wenn der Container-Container nur 420-540px breit ist, packt `flex-wrap` auf der rechten Seite die `NotationHint`s in eine zweite visuelle Zeile (linke Tasten-Bar bleibt einzeilig). Unterhalb von 420px verschwindet die Bar komplett (bestehendes Hide-Verhalten unverändert).

Edge-Case: wenn auch die Tasten-Hints irgendwann wachsen, wandert die Schwelle nach oben — out-of-scope für diese Spec.

## Tests

`MarkdownEditor.tsx` hat aktuell keinen eigenen Test-File. Diese Spec ergänzt keinen — die Änderung ist rein deklarativ-visuell, ohne State, ohne Logik. Verifikation:

1. Lint + tsc clean.
2. Visual smoke: Dashboard öffnen, eine Content-Page editieren, HintsBar zeigt links die 4 Tasten-Hints und rechts die 2 Badge-Notation-Hints. Bei engem Browser-Fenster wrappen die rechten Hints sauber unter die linken.
3. Theme-Toggle: Light- und Dark-Mode beide lesbar (`--ds-danger-*` und `--ds-bg-elevated` sind theme-aware).

Wenn später Bedarf für strukturelle Tests entsteht, rechtfertigt das einen separaten Test-File-Aufbau — nicht in diesem Spec mitgezogen.

## Open Questions

Keine offen.

## Verified facts

| Reference | Verified by |
|---|---|
| `apps/dashboard/src/components/ui/MarkdownEditor.tsx` (full file, 257 lines) | direkt gelesen |
| `Key`-Component (lines 129-135), Tailwind-Klassen | direkt gelesen |
| `Hint`-Component (lines 137-146) Pattern | direkt gelesen |
| `HintsBar`-Layout (lines 150-179): `flex items-center justify-between gap-3 px-2.5 py-1.5 border-t border-[var(--ds-border)] bg-[var(--ds-section-header-bg,var(--ds-bg-elevated))] text-[0.625rem]` | direkt gelesen |
| `HINTS_BAR_MIN_WIDTH = 420` (line 148) Hide-Threshold | direkt gelesen |
| Dashboard `--ds-danger-bg/border/text` (tokens.css:104-106 light, 216-218 dark) | grep |
| Dashboard `--ds-text-muted` (tokens.css:89), `--ds-text-subtle` (tokens.css:90) | grep |
| Backend Badge-Renderer-Output `<span class="mc-badge mc-badge-${variant}">` (admin-content.ts) | direkt gelesen (Branch `feat/mc-query-and-inline-ext`, Commit `3bb8294c`) |
| Frontend Badge-CSS-Selektoren in `MD_EMBOSSED`/`MD_TRANSLUCENT` (PageOverlayContent.tsx) | direkt gelesen (Commit `5a6a14bd`) |

- [x] Alle Code-Referenzen verifiziert

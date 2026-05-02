# mc-query Custom Language + Inline Extensions

> **Status:** Brainstorming abgeschlossen 2026-05-02. Bereit für Implementation-Plan.
>
> **Scope:** Zwei orthogonale Markdown-Erweiterungen, gebündelt weil sie dieselbe Spec-/Plan-/Review-Schleife durchlaufen und beide den Custom-Look der Help-Cards (mockup vom 2026-05-02) tragen.

## Ziel

1. **Custom-Sprache `mc-query`** — Code-Blöcke mit `\`\`\`mc-query …` werden serverseitig via Shiki + eigener TextMate-Grammar farbig hervorgehoben. Tokens: Keys (`genre:`, `tracks:`, …), Werte, Numbers, Comments (`#` und `//`), OR-Operator (`|`), Special-Token (`?`).
2. **Inline-Marked-Extensions** — neue Inline-Token-Typen für Pills (`[[REQUIRED]]`, `[[OPT]]`) und Keyboard-Hints (`{{Esc}}`, `{{Cmd+K}}`). Authors schreiben kompaktes Markdown statt rohes HTML.

Beide Features sind orthogonal zur Concurrency-Disziplin (sequenzielles Segment-Rendering bleibt Pflicht).

## Architektur

- **mc-query**: TextMate-Grammar als JSON neben den anderen marked-Setup-Files in `apps/backend/src/services/grammars/`. Shiki's `createHighlighter({ langs: [mcQueryGrammar] })` lädt sie beim ersten `codeToHtml`-Aufruf — Grammar wird via Singleton-Highlighter registriert. Theme bleibt `vitesse-dark`. Scopes mappen auf Standard-TextMate-Names damit das Theme greift.
- **Inline-Extensions**: zwei `marked.use({ extensions: [...] })`-Einträge in `admin-content.ts` neben den existierenden Plugins. Tokenizer matched `[[…]]` und `{{…}}`, Renderer emittiert `<span class="mc-badge mc-badge-…">…</span>` bzw. `<kbd class="mc-kbd">…</kbd>`. Badge-Werte zentral via `BADGE_LABELS`-Map konfigurierbar, sodass der User neue Marker mit einer Zeilen-Änderung hinzufügen kann.
- **Frontend**: CSS-Klassen leben in den `MD_EMBOSSED`/`MD_TRANSLUCENT`-Konstanten in `PageOverlayContent.tsx`, mit Tailwind-Utilities die auf die existierenden `--color-accent` / `--color-text-muted` / etc. Tokens zugreifen.

## 1. mc-query TextMate-Grammar

### Datei

Neu: `apps/backend/src/services/grammars/mc-query.tmLanguage.json`. JSON-Schema folgt TextMate v1 (gleiches Format wie Shiki's bundled languages, siehe `node_modules/@shikijs/langs/dist/toml.mjs` als Referenz).

### Token-Patterns

```jsonc
{
  "name": "mc-query",
  "scopeName": "source.mc-query",
  "patterns": [
    { "include": "#comment-hash" },
    { "include": "#comment-slash" },
    { "include": "#key-pair" },
    { "include": "#operator" },
    { "include": "#number" },
    { "include": "#special" }
  ],
  "repository": {
    "comment-hash": {
      "match": "(#).*$",
      "name": "comment.line.number-sign.mc-query"
    },
    "comment-slash": {
      "match": "(//).*$",
      "name": "comment.line.double-slash.mc-query"
    },
    "key-pair": {
      "match": "\\b(genre|tracks|albums|artists|count|vibe|title|artist|album)(:)",
      "captures": {
        "1": { "name": "entity.name.tag.mc-query" },
        "2": { "name": "punctuation.separator.key-value.mc-query" }
      }
    },
    "operator": {
      "match": "\\|",
      "name": "keyword.operator.or.mc-query"
    },
    "number": {
      "match": "\\b\\d+\\b",
      "name": "constant.numeric.mc-query"
    },
    "special": {
      "match": "(?<=:\\s*)\\?",
      "name": "keyword.operator.special.mc-query"
    }
  }
}
```

Werte (alles, was nicht von obigen Patterns getroffen wird) bleiben als plain text — bekommen den Default-Theme-Vordergrund.

### Shiki-Integration

In `apps/backend/src/services/admin-content.ts` ändert sich der `markedHighlight.highlight`-Callback. Statt `codeToHtml` direkt aufzurufen, wird ein Singleton-Highlighter mit der Custom-Grammar verwendet:

```ts
import { createHighlighter, type HighlighterGeneric, type BundledLanguage, type BundledTheme } from "shiki";
import mcQueryGrammar from "./grammars/mc-query.tmLanguage.json" with { type: "json" };

let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage | "mc-query", BundledTheme>> | null = null;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["vitesse-dark"],
      langs: ["javascript", "typescript", "python", "swift", "bash", "json", "css", "html", "tsx", "jsx", "ts", "js", mcQueryGrammar],
    });
  }
  return highlighterPromise;
}

// im highlight-Callback:
async highlight(code, infostring) {
  const { lang } = parseInfostring(infostring ?? "");
  if (!lang) return escapeHtml(code);
  if (lang.toLowerCase() === "text") return highlightPlainText(code);
  try {
    const hl = await getHighlighter();
    const html = hl.codeToHtml(code, { lang, theme: "vitesse-dark" });
    const m = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
    return m ? m[1] : escapeHtml(code);
  } catch {
    return escapeHtml(code);
  }
}
```

Lang-Liste muss explizit alle erwarteten Sprachen enthalten — `createHighlighter` lädt nur die genannten. Out-of-list-Sprachen fallen in den catch-Block und werden plain escaped (gleiche graceful-fallback-Semantik wie heute).

## 2. Inline-Extensions

### Badges

Markdown-Syntax: `[[REQUIRED]]`, `[[OPT]]`, `[[REQ]]` (Alias für REQUIRED). Tokens werden zu farbigen Pills wie im Mockup.

Implementierung: marked-Inline-Extension mit zentraler Map.

```ts
const BADGE_LABELS: Record<string, string> = {
  REQUIRED: "req",
  REQ: "req",
  OPT: "opt",
};
const BADGE_PATTERN = new RegExp(`^\\[\\[(${Object.keys(BADGE_LABELS).join("|")})\\]\\]`);

marked.use({
  extensions: [
    {
      name: "mcBadge",
      level: "inline",
      start(src) {
        return src.match(/\[\[/)?.index;
      },
      tokenizer(src) {
        const m = src.match(BADGE_PATTERN);
        if (m) return { type: "mcBadge", raw: m[0], text: m[1] };
      },
      renderer(token) {
        const variant = BADGE_LABELS[(token as { text: string }).text] ?? "default";
        return `<span class="mc-badge mc-badge-${variant}">${(token as { text: string }).text}</span>`;
      },
    },
    // kbd-extension below
  ],
});
```

**Wo der User neue Badges hinzufügt:** Genau eine Stelle — der `BADGE_LABELS`-Block in `apps/backend/src/services/admin-content.ts`. Neue Einträge folgen dem Schema `KEYWORD: "css-variant-suffix"`. Wird automatisch in das `BADGE_PATTERN`-Regex eingebaut. Plus eine Tailwind-Klasse `.mc-badge-<variant>` für den Look in `MD_EMBOSSED`/`MD_TRANSLUCENT`.

### Keyboard-Hints

Markdown-Syntax: `{{Esc}}`, `{{Cmd+K}}`, `{{⌘}}` — Inhalt zwischen `{{` und `}}` wird wörtlich übernommen, in `<kbd class="mc-kbd">…</kbd>` gewrappt.

```ts
{
  name: "mcKbd",
  level: "inline",
  start(src) { return src.match(/\{\{/)?.index; },
  tokenizer(src) {
    const m = src.match(/^\{\{([^}]+)\}\}/);
    if (m) return { type: "mcKbd", raw: m[0], text: m[1] };
  },
  renderer(token) {
    const t = (token as { text: string }).text;
    return `<kbd class="mc-kbd">${escapeHtml(t)}</kbd>`;
  },
}
```

`escapeHtml` schützt vor User-Input mit `<`, `&`, etc. — das war im Token-Handler bisher nicht nötig (Badge-Werte sind whitelist-restricted), bei Kbd kann der Author beliebigen Text reinschreiben.

## 3. Frontend-CSS

In `apps/frontend/src/components/layout/PageOverlayContent.tsx` werden `MD_EMBOSSED` und `MD_TRANSLUCENT` um drei Selektoren erweitert (Klassen analog zur existierenden Logik):

```ts
"[&_.mc-badge]:inline-block [&_.mc-badge]:px-1.5 [&_.mc-badge]:py-0.5 [&_.mc-badge]:rounded [&_.mc-badge]:text-xs [&_.mc-badge]:font-semibold [&_.mc-badge]:uppercase [&_.mc-badge]:tracking-wider [&_.mc-badge]:font-mono [&_.mc-badge]:ml-1 [&_.mc-badge]:align-middle",
"[&_.mc-badge-req]:bg-error/15 [&_.mc-badge-req]:text-error",
"[&_.mc-badge-opt]:bg-text-muted/20 [&_.mc-badge-opt]:text-text-muted",
"[&_.mc-kbd]:inline-block [&_.mc-kbd]:px-1.5 [&_.mc-kbd]:py-0.5 [&_.mc-kbd]:rounded [&_.mc-kbd]:text-xs [&_.mc-kbd]:font-mono [&_.mc-kbd]:bg-white/8 [&_.mc-kbd]:border [&_.mc-kbd]:border-white/12 [&_.mc-kbd]:text-text-secondary",
```

Bei translucent ggf. leicht andere Opacities (analog zum bestehenden Code-Block-Look).

## 4. Tests

### Backend

`apps/backend/src/services/__tests__/marked-renderer.test.ts` bekommt:

- `\`\`\`mc-query\ngenre: jazz\n\`\`\`` → enthält `<span style="color:` (Shiki-Highlight aktiv).
- `\`\`\`mc-query\ngenre: jazz # comment\n\`\`\`` → comment-Pattern matched, Comment-Text bekommt eigene Span mit Comment-Theme-Farbe (vitesse-dark: grau-grün, NICHT italic — entgegen ursprünglicher Annahme).
- `\`\`\`mc-query\nartist: foo // bar\n\`\`\`` → `//` Comment auch erkannt, eigene Span mit Comment-Farbe.
- `[[REQUIRED]]` → `<span class="mc-badge mc-badge-req">REQUIRED</span>`.
- `[[OPT]]` → `<span class="mc-badge mc-badge-opt">OPT</span>`.
- `[[REQ]]` → `<span class="mc-badge mc-badge-req">REQ</span>` (Alias).
- `[[UNKNOWN]]` → bleibt unverändert (Tokenizer matched nicht; marked rendert literal `[[UNKNOWN]]` als Text).
- `{{Esc}}` → `<kbd class="mc-kbd">Esc</kbd>`.
- `{{<script>}}` → `<kbd class="mc-kbd">&lt;script&gt;</kbd>` (HTML-escape im Kbd-Render).

### Frontend

Optional, weil HTML→DOM-Mapping deterministisch ist. Skip wenn Backend-Tests + visuelle Verification reichen.

## 5. Open Questions

Keine offenen Fragen. Sprachname `mc-query`, Comment-Syntax `#` und `//`, Badge-Map mit zwei Initialwerten plus Alias, Kbd mit beliebigem Text-Inhalt — alles entschieden.

## Verified facts

| Reference | Verified by |
|---|---|
| `apps/backend/src/services/admin-content.ts` (markedHighlight + parseInfostring + highlightPlainText) | direkt gelesen |
| `apps/backend/src/services/admin-content.ts` `getPublicContentPage` segments-Loop (sequentiell seit `2db2882d`) | direkt gelesen |
| Shiki Singleton-Highlighter API (`createHighlighter`, lang-Liste explizit) | `node_modules/shiki/dist/index.d.mts` + bundled langs sample |
| TextMate-Grammar JSON-Format | `node_modules/@shikijs/langs/dist/toml.mjs` Referenz |
| `apps/frontend/src/components/layout/PageOverlayContent.tsx` MD_EMBOSSED + MD_TRANSLUCENT existing Tailwind-Pattern | direkt gelesen |

- [x] Alle Code-Referenzen verifiziert

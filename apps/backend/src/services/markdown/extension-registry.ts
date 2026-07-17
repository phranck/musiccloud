import { ContentContext, type ContentContextMask, isValidContentContextMask } from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import markedFootnote from "marked-footnote";
import { markedHighlight } from "marked-highlight";
import { type BundledLanguage, type BundledTheme, createHighlighter, type HighlighterGeneric } from "shiki";
import mcQueryGrammar from "../grammars/mc-query.tmLanguage.json" with { type: "json" };

const BOTH_CONTENT_CONTEXTS = ContentContext.Frontend | ContentContext.DeveloperPortal;
const KNOWN_CARD_MODIFIERS = new Set(["recessed", "embossed"] as const);
const CSS_LENGTH_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch)$/;
const LANGUAGE_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const FIELDS_DEFAULT_LABEL_WIDTH = "max-content";
const FIELDS_DEFAULT_GAP = "1.1rem";
const INLINE_OPTION_TOKEN_PATTERN = /^([A-Za-z][\w-]*)=([^\s=]+)$/;
const PILL_TONES = new Set(["alert", "info", "neutral", "success"] as const);
const PILL_CASES = new Set(["none", "upper", "lower"] as const);

type CardModifier = "recessed" | "embossed";
type PillTone = "alert" | "info" | "neutral" | "success";
type PillCase = "none" | "upper" | "lower";

interface FieldsLayout {
  labelWidth: string;
  gap: string;
}

interface McFieldsRow {
  label: string;
  tokens: Token[];
}

interface McFieldsToken extends Tokens.Generic {
  type: "mcFields";
  rows: McFieldsRow[];
  layout: FieldsLayout;
}

interface McPillToken extends Tokens.Generic {
  type: "mcPill";
  text: string;
  tone: PillTone;
  textCase: PillCase;
}

export interface MarkdownExtensionDefinition {
  name: string;
  allowedContextMask: ContentContextMask;
  createMarkedExtension(): MarkedExtension;
  tokenTypes: readonly string[];
}

export interface MarkdownExtensionRegistry {
  readonly definitions: readonly MarkdownExtensionDefinition[];
}

function parseInfostring(raw: string): {
  lang: string | null;
  modifier: CardModifier | null;
  padding: string | null;
  radius: string | null;
} {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  let modifier: CardModifier | null = null;
  let lang: string | null = null;
  let padding: string | null = null;
  let radius: string | null = null;
  let sawLanguageCandidate = false;
  for (const token of tokens) {
    if (KNOWN_CARD_MODIFIERS.has(token as CardModifier)) modifier = token as CardModifier;
    else if (token.startsWith("padding=")) {
      const value = token.slice("padding=".length);
      padding = isSafeCssLength(value) ? value : null;
    } else if (token.startsWith("radius=")) {
      const value = token.slice("radius=".length);
      radius = isSafeCssLength(value) ? value : null;
    } else if (!sawLanguageCandidate) {
      sawLanguageCandidate = true;
      lang = isSafeLanguageToken(token) ? token : null;
    }
  }
  return { lang, modifier, padding, radius };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function parseInlineOptions(raw: string | undefined): Array<[name: string, value: string]> {
  const options: Array<[name: string, value: string]> = [];
  for (const option of (raw ?? "").trim().split(/\s+/).filter(Boolean)) {
    const match = option.match(INLINE_OPTION_TOKEN_PATTERN);
    if (match) options.push([match[1], match[2]]);
  }
  return options;
}

function isInlineOptionToken(token: string): boolean {
  return INLINE_OPTION_TOKEN_PATTERN.test(token);
}

function isSafeCssLength(value: string): boolean {
  return CSS_LENGTH_PATTERN.test(value);
}

function isSafeLanguageToken(value: string): boolean {
  return LANGUAGE_TOKEN_PATTERN.test(value);
}

function parseFieldsLayout(raw: string | undefined): FieldsLayout {
  const layout: FieldsLayout = {
    labelWidth: FIELDS_DEFAULT_LABEL_WIDTH,
    gap: FIELDS_DEFAULT_GAP,
  };

  for (const [name, value] of parseInlineOptions(raw)) {
    if (name === "labelWidth") {
      layout.labelWidth =
        value === "auto" ? FIELDS_DEFAULT_LABEL_WIDTH : isSafeCssLength(value) ? value : layout.labelWidth;
    } else if (name === "gap" && isSafeCssLength(value)) {
      layout.gap = value;
    }
  }

  return layout;
}

function renderFieldsStyle(layout: FieldsLayout): string {
  return `display:grid;grid-template-columns:${layout.labelWidth} minmax(0, 1fr);column-gap:${layout.gap};`;
}

function highlightPlainText(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      const leading = line.match(/^\s*/)?.[0] ?? "";
      const rest = line.slice(leading.length);
      if (rest.startsWith("#") || rest.startsWith("//")) {
        return `${leading}<span style="color:#9A9AA0;font-style:italic">${escapeHtml(rest)}</span>`;
      }
      return escapeHtml(line);
    })
    .join("\n");
}

let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | undefined;

function getHighlighter(): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> {
  highlighterPromise ??= createHighlighter({
    themes: ["vitesse-dark"],
    langs: [
      "javascript",
      "typescript",
      "ts",
      "js",
      "tsx",
      "jsx",
      "python",
      "swift",
      "bash",
      "json",
      "css",
      "html",
      mcQueryGrammar,
    ],
  });
  return highlighterPromise;
}

function createFootnotesExtension(): MarkedExtension {
  return {
    ...markedFootnote(),
    gfm: true,
  };
}

function createCodeFenceExtension(): MarkedExtension {
  return {
    ...markedHighlight({
      async: true,
      async highlight(code, infostring) {
        const { lang } = parseInfostring(infostring ?? "");
        if (!lang) return escapeHtml(code);
        if (lang.toLowerCase() === "text") return highlightPlainText(code);
        try {
          const highlighter = await getHighlighter();
          const html = highlighter.codeToHtml(code, { lang, theme: "vitesse-dark" });
          const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
          return match ? match[1] : escapeHtml(code);
        } catch {
          return escapeHtml(code);
        }
      },
    }),
    renderer: {
      code({ text, lang: rawLang }: Tokens.Code): string {
        const parsed = parseInfostring(rawLang ?? "");
        const modifier = parsed.modifier ?? "recessed";
        const styleAttribute = ` data-card-style="${escapeHtmlAttribute(modifier)}"`;
        const paddingAttribute = parsed.padding ? ` data-card-padding="${escapeHtmlAttribute(parsed.padding)}"` : "";
        const radiusAttribute = parsed.radius ? ` data-card-radius="${escapeHtmlAttribute(parsed.radius)}"` : "";
        const languageClass = parsed.lang ? ` class="${escapeHtmlAttribute(`language-${parsed.lang}`)}"` : "";
        return `<pre${styleAttribute}${paddingAttribute}${radiusAttribute}><code${languageClass}>${text}</code></pre>\n`;
      },
    },
  };
}

function parsePillBody(raw: string): { text: string; options: string | undefined } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { text: "", options: undefined };

  let optionStart = tokens.length;
  while (optionStart > 1 && isInlineOptionToken(tokens[optionStart - 1])) {
    optionStart -= 1;
  }

  const text = tokens.slice(0, optionStart).join(" ");
  const options = tokens.slice(optionStart).join(" ");
  return { text, options: options || undefined };
}

function parsePillOptions(raw: string | undefined): { tone: PillTone; textCase: PillCase } {
  let tone: PillTone = "neutral";
  let textCase: PillCase = "none";

  for (const [name, value] of parseInlineOptions(raw)) {
    if (name === "tone" && PILL_TONES.has(value as PillTone)) {
      tone = value as PillTone;
    } else if (name === "case" && PILL_CASES.has(value as PillCase)) {
      textCase = value as PillCase;
    }
  }

  return { tone, textCase };
}

function applyPillCase(text: string, textCase: PillCase): string {
  if (textCase === "upper") return text.toUpperCase();
  if (textCase === "lower") return text.toLowerCase();
  return text;
}

const mcFieldsExtension: MarkedExtension = {
  extensions: [
    {
      name: "mcFields",
      level: "block",
      start(source) {
        return source.match(/^:::fields/m)?.index;
      },
      tokenizer(source) {
        const match = source.match(/^:::fields(?:[ \t]+([^\r\n]*))?\r?\n([\s\S]*?)\r?\n:::[ \t]*(?:\r?\n|$)/);
        if (!match) return;

        const rows = match[2]
          .split(/\r?\n/)
          .map((line): McFieldsRow | null => {
            const row = line.match(/^\s*([^:]+):\s*(.*)$/);
            if (!row) return null;
            const label = row[1].trim();
            const value = row[2].trim();
            if (!label) return null;
            return {
              label,
              tokens: this.lexer.inline(value) as Token[],
            };
          })
          .filter((row): row is McFieldsRow => row !== null);

        return {
          type: "mcFields",
          raw: match[0],
          rows,
          layout: parseFieldsLayout(match[1]),
        } satisfies McFieldsToken;
      },
      renderer(token) {
        const fields = token as McFieldsToken;
        const rows = fields.rows
          .map((row) => {
            const label = escapeHtml(row.label);
            const content = this.parser.parseInline(row.tokens);
            return `<dt>${label}:</dt><dd>${content}</dd>`;
          })
          .join("");
        return `<dl class="mc-fields" style="${escapeHtmlAttribute(renderFieldsStyle(fields.layout))}">${rows}</dl>\n`;
      },
    },
  ],
};

const mcPillExtension: MarkedExtension = {
  extensions: [
    {
      name: "mcPill",
      level: "inline",
      start(source) {
        return source.match(/\[\[pill:/)?.index;
      },
      tokenizer(source) {
        const match = source.match(/^\[\[pill:([^\]]+)\]\]/);
        if (!match) return;
        const { text, options } = parsePillBody(match[1]);
        if (!text) return;
        return { type: "mcPill", raw: match[0], text, ...parsePillOptions(options) } satisfies McPillToken;
      },
      renderer(token) {
        const pill = token as McPillToken;
        return `<span class="mc-pill mc-pill-${pill.tone}">${escapeHtml(applyPillCase(pill.text, pill.textCase))}</span>`;
      },
    },
  ],
};

const mcKbdExtension: MarkedExtension = {
  extensions: [
    {
      name: "mcKbd",
      level: "inline",
      start(source) {
        return source.match(/\{\{/)?.index;
      },
      tokenizer(source) {
        const match = source.match(/^\{\{([^}]+)\}\}/);
        if (match) return { type: "mcKbd", raw: match[0], text: match[1] };
      },
      renderer(token) {
        return `<kbd class="mc-kbd">${escapeHtml(token.text)}</kbd>`;
      },
    },
  ],
};

export const MARKDOWN_EXTENSION_DEFINITIONS: readonly MarkdownExtensionDefinition[] = [
  {
    name: "footnotes",
    allowedContextMask: BOTH_CONTENT_CONTEXTS,
    createMarkedExtension: createFootnotesExtension,
    tokenTypes: ["footnotes", "footnote", "footnoteRef"],
  },
  {
    name: "codeFence",
    allowedContextMask: BOTH_CONTENT_CONTEXTS,
    createMarkedExtension: createCodeFenceExtension,
    tokenTypes: ["code"],
  },
  {
    name: "mcFields",
    allowedContextMask: BOTH_CONTENT_CONTEXTS,
    createMarkedExtension: () => mcFieldsExtension,
    tokenTypes: ["mcFields"],
  },
  {
    name: "mcPill",
    allowedContextMask: BOTH_CONTENT_CONTEXTS,
    createMarkedExtension: () => mcPillExtension,
    tokenTypes: ["mcPill"],
  },
  {
    name: "mcKbd",
    allowedContextMask: BOTH_CONTENT_CONTEXTS,
    createMarkedExtension: () => mcKbdExtension,
    tokenTypes: ["mcKbd"],
  },
];

export function createMarkdownExtensionRegistry(
  definitions: readonly MarkdownExtensionDefinition[],
): MarkdownExtensionRegistry {
  const names = new Set<string>();
  for (const definition of definitions) {
    if (names.has(definition.name)) {
      throw new Error(`Duplicate Markdown extension: ${definition.name}`);
    }
    if (!isValidContentContextMask(definition.allowedContextMask)) {
      throw new RangeError(`Invalid context mask for Markdown extension ${definition.name}`);
    }
    if (definition.tokenTypes.length === 0) {
      throw new Error(`Markdown extension ${definition.name} must declare at least one token type`);
    }
    names.add(definition.name);
  }

  return Object.freeze({ definitions: Object.freeze([...definitions]) });
}

export const MARKDOWN_EXTENSION_REGISTRY = createMarkdownExtensionRegistry(MARKDOWN_EXTENSION_DEFINITIONS);

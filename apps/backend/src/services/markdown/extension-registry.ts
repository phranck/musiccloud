import {
  BUNDLED_CODE_FENCE_LANGUAGES,
  CARD_SHORTCODE,
  ContentContext,
  type ContentContextMask,
  FIELDS_AUTO_LABEL_WIDTH,
  FIELDS_DEFAULT_GAP,
  FIELDS_DEFAULT_LABEL_WIDTH,
  FIELDS_DEFAULT_LAYOUT,
  FIELDS_SHORTCODE,
  FieldsLayoutMode,
  type FieldsLayoutModeValue,
  HSTACK_SHORTCODE,
  ICON_SHORTCODE,
  IMAGE_SHORTCODE,
  isValidContentContextMask,
  KBD_SHORTCODE,
  PDF_SHORTCODE,
  PILL_DEFAULT_CASE,
  PILL_DEFAULT_TONE,
  PILL_SHORTCODE,
  PLANS_SHORTCODE,
  parseShortcodes,
  readShortcodeAt,
  type ShortcodeDefinition,
  type ShortcodeParamValue,
  ShortcodeSyntax,
  SPACER_SHORTCODE,
  VSTACK_SHORTCODE,
  YOUTUBE_SHORTCODE,
} from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import markedFootnote from "marked-footnote";
import { markedHighlight } from "marked-highlight";
import { type BundledLanguage, type BundledTheme, createHighlighter, type HighlighterGeneric } from "shiki";
import mcQueryGrammar from "../grammars/mc-query.tmLanguage.json" with { type: "json" };
import { createCardExtension } from "./card-extension.js";
import { createHeadingAnchorExtension } from "./heading-anchors.js";
import { createIconExtension } from "./icon-extension.js";
import { createMediaExtension } from "./media-extension.js";
import { createPlansExtension } from "./plans-extension.js";
import { createStackExtension } from "./stack-extension.js";

const BOTH_CONTENT_CONTEXTS = ContentContext.Frontend | ContentContext.DeveloperPortal;
const KNOWN_CARD_MODIFIERS = new Set(["recessed", "embossed"] as const);
const CSS_LENGTH_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch)$/;
const LANGUAGE_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

type CardModifier = "recessed" | "embossed";
type PillTone = "alert" | "info" | "neutral" | "success";
type PillCase = "none" | "upper" | "lower";

interface FieldsLayout {
  mode: FieldsLayoutModeValue;
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

function isSafeCssLength(value: string): boolean {
  return CSS_LENGTH_PATTERN.test(value);
}

function isSafeLanguageToken(value: string): boolean {
  return LANGUAGE_TOKEN_PATTERN.test(value);
}

/**
 * Reads one shortcode's parameters through the shared registry.
 *
 * The registry decides which attributes a shortcode takes, what each is called
 * and what stands in when it is left out, so nothing here repeats any of that.
 * What is repeated would drift: the editor's reference reads the same
 * declaration, and a default written twice would eventually contradict the help
 * that promises it.
 *
 * @param raw - The shortcode's source, exactly as marked matched it.
 * @param definition - Which shortcode to read it as.
 * @returns The parameters with their defaults filled in, and the target where
 *   the shortcode takes one. Empty when the source does not resolve, which
 *   leaves each caller to fall back to what the registry declares.
 */
function readShortcode(
  raw: string,
  definition: ShortcodeDefinition,
): { params: Record<string, ShortcodeParamValue>; target?: string } {
  const [parsed] = parseShortcodes(raw, [definition]);
  return parsed ? { params: parsed.params, target: parsed.target } : { params: {} };
}

/**
 * Reads the layout of a fields list, keeping only lengths that are safe to
 * write into a `style` attribute.
 *
 * The registry says what a writer may name; this says what may reach the page.
 * Anything else falls back to the declared default rather than being passed
 * through, because these two values are interpolated into inline CSS.
 *
 * @param raw - The fence's source, as marked matched it.
 * @returns The two column measurements.
 */
function parseFieldsLayout(raw: string, definition: ShortcodeDefinition = FIELDS_SHORTCODE): FieldsLayout {
  const { params } = readShortcode(raw, definition);
  const labelWidth = String(params.labelWidth ?? FIELDS_DEFAULT_LABEL_WIDTH);
  const gap = String(params.gap ?? FIELDS_DEFAULT_GAP);

  return {
    // Already checked against the values the registry declares, so this is one
    // of them and the cast states that rather than deciding it.
    mode: (params.layout ?? FIELDS_DEFAULT_LAYOUT) as FieldsLayoutModeValue,
    labelWidth:
      labelWidth === FIELDS_AUTO_LABEL_WIDTH || !isSafeCssLength(labelWidth) ? FIELDS_DEFAULT_LABEL_WIDTH : labelWidth,
    gap: isSafeCssLength(gap) ? gap : FIELDS_DEFAULT_GAP,
  };
}

/**
 * The inline style one fields list carries.
 *
 * Stacked lists need no columns and no column gap, so they carry the row gap
 * instead and let the stylesheet set everything else. Emitting a
 * `grid-template-columns` they do not use would be a declaration the sanitizer
 * has to allow for nothing.
 *
 * @param layout - The list's resolved arrangement.
 * @returns The declarations, ready for a `style` attribute.
 */
function renderFieldsStyle(layout: FieldsLayout): string {
  // No row gap: stacked, a statement and its sentence belong together whilst
  // one pair stands apart from the next, and one figure cannot say both. The
  // stylesheet sets the two, and `gap` is documented as ignored here.
  if (layout.mode === FieldsLayoutMode.Stacked) return "display:grid;";
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
    // The list comes from the shared declaration the editor's help reads, so a
    // language offered to a writer is one the highlighter has actually loaded.
    // Our own grammar is added here rather than there, because it is a grammar
    // object and this is the module that holds it.
    langs: [...BUNDLED_CODE_FENCE_LANGUAGES, mcQueryGrammar],
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

/**
 * Reads a pill's text and its two settings.
 *
 * @param raw - The pill's source, as marked matched it.
 * @returns The text and the settings. The text is empty where nothing was
 *   written after the colon, which is what tells the tokenizer not to produce a
 *   pill at all.
 *
 * @remarks
 * The parser has already checked each setting against the values the registry
 * declares, so anything it hands back is one of them and the defaults are
 * already filled in.
 */
function parsePill(raw: string): { text: string; tone: PillTone; textCase: PillCase } {
  const { params, target } = readShortcode(raw, PILL_SHORTCODE);

  return {
    text: target ?? "",
    tone: (params.tone ?? PILL_DEFAULT_TONE) as PillTone,
    textCase: (params.case ?? PILL_DEFAULT_CASE) as PillCase,
  };
}

function applyPillCase(text: string, textCase: PillCase): string {
  if (textCase === "upper") return text.toUpperCase();
  if (textCase === "lower") return text.toLowerCase();
  return text;
}

/**
 * The fields list as pages written before the change still carry it.
 *
 * The registry declares the bracket form, which is what a writer is shown and
 * what every example uses. Stored pages carry `:::fields`, and the parser
 * refuses a notation the declaration does not name, so the same declaration is
 * repeated here under the old notation and used for those pages alone. It
 * appears in no example, in no reference and in no help.
 *
 * @deprecated Reading only, so nothing stored breaks. Goes once the stored
 * pages have been rewritten to `[[fields { … }]]`.
 */
const FENCE_FIELDS_SHORTCODE = { ...FIELDS_SHORTCODE, syntax: ShortcodeSyntax.Fence };

/** What the old notation opens with, which is how a page written in it is recognised. */
const FENCE_OPENING = ":::";

/**
 * Reads a fields list, if one begins here.
 *
 * The rows are lines of `Label: value`, and the value is inline Markdown, so a
 * link or a piece of code works there. A line without a colon is not a row and
 * is dropped rather than guessed at.
 *
 * @param source - What marked is offering, from the current position.
 * @returns The raw source, the rows still to be lexed, and the resolved layout,
 *   or `null` when no fields list begins here.
 */
function readFieldsSource(source: string): { raw: string; rows: string[]; layout: FieldsLayout } | null {
  const node = readShortcodeAt(source, 0);
  if (!node || node.token !== FIELDS_SHORTCODE.token || node.body === undefined) return null;

  // Which notation this page was written in decides which declaration reads it,
  // because the parser checks the two against each other.
  const definition = node.source.raw.startsWith(FENCE_OPENING) ? FENCE_FIELDS_SHORTCODE : FIELDS_SHORTCODE;

  return {
    raw: node.source.raw,
    rows: node.body.split(/\r?\n/),
    layout: parseFieldsLayout(node.source.raw, definition),
  };
}

const mcFieldsExtension: MarkedExtension = {
  extensions: [
    {
      name: "mcFields",
      level: "block",
      start(source) {
        return source.match(/\[\[fields[\s{]|^:::fields\b/m)?.index;
      },
      tokenizer(source) {
        const read = readFieldsSource(source);
        if (!read) return;

        const rows = read.rows
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
          raw: read.raw,
          rows,
          layout: read.layout,
        } satisfies McFieldsToken;
      },
      renderer(token) {
        const fields = token as McFieldsToken;
        // The colon belongs to the columns form, where it separates a label
        // from the value beside it. Stacked, the label is a statement on a line
        // of its own and a trailing colon reads as a mistake.
        const labelSuffix = fields.layout.mode === FieldsLayoutMode.Stacked ? "" : ":";
        const rows = fields.rows
          .map((row) => {
            const label = escapeHtml(row.label);
            const content = this.parser.parseInline(row.tokens);
            return `<dt>${label}${labelSuffix}</dt><dd>${content}</dd>`;
          })
          .join("");
        const layoutClass = `mc-fields--${fields.layout.mode}`;
        const style = escapeHtmlAttribute(renderFieldsStyle(fields.layout));
        return `<dl class="mc-fields ${layoutClass}" style="${style}">${rows}</dl>\n`;
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
        const { text, tone, textCase } = parsePill(match[0]);
        if (!text) return;
        return { type: "mcPill", raw: match[0], text, tone, textCase } satisfies McPillToken;
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
        if (!match) return;
        const { target } = readShortcode(match[0], KBD_SHORTCODE);
        if (!target) return;
        return { type: "mcKbd", raw: match[0], text: target };
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
    name: "headingAnchors",
    allowedContextMask: BOTH_CONTENT_CONTEXTS,
    createMarkedExtension: createHeadingAnchorExtension,
    tokenTypes: ["heading"],
  },
  // The ones below are shortcodes, so where each may be used is declared once
  // in the shared registry alongside its parameters and its help. This list
  // wires them into marked and takes that decision from there rather than
  // repeating it.
  {
    name: "mcCard",
    allowedContextMask: CARD_SHORTCODE.allowedContextMask,
    createMarkedExtension: createCardExtension,
    tokenTypes: ["mcCard", "mcCardRow"],
  },
  {
    // One extension for all three, because a spacer only means anything inside
    // a stack and the two stacks differ in nothing but their axis.
    name: "mcStack",
    allowedContextMask:
      VSTACK_SHORTCODE.allowedContextMask | HSTACK_SHORTCODE.allowedContextMask | SPACER_SHORTCODE.allowedContextMask,
    createMarkedExtension: createStackExtension,
    tokenTypes: ["mcStack", "mcSpacer"],
  },
  {
    // One extension for all three, because they differ only in what they point
    // at and every one of them checks that address the same way.
    name: "mcMedia",
    allowedContextMask:
      IMAGE_SHORTCODE.allowedContextMask | PDF_SHORTCODE.allowedContextMask | YOUTUBE_SHORTCODE.allowedContextMask,
    createMarkedExtension: createMediaExtension,
    tokenTypes: ["mcImage", "mcPdf", "mcYouTube"],
  },
  {
    name: "mcIcon",
    allowedContextMask: ICON_SHORTCODE.allowedContextMask,
    createMarkedExtension: createIconExtension,
    tokenTypes: ["mcIcon"],
  },
  {
    name: "mcPlans",
    allowedContextMask: PLANS_SHORTCODE.allowedContextMask,
    createMarkedExtension: createPlansExtension,
    tokenTypes: ["mcPlans"],
  },
  {
    name: "mcFields",
    allowedContextMask: FIELDS_SHORTCODE.allowedContextMask,
    createMarkedExtension: () => mcFieldsExtension,
    tokenTypes: ["mcFields"],
  },
  {
    name: "mcPill",
    allowedContextMask: PILL_SHORTCODE.allowedContextMask,
    createMarkedExtension: () => mcPillExtension,
    tokenTypes: ["mcPill"],
  },
  {
    name: "mcKbd",
    allowedContextMask: KBD_SHORTCODE.allowedContextMask,
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

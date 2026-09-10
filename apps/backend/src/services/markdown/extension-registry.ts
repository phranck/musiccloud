import {
  BUNDLED_CODE_FENCE_LANGUAGES,
  BUTTON_SHORTCODE,
  CARD_SHORTCODE,
  CODE_THEME,
  CODE_THEME_NAME,
  ContentContext,
  type ContentContextMask,
  FIELD_SHORTCODE,
  FIELDS_AUTO_LABEL_WIDTH,
  FIELDS_DEFAULT_ALIGNMENT,
  FIELDS_DEFAULT_GAP,
  FIELDS_DEFAULT_LABEL_WIDTH,
  FIELDS_DEFAULT_LAYOUT,
  FIELDS_SHORTCODE,
  type FieldsAlignmentValue,
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
  type SingleContentContext,
  SPACER_SHORTCODE,
  VSTACK_SHORTCODE,
  YOUTUBE_SHORTCODE,
} from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import markedFootnote from "marked-footnote";
import { markedHighlight } from "marked-highlight";
import { type BundledLanguage, type BundledTheme, createHighlighter, type HighlighterGeneric } from "shiki";
import mcQueryGrammar from "../grammars/mc-query.tmLanguage.json" with { type: "json" };
import { createButtonExtension } from "./button-extension.js";
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
  align: FieldsAlignmentValue;
}

interface McFieldsRow {
  /** The entry's name, already lexed. Markdown, so it may carry code or a link. */
  labelTokens: Token[];
  /** What stands beside it, already lexed. */
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
  /**
   * Builds the extension for one surface.
   *
   * The context is passed because a few extensions draw differently on each:
   * the portal is set in one hand and the site in another, and that is a
   * decision about the surface rather than about the page.
   */
  createMarkedExtension(context: SingleContentContext): MarkedExtension;
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
/**
 * The width of the label column, as CSS.
 *
 * A page writes a bare figure for pixels, a quoted percentage for a share of
 * the list, or a CSS length. Anything else falls back to the declared default,
 * because this value is interpolated into inline CSS.
 *
 * @param written - What the page wrote, or `undefined`.
 * @returns A value that is safe to put in `grid-template-columns`.
 */
function resolveLabelWidth(written: ShortcodeParamValue | undefined): string {
  const value = String(written ?? FIELDS_DEFAULT_LABEL_WIDTH).trim();
  if (value === FIELDS_AUTO_LABEL_WIDTH || value === FIELDS_DEFAULT_LABEL_WIDTH) return FIELDS_DEFAULT_LABEL_WIDTH;
  if (/^\d{1,4}$/.test(value)) return `${value}px`;
  if (/^\d{1,3}(?:\.\d+)?%$/.test(value)) return value;
  return isSafeCssLength(value) ? value : FIELDS_DEFAULT_LABEL_WIDTH;
}

function parseFieldsLayout(raw: string): FieldsLayout {
  const { params } = readShortcode(raw, FIELDS_SHORTCODE);
  const gap = String(params.gap ?? FIELDS_DEFAULT_GAP);

  return {
    // Already checked against the values the registry declares, so these are
    // among them and the cast states that rather than deciding it.
    mode: (params.layout ?? FIELDS_DEFAULT_LAYOUT) as FieldsLayoutModeValue,
    align: (params.align ?? FIELDS_DEFAULT_ALIGNMENT) as FieldsAlignmentValue,
    labelWidth: resolveLabelWidth(params.width),
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
    // The product's own colours rather than an editor theme's, so a shell
    // command reads as one on this background instead of on somebody else's.
    themes: [CODE_THEME],
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
          const html = highlighter.codeToHtml(code, { lang, theme: CODE_THEME_NAME });
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
 * Reads a fields list and its entries, if one begins here.
 *
 * Each entry is a `[[field]]`, which is a child rather than a shortcode of its
 * own: it means something inside a list and nothing at the top level of a page.
 * The list therefore carries no braces, because it holds its entries and
 * nothing else, and the tokenizer has already read them.
 *
 * Both halves of an entry are Markdown, which is why they are read as source
 * here and lexed by the caller rather than being split out of a line.
 *
 * @param source - What marked is offering, from the current position.
 * @param lexer - The lexer reading the document this list sits in.
 * @returns The raw source, the entries, and the resolved layout, or `null` when
 *   no fields list begins here.
 */
function readFieldsSource(
  source: string,
  lexer: { inline(text: string): unknown; blockTokens(text: string): unknown },
): { raw: string; rows: McFieldsRow[]; layout: FieldsLayout } | null {
  const node = readShortcodeAt(source, 0);
  if (!node || node.token !== FIELDS_SHORTCODE.token) return null;

  const rows: McFieldsRow[] = [];
  for (const child of node.children) {
    if (child.token !== FIELD_SHORTCODE.token) continue;

    const [parsed] = parseShortcodes(child.source.raw, [FIELD_SHORTCODE]);
    const label = typeof parsed?.params.label === "string" ? parsed.params.label.trim() : "";
    if (!label) continue;

    rows.push({
      // A label is a phrase, so it is lexed inline: a heading in one would
      // break the definition list it sits in.
      labelTokens: lexer.inline(label) as Token[],
      tokens: lexer.blockTokens((child.body ?? "").trim()) as Token[],
    });
  }

  return { raw: node.source.raw, rows, layout: parseFieldsLayout(node.source.raw) };
}

const mcFieldsExtension: MarkedExtension = {
  extensions: [
    {
      name: "mcFields",
      level: "block",
      start(source) {
        return source.match(/\[\[fields[\s\]]/)?.index;
      },
      tokenizer(source) {
        const read = readFieldsSource(source, this.lexer);
        if (!read) return;

        return {
          type: "mcFields",
          raw: read.raw,
          rows: read.rows,
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
            const label = this.parser.parseInline(row.labelTokens);
            const content = this.parser.parse(row.tokens);
            return `<dt>${label}${labelSuffix}</dt><dd>${content}</dd>`;
          })
          .join("");
        const classes = ["mc-fields", `mc-fields--${fields.layout.mode}`, `mc-fields--${fields.layout.align}`].join(
          " ",
        );
        const style = escapeHtmlAttribute(renderFieldsStyle(fields.layout));
        return `<dl class="${classes}" style="${style}">${rows}</dl>\n`;
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
    createMarkedExtension: (context) => createCardExtension(context),
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
    name: "mcButton",
    allowedContextMask: BUTTON_SHORTCODE.allowedContextMask,
    createMarkedExtension: (context) => createButtonExtension(context),
    tokenTypes: ["mcButton"],
  },
  {
    name: "mcIcon",
    allowedContextMask: ICON_SHORTCODE.allowedContextMask,
    createMarkedExtension: (context) => createIconExtension(context),
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

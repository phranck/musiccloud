/**
 * @file Renders `[[support-ladder]]` as a marker the site mounts the ladder on.
 *
 * The ladder is a component the reader operates, so the backend cannot draw
 * it. What it does is read the tree, render every text field as Markdown, add
 * who is paid from the sponsoring settings, and write the result as one JSON
 * value into an empty element. The site parses that value and draws the
 * ladder in its place.
 *
 * Who is paid comes from the site variables of the render, never from the
 * page, so a page cannot name a different account. A render without them,
 * such as a preview, carries an empty payee and the site draws no transfer
 * card.
 */

import {
  mapSupportLadderHtml,
  normalizeAccountCode,
  type ParsedShortcode,
  parseShortcodes,
  readShortcodeAt,
  readSupportLadderConfig,
  type ShortcodeParamValue,
  ShortcodeToken,
  type SiteVariableValues,
  SUPPORT_LADDER_ATTRIBUTE,
  SUPPORT_LADDER_LABEL_KEYS,
  SUPPORT_LADDER_SHORTCODE,
  type SupportLadderConfig,
  SupportRouteToken,
} from "@musiccloud/shared";
import type { MarkedExtension, MarkedOptions, Token, Tokens } from "marked";

/**
 * The parse option a render passes its site variables in.
 *
 * marked hands every parse option to the lexer and the parser unchanged, so
 * this is how one render reaches the ladder without state shared between
 * renders. `renderMarkdown` sets it; nothing else reads it.
 */
export const SITE_VALUES_OPTION = "mcSiteValues";

/** The parse options of a render, with the site variables it may carry. */
export type MarkdownRenderOptions = MarkedOptions & { [SITE_VALUES_OPTION]?: SiteVariableValues };

/** What the tokenizer hands the renderer. */
interface McSupportLadderToken extends Tokens.Generic {
  type: "mcSupportLadder";
  /** The configuration, with each text field replaced by its index into `texts`. */
  config: SupportLadderConfig;
  /** Every text field, lexed as Markdown. */
  texts: Token[][];
}

/** The routes a ladder may name, by their token, with the heading each takes when it names none. */
const ROUTE_FALLBACK_TITLES: Readonly<Record<string, string>> = {
  [SupportRouteToken.PaypalMe]: "PayPal",
  [SupportRouteToken.GithubSponsors]: "GitHub Sponsors",
};

/**
 * Turns the escape sequences an author types inside a quoted attribute into
 * the characters they stand for, so `\n` writes a line break into a text.
 *
 * @param value - The attribute as written.
 * @returns The text with `\n` and `\t` replaced.
 */
function unescapeText(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

/**
 * Reads a string parameter.
 *
 * @param value - The parameter as the parser resolved it.
 * @returns The trimmed text, unescaped, or empty when the parameter is absent
 *   or not a string.
 */
function text(value: ShortcodeParamValue | undefined): string {
  return typeof value === "string" ? unescapeText(value.trim()) : "";
}

/**
 * Reads an amount in euros as an author writes one.
 *
 * @param value - The parameter, such as `20` or `12,50`.
 * @returns The amount, or `NaN` when it is not a number. The shared reader
 *   drops anything that is not a positive amount.
 */
function amount(value: ShortcodeParamValue | undefined): number {
  return Number.parseFloat(text(value).replace(",", "."));
}

/**
 * The children of a node that carry one token.
 *
 * @param node - The parent.
 * @param token - The token looked for.
 * @returns The matching children, in order.
 */
function childrenOf(node: ParsedShortcode, token: string): ParsedShortcode[] {
  return node.children.filter((child) => child.token === token);
}

/**
 * Builds the ladder's configuration from its tree, before validation.
 *
 * Text fields hold the Markdown as written. The shared reader then keeps only
 * what fits the configuration's shape.
 *
 * @param ladder - The resolved `[[support-ladder]]` node.
 * @param siteValues - The render's site variables, or `undefined` when the
 *   render carries none.
 * @returns The configuration, or `null` when no tab offers anything.
 */
export function buildSupportLadderConfig(
  ladder: ParsedShortcode,
  siteValues: SiteVariableValues | undefined,
): SupportLadderConfig | null {
  const bankAccount = childrenOf(ladder, ShortcodeToken.BankAccount)[0];

  return readSupportLadderConfig({
    intervals: childrenOf(ladder, ShortcodeToken.Interval).map((interval) => {
      const custom = childrenOf(interval, ShortcodeToken.Custom)[0];
      return {
        key: interval.params.key,
        label: text(interval.params.label),
        text: text(interval.params.text),
        hint: text(interval.params.hint),
        belowMinimum: text(interval.params.belowMinimum),
        options: childrenOf(interval, ShortcodeToken.Option).map((option) => ({
          amountEur: amount(option.params.amount),
          description: text(option.params.description),
          recommended: option.params.recommended === true,
        })),
        custom: custom
          ? {
              label: text(custom.params.label),
              placeholder: text(custom.params.placeholder),
              text: text(custom.params.text),
            }
          : null,
      };
    }),
    bankAccount: bankAccount
      ? {
          purposeDonation: text(bankAccount.params.purposeDonation) || (siteValues?.purposeDonation ?? ""),
          purposeSponsor: text(bankAccount.params.purposeSponsor) || (siteValues?.purposeSponsor ?? ""),
          variants: childrenOf(bankAccount, ShortcodeToken.Variant).map((variant) => {
            const qr = childrenOf(variant, ShortcodeToken.QrCode)[0];
            return {
              key: variant.params.key,
              title: text(variant.params.title),
              text: text(variant.params.text),
              recommended: variant.params.recommended === true,
              icon: variant.params.icon,
              qr: qr ? { ...qr.params, image: text(qr.params.image) || undefined } : undefined,
              info: text(childrenOf(variant, ShortcodeToken.Info)[0]?.params.text),
            };
          }),
        }
      : null,
    routes: ladder.children
      .filter((child) => child.token in ROUTE_FALLBACK_TITLES)
      .map((route) => {
        const fallback = ROUTE_FALLBACK_TITLES[route.token];
        return {
          token: route.token,
          url: text(route.params.url),
          title: text(route.params.title) || fallback,
          text: text(route.params.text),
          hint: text(route.params.hint),
          button: text(route.params.button) || fallback,
          icon: route.params.icon,
        };
      }),
    payee: {
      name: siteValues?.payeeName ?? "",
      iban: normalizeAccountCode(siteValues?.payeeIban ?? ""),
      bic: normalizeAccountCode(siteValues?.payeeBic ?? ""),
    },
    minSponsorAmountEur: siteValues?.amountSponsorMin ?? 0,
    labels: Object.fromEntries(SUPPORT_LADDER_LABEL_KEYS.map((key) => [key, text(ladder.params[key])])),
  });
}

/**
 * Escapes a value for a double-quoted HTML attribute.
 *
 * @param value - The value.
 * @returns The value with `&`, `<`, `>` and `"` escaped.
 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The ladder as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createSupportLadderExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "mcSupportLadder",
        level: "block",
        start(source: string) {
          return source.match(/\[\[support-ladder[\s\]]/)?.index;
        },
        tokenizer(source: string) {
          const node = readShortcodeAt(source, 0);
          if (!node || node.token !== SUPPORT_LADDER_SHORTCODE.token) return;

          const [ladder] = parseShortcodes(node.source.raw, [SUPPORT_LADDER_SHORTCODE]);
          const siteValues = (this.lexer.options as MarkdownRenderOptions)[SITE_VALUES_OPTION];
          const built = ladder ? buildSupportLadderConfig(ladder, siteValues) : null;

          // Each text field is lexed here and rendered by the renderer, because
          // marked fills a block's inline tokens only once the whole document
          // is lexed. The field keeps its index into `texts` until then.
          const texts: Token[][] = [];
          const config = built
            ? mapSupportLadderHtml(built, (markdown) => {
                if (!markdown) return "";
                texts.push(this.lexer.blockTokens(markdown) as Token[]);
                return String(texts.length - 1);
              })
            : null;

          return {
            type: "mcSupportLadder",
            raw: node.source.raw,
            config,
            texts,
          } as McSupportLadderToken;
        },
        renderer(token) {
          const ladder = token as McSupportLadderToken;
          // A ladder with nothing to choose is worse than none, so it leaves no trace.
          if (!ladder.config) return "";
          const config = mapSupportLadderHtml(ladder.config, (index) =>
            index === "" ? "" : this.parser.parse(ladder.texts[Number(index)] ?? []),
          );
          return `<div ${SUPPORT_LADDER_ATTRIBUTE}="${escapeAttribute(JSON.stringify(config))}"></div>\n`;
        },
      },
    ],
  };
}

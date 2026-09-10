/**
 * @file Renders the button shortcode.
 *
 * A button is a link that has been given a shape, so it is still an anchor and
 * still goes where its target says. What the page decides is the label, the
 * symbol and which of the two treatments it takes; everything about how it
 * looks belongs to the stylesheet, which is why the treatment reaches CSS as a
 * class rather than as a declaration.
 */

import {
  BUTTON_DEFAULT_TONE,
  BUTTON_SHORTCODE,
  type ButtonToneValue,
  parseShortcodes,
  readShortcodeAt,
  type SingleContentContext,
} from "@musiccloud/shared";
import type { MarkedExtension, Tokens } from "marked";
import { iconSetFor, renderSymbol } from "./icon-extension.js";

/** The classes the stylesheet already gives a command, one per treatment. */
const TONE_CLASSES: Record<ButtonToneValue, string> = {
  accent: "button button--content",
  neutral: "button button--secondary",
};

/**
 * How large the symbol on a button is drawn.
 *
 * The hand-written pages set it with `size-6`, which is 24px, and a button's
 * label is not something a page varies the symbol against. Stated here rather
 * than offered as a parameter, because a button whose symbol is a different
 * size on every page stops reading as one control.
 */
const BUTTON_ICON_SIZE = 24;

/** An address a page may point a command at: this site, or somewhere over https. */
const SAFE_TARGET = /^(?:\/[^/\\]|https:\/\/)/;

interface McButtonToken extends Tokens.Generic {
  type: "mcButton";
  href: string;
  label: string;
  tone: ButtonToneValue;
  /** The symbol before the label, already drawn, or `null` where there is none. */
  symbol: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * The button shortcode as a marked extension.
 *
 * @param context - Which surface it renders for, which decides the icon set.
 * @returns The extension, ready to register.
 */
export function createButtonExtension(context: SingleContentContext): MarkedExtension {
  const set = iconSetFor(context);

  return {
    extensions: [
      {
        name: "mcButton",
        level: "inline",
        start(source: string) {
          return source.match(/\[\[button[\s\]]/)?.index;
        },
        tokenizer(source: string) {
          const node = readShortcodeAt(source, 0);
          if (!node || node.token !== BUTTON_SHORTCODE.token) return;

          const [parsed] = parseShortcodes(node.source.raw, [BUTTON_SHORTCODE]);
          const href = typeof parsed?.params.action === "string" ? parsed.params.action.trim() : "";
          const label = typeof parsed?.params.label === "string" ? parsed.params.label.trim() : "";

          // A command with nowhere to go, no words on it, or an address a reader
          // could not follow is left as text, so whoever wrote it sees why.
          if (!href || !label || !SAFE_TARGET.test(href)) return;

          const icon = typeof parsed?.params.icon === "string" ? parsed.params.icon.trim() : "";
          const tone = (
            typeof parsed?.params.tone === "string" ? parsed.params.tone : BUTTON_DEFAULT_TONE
          ) as ButtonToneValue;

          return {
            type: "mcButton",
            raw: node.source.raw,
            href,
            label,
            tone,
            // The symbol takes the label's colour, which each treatment sets, so
            // a page never names one.
            symbol: icon ? renderSymbol(set, icon, BUTTON_ICON_SIZE, "currentColor", "mc-button__icon") : null,
          } satisfies McButtonToken;
        },
        renderer(token) {
          const button = token as McButtonToken;
          const classes = `${TONE_CLASSES[button.tone]} mc-button`;
          return `<a class="${classes}" href="${escapeHtmlAttribute(button.href)}">${button.symbol ?? ""}${escapeHtml(button.label)}</a>`;
        },
      },
    ],
  };
}

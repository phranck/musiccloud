import parse, { domToReact, type Element, type HTMLReactParserOptions, type Text } from "html-react-parser";

import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { BioAnchor } from "@/components/markdown/BioAnchor";
import { linkify } from "@/lib/linkify";

/**
 * `html-react-parser` reports DOM nodes by a string `type` discriminant. Element
 * nodes (`"tag"`) carry the `data-card-*` wire markers we transform; text nodes
 * (`"text"`) carry the prose runs the optional linkifier scans for URLs/emails.
 */
const DomNodeType = {
  Tag: "tag",
  Text: "text",
} as const;

/**
 * Card-style markers the backend markdown renderer can attach to a `<pre>`
 * block via `data-card-style`. Anything outside this set is left untouched so
 * unknown values degrade to a plain `<pre>`.
 */
const CardStyle = {
  Recessed: "recessed",
  Embossed: "embossed",
} as const;

/**
 * Default geometry applied to a card-wrapped `<pre>` when the backend marker
 * omits `data-card-padding` / `data-card-radius`. Mirrors the previous inline
 * fallbacks so wrapped code blocks keep their exact spacing.
 */
const DEFAULT_CARD_PADDING = "0.75rem";
const DEFAULT_CARD_RADIUS = "0.75rem";

/** Concatenates the plain-text content of an anchor element's children. */
function anchorTextContent(el: Element): string {
  return el.children.map((child) => (child.type === DomNodeType.Text ? (child as Text).data : "")).join("");
}

/**
 * Builds the parser transform applied to every parsed markdown node. It rewrites
 * block-level `<pre data-card-style='recessed' | 'embossed'>` wire markers
 * emitted by the backend markdown renderer into the matching `RecessedCard` /
 * `EmbossedCard` primitive, stripping the marker attributes and adding a
 * `data-card-wrapped` sentinel so the prose class-maps can suppress the inner
 * `<pre>`'s own padding/background (the card now owns the geometry).
 *
 * When `linkifyText` is enabled, every plain-text run is additionally scanned for
 * URLs/emails which become `mc-cardlink` anchors (used for artist bios, whose
 * links arrive as escaped plain text). All other nodes pass through unchanged.
 *
 * @param linkifyText - When true, plain-text nodes are run through {@link linkify}.
 * @returns Parser options whose `replace` closes over the same instance for recursion.
 */
function makeParserOptions(linkifyText: boolean): HTMLReactParserOptions {
  const options: HTMLReactParserOptions = {
    replace(domNode) {
      if (linkifyText && domNode.type === DomNodeType.Text) {
        return <>{linkify((domNode as Text).data)}</>;
      }

      // Use duck-typing instead of instanceof — ESM/CJS dual-module issue causes
      // instanceof Element checks to fail depending on the import path.
      if (domNode.type !== DomNodeType.Tag) return undefined;
      const el = domNode as Element;

      // Bio links arrive as real <a href> (backend-sanitised); render them as
      // Card-Links with handle-only / brand-normalised display.
      if (linkifyText && el.name === "a" && el.attribs.href) {
        const text = anchorTextContent(el);
        if (text) return <BioAnchor rawHref={el.attribs.href} text={text} />;
      }

      if (el.name !== "pre") return undefined;
      const cardStyle = el.attribs["data-card-style"];
      if (cardStyle !== CardStyle.Recessed && cardStyle !== CardStyle.Embossed) return undefined;

      const padding = el.attribs["data-card-padding"] ?? DEFAULT_CARD_PADDING;
      const radius = el.attribs["data-card-radius"] ?? DEFAULT_CARD_RADIUS;

      // Strip the marker and data-card-* attrs, add a sentinel so the prose
      // class-maps can suppress the wrapped <pre>'s own padding/background
      // (the Card owns geometry now).
      const cleanAttribs = { ...el.attribs };
      delete cleanAttribs["data-card-style"];
      delete cleanAttribs["data-card-padding"];
      delete cleanAttribs["data-card-radius"];
      cleanAttribs["data-card-wrapped"] = "true";

      const inner = <pre {...cleanAttribs}>{domToReact(el.children as never, options)}</pre>;

      const cardProps = { padding, radius };
      return cardStyle === CardStyle.Recessed ? (
        <RecessedCard {...cardProps}>{inner}</RecessedCard>
      ) : (
        <EmbossedCard {...cardProps}>{inner}</EmbossedCard>
      );
    },
  };
  return options;
}

const parserOptions = makeParserOptions(false);
const parserOptionsLinkify = makeParserOptions(true);

/**
 * Single markdown injection site — every overlay/fullscreen content renderer
 * funnels through here. Input is server-sanitised by the backend markdown
 * renderer before it ever leaves `PublicContentPage.contentHtml`. Block-level
 * `<pre data-card-style='...'>` markers from the backend are converted to
 * `RecessedCard` / `EmbossedCard` wraps (see {@link makeParserOptions}).
 *
 * @param html - server-sanitised HTML string to render
 * @param className - prose class-map controlling element styling per surface
 * @param linkify - when true, plain-text URLs/emails become `mc-cardlink` anchors
 *   (opt-in for artist bios whose links arrive as escaped plain text)
 * @returns a `<div>` wrapping the parsed React tree
 */
export function MarkdownHtml({
  html,
  className,
  linkify: linkifyText = false,
}: {
  html: string;
  className?: string;
  linkify?: boolean;
}) {
  return <div className={className}>{parse(html, linkifyText ? parserOptionsLinkify : parserOptions)}</div>;
}

import parse, { domToReact, type Element, type HTMLReactParserOptions } from "html-react-parser";

import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";

/**
 * `html-react-parser` reports DOM nodes by a string `type` discriminant. Only
 * element nodes (`"tag"`) carry the `data-card-*` wire markers we transform, so
 * the parser callback narrows on this value before touching attributes.
 */
const DomNodeType = {
  Tag: "tag",
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

/**
 * Transform applied to every parsed markdown node. It rewrites block-level
 * `<pre data-card-style='recessed' | 'embossed'>` wire markers emitted by the
 * backend markdown renderer into the matching `RecessedCard` / `EmbossedCard`
 * primitive, stripping the marker attributes and adding a `data-card-wrapped`
 * sentinel so the prose class-maps can suppress the inner `<pre>`'s own
 * padding/background (the card now owns the geometry). All other nodes pass
 * through unchanged.
 */
const parserOptions: HTMLReactParserOptions = {
  replace(domNode) {
    // Use duck-typing instead of instanceof — ESM/CJS dual-module issue causes
    // instanceof Element checks to fail depending on the import path.
    if (domNode.type !== DomNodeType.Tag) return undefined;
    const el = domNode as Element;
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

    const inner = <pre {...cleanAttribs}>{domToReact(el.children as never, parserOptions)}</pre>;

    const cardProps = { padding, radius };
    return cardStyle === CardStyle.Recessed ? (
      <RecessedCard {...cardProps}>{inner}</RecessedCard>
    ) : (
      <EmbossedCard {...cardProps}>{inner}</EmbossedCard>
    );
  },
};

/**
 * Single markdown injection site — every overlay/fullscreen content renderer
 * funnels through here. Input is server-sanitised by the backend markdown
 * renderer before it ever leaves `PublicContentPage.contentHtml`. Block-level
 * `<pre data-card-style='...'>` markers from the backend are converted to
 * `RecessedCard` / `EmbossedCard` wraps (see {@link parserOptions}).
 *
 * @param html - server-sanitised HTML string to render
 * @param className - prose class-map controlling element styling per surface
 * @returns a `<div>` wrapping the parsed React tree
 */
export function MarkdownHtml({ html, className }: { html: string; className?: string }) {
  return <div className={className}>{parse(html, parserOptions)}</div>;
}

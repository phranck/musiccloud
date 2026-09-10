import { PLANS_PLACEHOLDER_ATTRIBUTE } from "@musiccloud/shared";
import { type DefaultTreeAdapterMap, parseFragment, serialize } from "parse5";

type HtmlChild = DefaultTreeAdapterMap["childNode"];
type HtmlElement = DefaultTreeAdapterMap["element"];
type HtmlParent = DefaultTreeAdapterMap["parentNode"];

const ALLOWED_ELEMENTS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "kbd",
  "li",
  "ol",
  "p",
  // A symbol and its two shapes. The path data never comes from a page: a page
  // names a Phosphor icon and the renderer looks the shapes up in the assets
  // this repository ships, so what reaches `d` is ours. Every other element is
  // absent from this list and every attribute is checked below, so nothing that
  // travels inside an SVG in the usual attacks survives: no script, no event
  // handler, no external reference.
  "path",
  "pre",
  "section",
  "span",
  "strong",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const DROP_WITH_CONTENT = new Set([
  "applet",
  "audio",
  "embed",
  "iframe",
  "math",
  "object",
  "script",
  "style",
  "template",
  "video",
]);

const GLOBAL_ATTRIBUTES = new Set(["aria-describedby", "aria-hidden", "aria-label", "class", "id", "role", "title"]);
const ELEMENT_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  // A video's link carries the shape it opens at, so the space it will take is
  // held before anything loads and the page does not jump.
  a: new Set(["data-footnote-backref", "data-footnote-ref", "href", "rel", "style"]),
  code: new Set(["class"]),
  // A row of cards carries the gap a page asked for. `sanitizeStyle` accepts
  // one property here, `gap`, and only as a plain CSS length, so nothing else
  // can travel in on a `div`. The plans marker carries no value at all.
  div: new Set([PLANS_PLACEHOLDER_ATTRIBUTE, "style"]),
  dl: new Set(["style"]),
  img: new Set(["alt", "height", "src", "width"]),
  input: new Set(["checked", "disabled", "type"]),
  li: new Set(["value"]),
  ol: new Set(["start"]),
  // The two shapes of a duotone symbol. `opacity` is what makes the second one
  // the lighter tone.
  path: new Set(["d", "opacity"]),
  pre: new Set(["data-card-padding", "data-card-radius", "data-card-style"]),
  span: new Set(["style"]),
  svg: new Set(["fill", "height", "viewBox", "width"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const CLASS_PATTERN = /^[A-Za-z0-9_:\- ]+$/;
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_:.-]*$/;
const CSS_LENGTH_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch)$/;
/** Two whole figures with a solidus between them, which is what an embedded video carries. */
const ASPECT_RATIO_PATTERN = /^\d{1,3} \/ \d{1,3}$/;
const SAFE_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
/** The characters a path is drawn from: the commands, the figures, and their separators. */
const SVG_PATH_PATTERN = /^[MmZzLlHhVvCcSsQqTtAa0-9eE,.\s+-]+$/;
const SVG_OPACITY_PATTERN = /^(?:0|1|0?\.\d+)$/;
/**
 * The boxes an icon may be drawn in, one per set.
 *
 * The two sets draw at different scales, and a shape against the wrong box is
 * the wrong size, so both are named rather than one being assumed.
 */
const SVG_VIEW_BOXES = new Set(["0 0 256 256", "0 0 24 24"]);
/** A colour a symbol may be drawn in, which is a hex figure, a name, or a token. */
const SAFE_FILL_PATTERN = /^(?:currentColor|#[0-9a-f]{3,8}|[a-z]+|var\(--[a-z0-9-]+\))$/i;
const SAFE_URL_PROTOCOLS = new Set(["http", "https", "mailto", "tel"]);
const SAFE_IMAGE_PROTOCOLS = new Set(["http", "https"]);

function sanitizeUrl(value: string, protocols: ReadonlySet<string>): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const compact = [...normalized]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x20 && codePoint !== 0x7f;
    })
    .join("");
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  if (scheme && !protocols.has(scheme)) return null;
  return normalized;
}

function sanitizeStyle(value: string): string | null {
  const declarations: string[] = [];
  for (const rawDeclaration of value.split(";")) {
    const separator = rawDeclaration.indexOf(":");
    if (separator < 1) continue;
    const property = rawDeclaration.slice(0, separator).trim().toLowerCase();
    const candidate = rawDeclaration.slice(separator + 1).trim();
    if (property === "color" && SAFE_COLOR_PATTERN.test(candidate)) declarations.push(`color:${candidate}`);
    else if (property === "font-style" && (candidate === "italic" || candidate === "normal")) {
      declarations.push(`font-style:${candidate}`);
    } else if (property === "display" && candidate === "grid") declarations.push("display:grid");
    else if (
      property === "grid-template-columns" &&
      (candidate === "max-content minmax(0, 1fr)" ||
        /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch) minmax\(0, 1fr\)$/.test(candidate))
    ) {
      declarations.push(`grid-template-columns:${candidate}`);
    } else if (property === "column-gap" && CSS_LENGTH_PATTERN.test(candidate)) {
      declarations.push(`column-gap:${candidate}`);
    } else if (property === "gap" && CSS_LENGTH_PATTERN.test(candidate)) {
      declarations.push(`gap:${candidate}`);
    } else if ((property === "flex-basis" || property === "height") && CSS_LENGTH_PATTERN.test(candidate)) {
      // A fixed spacer carries both, because which of them applies depends on
      // the stack around it and the renderer cannot know that from where it
      // stands.
      declarations.push(`${property}:${candidate}`);
    } else if (property === "aspect-ratio" && ASPECT_RATIO_PATTERN.test(candidate)) {
      declarations.push(`aspect-ratio:${candidate}`);
    }
  }
  return declarations.length > 0 ? declarations.join(";") : null;
}

function sanitizedAttributeValue(element: HtmlElement, name: string, value: string): string | null {
  if (name === "class") return CLASS_PATTERN.test(value) ? value : null;
  if (name === "id") return ID_PATTERN.test(value) ? value : null;
  if (name === "href") return sanitizeUrl(value, SAFE_URL_PROTOCOLS);
  if (name === "src") return sanitizeUrl(value, SAFE_IMAGE_PROTOCOLS);
  if (name === "style") return sanitizeStyle(value);
  if (name === "rel") return value === "nofollow" || value === "noopener noreferrer" ? value : null;
  if (name === "type") return element.tagName === "input" && value === "checkbox" ? value : null;
  if (["colspan", "height", "rowspan", "start", "value", "width"].includes(name)) {
    return /^\d+$/.test(value) ? value : null;
  }
  if (name === "scope") return ["col", "colgroup", "row", "rowgroup"].includes(value) ? value : null;
  if (name === "d") return SVG_PATH_PATTERN.test(value) ? value : null;
  if (name === "opacity") return SVG_OPACITY_PATTERN.test(value) ? value : null;
  if (name === "viewBox") return SVG_VIEW_BOXES.has(value) ? value : null;
  if (name === "fill") return SAFE_FILL_PATTERN.test(value) ? value : null;
  if (name === "data-card-style") return value === "embossed" || value === "recessed" ? value : null;
  if (name === "data-card-padding" || name === "data-card-radius") {
    return CSS_LENGTH_PATTERN.test(value) ? value : null;
  }
  // The plans marker says where the plans go and nothing more, so whatever a
  // page wrote after it is dropped and the bare attribute survives.
  if (name === PLANS_PLACEHOLDER_ATTRIBUTE) return "";
  return value;
}

function sanitizeAttributes(element: HtmlElement): void {
  const allowedForElement = ELEMENT_ATTRIBUTES[element.tagName] ?? new Set<string>();
  element.attrs = element.attrs.flatMap((attribute) => {
    if (!GLOBAL_ATTRIBUTES.has(attribute.name) && !allowedForElement.has(attribute.name)) return [];
    const value = sanitizedAttributeValue(element, attribute.name, attribute.value);
    return value === null ? [] : [{ ...attribute, value }];
  });
}

/**
 * Whether a paragraph has nothing left in it.
 *
 * A block element inside a paragraph splits that paragraph in two, and one of
 * the halves is usually empty. That happens whenever a shortcode which stands
 * in a line of text renders a block, such as a symbol whose caption is a
 * heading. An empty paragraph draws nothing and still takes the spacing every
 * paragraph gets, so it reads as a gap nobody asked for.
 *
 * @param element - The element to weigh.
 * @returns Whether it is a paragraph holding neither text nor an element.
 */
function isEmptyParagraph(element: HtmlElement): boolean {
  if (element.tagName !== "p") return false;
  return element.childNodes.every(
    (child) => child.nodeName === "#text" && (child as { value?: string }).value?.trim() === "",
  );
}

function sanitizeChild(child: HtmlChild, parent: HtmlParent): HtmlChild[] {
  if (child.nodeName === "#comment" || child.nodeName === "#documentType") return [];
  if (child.nodeName === "#text") return [child];

  const element = child as HtmlElement;
  if (DROP_WITH_CONTENT.has(element.tagName)) return [];
  sanitizeChildren(element);
  if (!ALLOWED_ELEMENTS.has(element.tagName)) {
    for (const nestedChild of element.childNodes) nestedChild.parentNode = parent;
    return element.childNodes;
  }

  if (isEmptyParagraph(element)) return [];

  sanitizeAttributes(element);
  return [element];
}

function sanitizeChildren(parent: HtmlParent): void {
  parent.childNodes = parent.childNodes.flatMap((child) => sanitizeChild(child, parent));
}

/** Allowlist-sanitizes rendered Markdown before it crosses a public HTML injection boundary. */
export function sanitizeMarkdownHtml(html: string): string {
  const fragment = parseFragment(html);
  sanitizeChildren(fragment);
  return serialize(fragment);
}

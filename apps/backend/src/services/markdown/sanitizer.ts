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
  "pre",
  "section",
  "span",
  "strong",
  "sup",
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
  "svg",
  "template",
  "video",
]);

const GLOBAL_ATTRIBUTES = new Set(["aria-describedby", "aria-hidden", "aria-label", "class", "id", "role", "title"]);
const ELEMENT_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["data-footnote-backref", "data-footnote-ref", "href", "rel"]),
  code: new Set(["class"]),
  dl: new Set(["style"]),
  img: new Set(["alt", "height", "src", "width"]),
  input: new Set(["checked", "disabled", "type"]),
  li: new Set(["value"]),
  ol: new Set(["start"]),
  pre: new Set(["data-card-padding", "data-card-radius", "data-card-style"]),
  span: new Set(["style"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const CLASS_PATTERN = /^[A-Za-z0-9_:\- ]+$/;
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_:.-]*$/;
const CSS_LENGTH_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch)$/;
const SAFE_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
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
  if (name === "data-card-style") return value === "embossed" || value === "recessed" ? value : null;
  if (name === "data-card-padding" || name === "data-card-radius") {
    return CSS_LENGTH_PATTERN.test(value) ? value : null;
  }
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

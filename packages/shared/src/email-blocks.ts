/**
 * @file Email-Body-Block-Modell (MC-078). Der Body eines Templates ist ein
 * geordnetes Array dieser Blöcke; Backend-Renderer und Dashboard-Editor
 * teilen sich diese Typen, damit gespeicherte und gerenderte Struktur nie
 * auseinanderlaufen.
 */

/** Diskriminanten-Namespace der Block-Typen (PascalCase-Members, project domain-literals policy). */
export const EmailBlockType = {
  /** Markdown-Text (Überschrift/Absatz), interpoliert `{{var}}`. */
  Text: "text",
  /** Call-to-Action-Button; `url` interpoliert `{{var}}`. */
  Button: "button",
  /** Bild aus {@link email_assets}, referenziert per `assetId`. */
  Image: "image",
  /** Horizontale Trennlinie. */
  Divider: "divider",
  /** Vertikaler Leerraum fester Höhe. */
  Spacer: "spacer",
} as const;

/** Ein {@link EmailBlockType}-Wert. */
export type EmailBlockTypeValue = (typeof EmailBlockType)[keyof typeof EmailBlockType];

/** Text-Block: Markdown, `{{var}}`-interpoliert. */
export interface EmailTextBlock {
  type: typeof EmailBlockType.Text;
  markdown: string;
}

/** Button-Block: sichtbares Label + Ziel-URL (`{{var}}`-interpoliert). */
export interface EmailButtonBlock {
  type: typeof EmailBlockType.Button;
  label: string;
  url: string;
}

/** Bild-Block: Asset-Referenz + Alt-Text. */
export interface EmailImageBlock {
  type: typeof EmailBlockType.Image;
  assetId: string;
  altText: string;
}

/** Trennlinie ohne Konfiguration. */
export interface EmailDividerBlock {
  type: typeof EmailBlockType.Divider;
}

/** Leerraum-Block mit Pixel-Höhe. */
export interface EmailSpacerBlock {
  type: typeof EmailBlockType.Spacer;
  heightPx: number;
}

/** Ein Body-Block. */
export type EmailBlock = EmailTextBlock | EmailButtonBlock | EmailImageBlock | EmailDividerBlock | EmailSpacerBlock;

/** Matches a leading URI scheme (e.g. `https:`, `javascript:`) at the start of a string. */
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Schemes a button block's `url` may start with. Anything else (`javascript:`, `data:`, `vbscript:`, ...) is rejected. */
const ALLOWED_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Rejects dangerous URI schemes (`javascript:`, `data:`, ...) in a button
 * block's `url` before it can reach an `href` attribute. A `url` may also be
 * a bare `{{variable}}` placeholder with no literal scheme at all (resolved
 * later from action-supplied, backend-trusted values) or a schemeless
 * relative path — neither can execute as a pseudo-protocol, so both are safe
 * and this check only inspects a literal scheme when one is actually present.
 *
 * @param url - the button block's (still uninterpolated) `url` field.
 * @returns `true` when the URL has no scheme, or an allow-listed one.
 */
function hasSafeUrlScheme(url: string): boolean {
  const match = url.match(URL_SCHEME_PATTERN);
  if (!match) return true;
  return ALLOWED_URL_SCHEMES.has(match[0].toLowerCase());
}

/**
 * Prüft, ob ein unbekannter Wert ein wohlgeformtes `EmailBlock[]` ist. Nutzt
 * die Route-/Service-Schicht zur Body-Validierung, bevor Blöcke persistiert
 * oder gerendert werden.
 *
 * @param value - zu prüfender Wert (typisch aus einem JSON-Body / einer DB-Spalte).
 * @returns `true` nur, wenn jedes Element ein gültiger Block ist.
 */
export function isEmailBlockArray(value: unknown): value is EmailBlock[] {
  if (!Array.isArray(value)) return false;
  return value.every((b) => {
    if (!b || typeof b !== "object") return false;
    const block = b as Record<string, unknown>;
    switch (block.type) {
      case EmailBlockType.Text:
        return typeof block.markdown === "string";
      case EmailBlockType.Button:
        return typeof block.label === "string" && typeof block.url === "string" && hasSafeUrlScheme(block.url);
      case EmailBlockType.Image:
        return typeof block.assetId === "string" && typeof block.altText === "string";
      case EmailBlockType.Divider:
        return true;
      case EmailBlockType.Spacer:
        return typeof block.heightPx === "number" && Number.isFinite(block.heightPx);
      default:
        return false;
    }
  });
}

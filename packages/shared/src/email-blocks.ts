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
export type EmailBlock =
  | EmailTextBlock
  | EmailButtonBlock
  | EmailImageBlock
  | EmailDividerBlock
  | EmailSpacerBlock;

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
        return typeof block.label === "string" && typeof block.url === "string";
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

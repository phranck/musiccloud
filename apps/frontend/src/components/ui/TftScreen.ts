import {
  TftScreenCover,
  TftScreenGrid,
  TftScreenRoot,
  TftScreenShadow,
  TftScreenSheen,
  TftScreenTint,
} from "@/components/ui/TftScreenParts";

/**
 * `TftScreen` compound: the album-cover TFT screen and its composable layers.
 *
 * The root renders the token-driven screen frame; the artwork and the overlay
 * stack are composed explicitly from the attached members, so a caller picks
 * exactly the layers it needs (the share cover wants the full stack; the artist
 * thumbnail wants only the cover plus the inset shadow). Every overlay is pinned
 * by a fixed `z-index` in `animations.css`, so the rendered stack order never
 * depends on the order the members appear in JSX:
 * - `TftScreen.Cover` — the artwork content layer (`z-index: 0`), either an
 *   `image` shortcut or bespoke `children`.
 * - `TftScreen.Tint` — the art-tint wash (`z-index: 1`).
 * - `TftScreen.Grid` — the LCD dot-matrix grid (`z-index: 10`).
 * - `TftScreen.Sheen` — the glass-glare gradient (`z-index: 15`).
 * - `TftScreen.Shadow` — the inset frame shadow (`z-index: 20`).
 *
 * Assembled with `Object.assign` in this `.ts` module (mirroring
 * `TurntablePlayer.ts`) so the namespace value stays out of the `.tsx` parts
 * file, which exports only components (react-doctor `Maintainability:
 * Non-component export in component file`).
 */
export const TftScreen = Object.assign(TftScreenRoot, {
  Cover: TftScreenCover,
  Tint: TftScreenTint,
  Grid: TftScreenGrid,
  Sheen: TftScreenSheen,
  Shadow: TftScreenShadow,
});

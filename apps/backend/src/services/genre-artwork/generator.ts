/**
 * Genre artwork composition, in the visual spirit of Spotify's
 * "Genres & Moods" grid:
 *   - flat tile in the cover's average color
 *   - large genre name in the upper-left, Roboto Condensed;
 *     black-on-light / white-on-dark via luminance of the tile,
 *     with a subtle counter-coloured drop shadow for safety margin.
 *     Word-wraps to 2 lines and auto-shrinks for long names.
 *   - rotated album cover with a subtle drop shadow, tucked into the
 *     lower-right, partially clipped
 *
 * Deterministic: same (displayName, coverBuffer, tileColor) always yields
 * identical bytes. We cache by `genreKey` alone, so regeneration for the
 * same genre produces byte-identical output.
 */

import path from "node:path";
import { Jimp, type JimpInstance, rgbaToInt } from "jimp";
import type opentype from "opentype.js";

const SIZE = 512;
const JPEG_QUALITY = 82;
const COVER_SIZE = 320;
const COVER_CORNER_RADIUS = 24;
const COVER_ROTATION_DEG = -18;
const COVER_CENTER_X = 380;
const COVER_CENTER_Y = 380;
const TEXT_X = 32;
const TEXT_TOP_Y = 32;
const TEXT_MAX_WIDTH = SIZE - TEXT_X * 2; // 448px for a 512px tile
const TEXT_MAX_LINES = 2;
const TEXT_SIZE_STEPS = [56, 50, 44, 40, 36];
const TEXT_LINE_HEIGHT_FACTOR = 1.0; // tight, matches the condensed aesthetic
const COVER_SHADOW_OFFSET_X = 4;
const COVER_SHADOW_OFFSET_Y = 8;
const COVER_SHADOW_ALPHA = 0.45;
const COVER_SHADOW_BLUR = 8;
const TEXT_SHADOW_OFFSET_X = 2;
const TEXT_SHADOW_OFFSET_Y = 3;
const TEXT_SHADOW_ALPHA = 0.55;
const TEXT_SHADOW_BLUR = 3;

// `__dirname` after tsup bundling is `apps/backend/dist/`; the
// `copy-jimp-fonts.mjs` build step writes the TTF into
// `apps/backend/dist/fonts/` so this path resolves at runtime in both
// dev (tsup --watch) and Zerops production.
const FONT_PATH = path.join(__dirname, "fonts", "RobotoCondensed-Bold.woff");

let fontPromise: Promise<opentype.Font> | null = null;
function getFont(): Promise<opentype.Font> {
  // Lazy require so opentype.js (a CJS module with non-writable exports)
  // is not evaluated until text actually needs rendering. Touching it at
  // module-load time trips vitest's ESM wrapper during test bootstrap.
  if (!fontPromise) {
    fontPromise = (async () => {
      const mod = (await import("opentype.js")) as unknown as { default: typeof opentype } & typeof opentype;
      const api = mod.default ?? mod;
      return api.load(FONT_PATH);
    })();
  }
  return fontPromise;
}

// ─── Path → edge-list → scanline fill ────────────────────────────────────

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const CURVE_STEPS = 12;

function flattenCommands(commands: opentype.PathCommand[]): Edge[] {
  const edges: Edge[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  for (const cmd of commands) {
    if (cmd.type === "M") {
      cx = cmd.x;
      cy = cmd.y;
      sx = cmd.x;
      sy = cmd.y;
    } else if (cmd.type === "L") {
      edges.push({ x1: cx, y1: cy, x2: cmd.x, y2: cmd.y });
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === "Q") {
      let px = cx;
      let py = cy;
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        const nx = u * u * cx + 2 * u * t * cmd.x1 + t * t * cmd.x;
        const ny = u * u * cy + 2 * u * t * cmd.y1 + t * t * cmd.y;
        edges.push({ x1: px, y1: py, x2: nx, y2: ny });
        px = nx;
        py = ny;
      }
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === "C") {
      let px = cx;
      let py = cy;
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        const nx = u * u * u * cx + 3 * u * u * t * cmd.x1 + 3 * u * t * t * cmd.x2 + t * t * t * cmd.x;
        const ny = u * u * u * cy + 3 * u * u * t * cmd.y1 + 3 * u * t * t * cmd.y2 + t * t * t * cmd.y;
        edges.push({ x1: px, y1: py, x2: nx, y2: ny });
        px = nx;
        py = ny;
      }
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === "Z") {
      if (cx !== sx || cy !== sy) edges.push({ x1: cx, y1: cy, x2: sx, y2: sy });
      cx = sx;
      cy = sy;
    }
  }
  return edges;
}

/**
 * Supersampled scanline polygon fill.
 *
 * For each pixel row, sample at `SAMPLES_PER_PIXEL` sub-rows and count how
 * many are inside the path. The resulting 0-1 coverage value drives the
 * alpha channel of a white pixel — that's the anti-aliasing.
 *
 * Fast enough for one artwork per genre: ~512 rows × ~200 edges × 4
 * samples is well under 10 ms on modern hardware.
 */
const SAMPLES_PER_PIXEL = 4;

function fillPath(img: JimpInstance, edges: Edge[], color: [number, number, number]): void {
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  let minY = h;
  let maxY = 0;
  for (const e of edges) {
    const loY = Math.min(e.y1, e.y2);
    const hiY = Math.max(e.y1, e.y2);
    if (loY < minY) minY = loY;
    if (hiY > maxY) maxY = hiY;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(h - 1, Math.ceil(maxY));

  for (let y = y0; y <= y1; y++) {
    // For each column x, count samples inside the path.
    const coverage = new Float32Array(w);

    for (let s = 0; s < SAMPLES_PER_PIXEL; s++) {
      const yRow = y + (s + 0.5) / SAMPLES_PER_PIXEL;
      const xs: number[] = [];
      for (const e of edges) {
        if (e.y1 === e.y2) continue;
        const below1 = e.y1 > yRow;
        const below2 = e.y2 > yRow;
        if (below1 === below2) continue;
        const x = e.x1 + ((yRow - e.y1) / (e.y2 - e.y1)) * (e.x2 - e.x1);
        xs.push(x);
      }
      xs.sort((a, b) => a - b);

      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xStart = Math.max(0, xs[i]);
        const xEnd = Math.min(w, xs[i + 1]);
        const startCol = Math.floor(xStart);
        const endCol = Math.min(w - 1, Math.floor(xEnd));
        if (startCol > endCol) continue;
        // Partial coverage for the start and end columns, full for the rest.
        coverage[startCol] += (Math.min(startCol + 1, xEnd) - xStart) / SAMPLES_PER_PIXEL;
        if (endCol > startCol) {
          for (let col = startCol + 1; col < endCol; col++) coverage[col] += 1 / SAMPLES_PER_PIXEL;
          coverage[endCol] += (xEnd - endCol) / SAMPLES_PER_PIXEL;
        }
      }
    }

    for (let x = 0; x < w; x++) {
      const c = coverage[x];
      if (c <= 0) continue;
      const a = Math.min(255, Math.round(c * 255));
      const idx = (y * w + x) * 4;
      const prevA = img.bitmap.data[idx + 3];
      if (a <= prevA) continue;
      img.bitmap.data[idx] = color[0];
      img.bitmap.data[idx + 1] = color[1];
      img.bitmap.data[idx + 2] = color[2];
      img.bitmap.data[idx + 3] = a;
    }
  }
}

/**
 * Pick the best split point for a two-line layout. We prefer the split
 * that fits both lines AND minimises the width imbalance — that gives
 * the most visually balanced block.
 *
 * Returns `null` if no split can make both lines fit `maxWidth`.
 */
function pickSplit(font: opentype.Font, words: string[], maxWidth: number, size: number): [string, string] | null {
  if (words.length < 2) return null;
  let best: { line1: string; line2: string; imbalance: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const w1 = font.getAdvanceWidth(line1, size);
    const w2 = font.getAdvanceWidth(line2, size);
    if (w1 > maxWidth || w2 > maxWidth) continue;
    const imbalance = Math.abs(w1 - w2);
    if (!best || imbalance < best.imbalance) best = { line1, line2, imbalance };
  }
  return best ? [best.line1, best.line2] : null;
}

/**
 * Lay out the genre name: try to fit in one line at the largest size,
 * then two-line word-wrap, then step fontSize down. If even the smallest
 * size with a two-line wrap doesn't fit, we accept the overflow at the
 * smallest size rather than truncate — the frontend's `object-cover` in
 * the grid tile will soft-clip whatever runs past the edge.
 */
function layoutText(font: opentype.Font, text: string): { lines: string[]; fontSize: number } {
  const words = text.split(/\s+/).filter(Boolean);
  for (const size of TEXT_SIZE_STEPS) {
    const oneLine = font.getAdvanceWidth(text, size);
    if (oneLine <= TEXT_MAX_WIDTH) return { lines: [text], fontSize: size };
    if (TEXT_MAX_LINES >= 2) {
      const split = pickSplit(font, words, TEXT_MAX_WIDTH, size);
      if (split) return { lines: split, fontSize: size };
    }
  }
  const minSize = TEXT_SIZE_STEPS[TEXT_SIZE_STEPS.length - 1];
  if (TEXT_MAX_LINES >= 2 && words.length >= 2) {
    const mid = Math.ceil(words.length / 2);
    return { lines: [words.slice(0, mid).join(" "), words.slice(mid).join(" ")], fontSize: minSize };
  }
  return { lines: [text], fontSize: minSize };
}

function pathToTextCanvas(
  font: opentype.Font,
  text: string,
  fontSize: number,
  color: [number, number, number],
): { canvas: JimpInstance; baselineInCanvas: number } | null {
  const otPath = font.getPath(text, 0, 0, fontSize);
  const edges = flattenCommands(otPath.commands);
  if (edges.length === 0) return null;

  const bb = otPath.getBoundingBox();
  const padding = 4;
  const canvasW = Math.max(1, Math.ceil(bb.x2 - bb.x1) + padding * 2);
  const canvasH = Math.max(1, Math.ceil(bb.y2 - bb.y1) + padding * 2);

  const dx = padding - bb.x1;
  const dy = padding - bb.y1;
  for (const e of edges) {
    e.x1 += dx;
    e.y1 += dy;
    e.x2 += dx;
    e.y2 += dy;
  }

  const canvas = new Jimp({ width: canvasW, height: canvasH, color: 0 }) as JimpInstance;
  fillPath(canvas, edges, color);
  return { canvas, baselineInCanvas: dy };
}

/**
 * Multiply the alpha of `img` with a rounded-rectangle mask so the thumb
 * gets slightly-rounded corners. Antialiased at the edge via sub-pixel
 * distance to the corner centre.
 */
function applyRoundedCorners(img: JimpInstance, radius: number): void {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const r = Math.min(radius, Math.floor(Math.min(w, h) / 2));
  if (r <= 0) return;

  img.scan(0, 0, w, h, (x, y, idx) => {
    const cx = x < r ? r : x > w - r - 1 ? w - r - 1 : x;
    const cy = y < r ? r : y > h - r - 1 ? h - r - 1 : y;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let factor = 1;
    if (dist > r) factor = 0;
    else if (dist > r - 1) factor = r - dist;
    if (factor < 1) img.bitmap.data[idx + 3] = Math.round(img.bitmap.data[idx + 3] * factor);
  });
}

/**
 * Generate a drop-shadow image for any alpha-bearing source. Clones the
 * source, replaces every opaque pixel's RGB with the shadow colour at a
 * fraction of the original alpha, then gaussian-blurs. Same technique we
 * use for the album cover shadow.
 */
function buildShadow(
  source: JimpInstance,
  color: [number, number, number],
  alphaFactor: number,
  blur: number,
): JimpInstance {
  const shadow = source.clone() as JimpInstance;
  shadow.scan(0, 0, shadow.bitmap.width, shadow.bitmap.height, (_x, _y, idx) => {
    const a = shadow.bitmap.data[idx + 3];
    if (a === 0) return;
    shadow.bitmap.data[idx] = color[0];
    shadow.bitmap.data[idx + 1] = color[1];
    shadow.bitmap.data[idx + 2] = color[2];
    shadow.bitmap.data[idx + 3] = Math.round(a * alphaFactor);
  });
  if (blur > 0) shadow.blur(blur);
  return shadow;
}

/**
 * Render the genre name at TEXT_X/TEXT_TOP_Y onto `target`. Word-wraps
 * to TEXT_MAX_LINES, auto-shrinks for long names, colours by tile
 * luminance contrast, and drops a counter-coloured shadow underneath.
 */
async function drawGenreText(
  target: JimpInstance,
  text: string,
  color: [number, number, number],
  shadowColor: [number, number, number],
): Promise<void> {
  const font = await getFont();
  const { lines, fontSize } = layoutText(font, text);
  const lineHeight = Math.round(fontSize * TEXT_LINE_HEIGHT_FACTOR);

  // Ascender tells us how far above the baseline the glyphs reach. Using
  // the font metric means the very top of capital letters lands exactly
  // on TEXT_TOP_Y regardless of the chosen font size.
  const ascenderPx = (font.ascender / font.unitsPerEm) * fontSize;

  for (let i = 0; i < lines.length; i++) {
    const rendered = pathToTextCanvas(font, lines[i], fontSize, color);
    if (!rendered) continue;
    const baselineY = TEXT_TOP_Y + ascenderPx + i * lineHeight;
    const canvasTop = baselineY - rendered.baselineInCanvas;

    const shadow = buildShadow(rendered.canvas, shadowColor, TEXT_SHADOW_ALPHA, TEXT_SHADOW_BLUR);
    target.composite(
      shadow,
      Math.round(TEXT_X - 4 + TEXT_SHADOW_OFFSET_X),
      Math.round(canvasTop + TEXT_SHADOW_OFFSET_Y),
    );
    target.composite(rendered.canvas, Math.round(TEXT_X - 4), Math.round(canvasTop));
  }
}

// ─── Composition ────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export async function generateArtwork(
  displayName: string,
  coverBuffer: Buffer | null,
  tileColorHex: string,
): Promise<Buffer> {
  const [r, g, b] = hexToRgb(tileColorHex);

  // 1. Base: flat fill in the cover's average color.
  const img = new Jimp({ width: SIZE, height: SIZE, color: rgbaToInt(r, g, b, 255) }) as JimpInstance;

  // 2. Cover thumbnail: rotated, tucked into the lower-right with a
  //    deliberate off-canvas crop and a subtle drop shadow. Skipped if
  //    no cover was available for this genre. Rounded corners are applied
  //    before rotation — that also gives the thumb a real alpha channel,
  //    so `rotate()` fills the grown bounding box with transparency
  //    instead of edge-colour pixels.
  if (coverBuffer) {
    try {
      const thumb = (await Jimp.read(coverBuffer)) as JimpInstance;
      thumb.resize({ w: COVER_SIZE, h: COVER_SIZE });
      applyRoundedCorners(thumb, COVER_CORNER_RADIUS);
      thumb.rotate(COVER_ROTATION_DEG);

      // Drop shadow for the cover: solid-black version at reduced alpha,
      // gaussian-blurred, composited before the real cover goes on top.
      const coverShadow = buildShadow(thumb, [0, 0, 0], COVER_SHADOW_ALPHA, COVER_SHADOW_BLUR);
      const px = COVER_CENTER_X - thumb.bitmap.width / 2;
      const py = COVER_CENTER_Y - thumb.bitmap.height / 2;
      img.composite(coverShadow, Math.round(px) + COVER_SHADOW_OFFSET_X, Math.round(py) + COVER_SHADOW_OFFSET_Y);
      img.composite(thumb, Math.round(px), Math.round(py));
    } catch {
      // Decode failure → keep tile without the thumb; not a fatal error.
    }
  }

  // 3. Genre name, upper-left. Colour decided by tile luminance so the
  //    text stays legible on both light and dark fills; a counter-coloured
  //    drop shadow adds safety margin around the luminance cut-off.
  //    Word-wraps to TEXT_MAX_LINES and auto-shrinks for long names.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const textColor: [number, number, number] = luminance > 0.6 ? [0, 0, 0] : [255, 255, 255];
  const shadowColor: [number, number, number] = luminance > 0.6 ? [255, 255, 255] : [0, 0, 0];
  await drawGenreText(img, displayName.toUpperCase(), textColor, shadowColor);

  // 4. Encode.
  return img.getBuffer("image/jpeg", { quality: JPEG_QUALITY });
}

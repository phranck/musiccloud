/**
 * Server-side color extraction from a cover image buffer.
 *
 * Decodes + downscales with jimp (pure JS), then delegates to the shared
 * `sampleAccentFromRgba` helper so the math is literally the same code as
 * the frontend Canvas path in `apps/frontend/src/lib/ui/colors.ts`.
 *
 * Returns both the average color (used as the genre tile fill — this is
 * what the user means by "Durchschnittsfarbe des Covers") and the
 * saturation-weighted accent (kept for future hover/border styling).
 */

import { type DynamicAccent, sampleAccentFromRgba, toHex } from "@musiccloud/shared";
import { Jimp } from "jimp";

const SAMPLE_SIZE = 64;

export async function extractColorsFromBuffer(
  buffer: Buffer,
): Promise<{ avgHex: string; accent: DynamicAccent | null }> {
  const img = await Jimp.read(buffer);
  img.resize({ w: SAMPLE_SIZE, h: SAMPLE_SIZE });
  const { accent, avgRgb } = sampleAccentFromRgba(img.bitmap.data, SAMPLE_SIZE * SAMPLE_SIZE);
  return { avgHex: toHex(avgRgb[0], avgRgb[1], avgRgb[2]), accent };
}

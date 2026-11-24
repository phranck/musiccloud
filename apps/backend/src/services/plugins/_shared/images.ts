/**
 * @file Image selection for adapters whose providers send several sizes of one picture.
 *
 * Providers describe an image variant in their own shape, such as Tidal's
 * `{ href, meta: { width } }` and KKBOX's `{ url, width }`, so the caller says
 * where the width and the address of a variant are.
 */

/** The width a variant counts with when the provider states none: `0`, so it sorts last. */
const UNKNOWN_IMAGE_WIDTH = 0;

/**
 * Picks the address of the widest image variant a provider supplied.
 *
 * Variants are compared by width alone. Among variants of the same width the
 * first one in provider order wins, and a variant without a width counts as
 * {@link UNKNOWN_IMAGE_WIDTH}. The provider's array is not reordered.
 *
 * @param images - The provider's variants, or `undefined` when it sent none.
 * @param widthOf - Reads a variant's width in pixels, `undefined` when unstated.
 * @param urlOf - Reads a variant's image address.
 * @returns The address of the widest variant, or `undefined` for an absent or
 *   empty list.
 */
export function pickLargestImage<Image>(
  images: readonly Image[] | undefined,
  widthOf: (image: Image) => number | undefined,
  urlOf: (image: Image) => string,
): string | undefined {
  if (!images || images.length === 0) return undefined;
  const widest = [...images].sort(
    (left, right) => (widthOf(right) ?? UNKNOWN_IMAGE_WIDTH) - (widthOf(left) ?? UNKNOWN_IMAGE_WIDTH),
  );
  return urlOf(widest[0]);
}

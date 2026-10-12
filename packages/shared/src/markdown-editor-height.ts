/**
 * @file Remembering how tall somebody dragged a Markdown editor.
 *
 * A height set by hand is a preference like the editor's footer switches beside
 * it: set once, expected to hold. `resize` changes the element in the DOM and
 * tells nobody, so the height has to be observed and stored.
 *
 * The decisions live here rather than in the editor because they are arithmetic
 * and storage rather than rendering, and a decision that can be tested on its
 * own is one that gets tested.
 */

/** Where a remembered height is kept, with the caller's identity after it. */
const HEIGHT_STORAGE_PREFIX = "musiccloud.markdown-editor.height.";

/**
 * Shortest an editor may be dragged to and remembered at, in pixels.
 *
 * Two lines and the footer. Below that the editor is a slot rather than
 * something to write in, and a stored height that small is far more likely to
 * be a stray drag than a decision. The editor uses the same figure as the
 * minimum height of its frame, so it cannot be dragged to a height it would
 * then refuse to remember.
 */
export const EDITOR_MIN_HEIGHT_PX = 96;

/**
 * Tallest an editor may be remembered at, in pixels.
 *
 * Well past any screen in use, so it bounds a nonsense value without ever
 * refusing a real one.
 */
const MAX_REMEMBERED_HEIGHT = 4000;

/**
 * Where a remembered height is stored.
 *
 * @param id - The identity the call site gives the editor's height.
 * @returns The storage key, or `null` where the call site gives none.
 *
 * @remarks
 * Kept per identity rather than one height for every editor, because a
 * description and a one-line note are not the same thing to whoever sizes
 * them. Editors given the same identity share one height, which is how every
 * text block of an email template opens at the size last dragged to. An editor
 * given none remembers nothing rather than taking somebody else's height.
 */
export function editorHeightKey(id: string | undefined): string | null {
  return id ? `${HEIGHT_STORAGE_PREFIX}${id}` : null;
}

/**
 * Reads a stored height back.
 *
 * @param stored - What storage held, or `null` where it held nothing.
 * @returns The height as a CSS length, or `null` where nothing usable was
 *   stored.
 *
 * @remarks
 * Anything outside the bounds is discarded rather than clamped. A value that
 * far out was not a decision, and starting at the nearest allowed height would
 * present it as one.
 */
export function readStoredEditorHeight(stored: string | null): string | null {
  if (!stored) return null;

  const pixels = Number(stored);
  if (!Number.isFinite(pixels)) return null;
  if (pixels < EDITOR_MIN_HEIGHT_PX || pixels > MAX_REMEMBERED_HEIGHT) return null;

  return `${Math.round(pixels)}px`;
}

/**
 * Whether a height the editor settled at is worth storing.
 *
 * @param pixels - What the element measures now.
 * @param stored - What is already stored for it, if anything.
 * @returns `true` where the value is inside the bounds and differs from what
 *   stands there.
 *
 * @remarks
 * A drag reports continuously and `localStorage` is synchronous, so the run
 * that writes asks first whether writing changes anything. Rounded to the pixel
 * before comparing, because a sub-pixel measurement differs every time and
 * would make the question always answer yes.
 */
export function shouldStoreEditorHeight(pixels: number, stored: string | null): boolean {
  if (!Number.isFinite(pixels)) return false;
  if (pixels < EDITOR_MIN_HEIGHT_PX || pixels > MAX_REMEMBERED_HEIGHT) return false;

  return String(Math.round(pixels)) !== stored;
}

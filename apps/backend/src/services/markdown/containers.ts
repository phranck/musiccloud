/**
 * @file What every container shortcode needs, and none of them owns alone.
 *
 * Cards and stacks both hold page content, and page content may hold either of
 * them, so a document can nest without end and a render that followed it would
 * not return. One counter covers both: two would let a document alternate
 * between a card and a stack and reach twice the depth either one allows.
 *
 * A module-level counter rather than something carried on the token, because
 * marked lexes a body synchronously and in place, so the depth whilst a nested
 * body is being read is exactly the depth of the container being read.
 */

import { MAX_CONTAINER_DEPTH, type ShortcodeParamValue } from "@musiccloud/shared";

let containerDepth = 0;

/**
 * Whether another container may be opened here.
 *
 * @returns `true` once the limit is reached, at which point the source is left
 *   standing as text so whoever wrote it can see what happened.
 */
export function isAtContainerLimit(): boolean {
  return containerDepth >= MAX_CONTAINER_DEPTH;
}

/**
 * Reads a container's body one level deeper.
 *
 * @param read - What to do at that depth, which is lexing the body.
 * @returns Whatever `read` returned.
 */
export function insideContainer<T>(read: () => T): T {
  containerDepth += 1;
  try {
    return read();
  } finally {
    containerDepth -= 1;
  }
}

/**
 * Resets the counter.
 *
 * Called at the start of every render, so a render that threw part-way cannot
 * leave the next one thinking it is already deep. Also used by the tests, which
 * drive the tokenizers directly.
 */
export function resetContainerDepth(): void {
  containerDepth = 0;
}

/**
 * Turns a spacing in pixels into the `gap` a container carries.
 *
 * @param spacing - What the page asked for, or `undefined` for the default.
 * @returns The CSS length, or `null` to leave the gap to the stylesheet, which
 *   is what the registry names as the default for every container that takes
 *   this parameter.
 */
export function resolveContainerSpacing(spacing: ShortcodeParamValue | undefined): string | null {
  return typeof spacing === "number" ? `${spacing}px` : null;
}

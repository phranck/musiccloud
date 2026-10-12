import { createHash } from "node:crypto";

/**
 * The content-policy hash of an inline block, as a CSP hash source without
 * its quotes, such as `sha256-…`.
 *
 * Pass the exact text the page writes between the tags, taken from the
 * constant the page renders. A hash of the rendered page would also cover a
 * script someone injected into it.
 *
 * @param text - The text inside the `<script>` or `<style>` element.
 * @returns The hash source for `buildEnforcedContentSecurityPolicy`.
 */
export function inlineBlockHash(text: string): string {
  return `sha256-${createHash("sha256").update(text).digest("base64")}`;
}

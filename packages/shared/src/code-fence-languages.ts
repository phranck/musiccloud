/**
 * @file The languages a code block is highlighted in.
 *
 * Two sides need this list and it must be the same one. The backend loads a
 * highlighter for exactly these, and the editor's help offers exactly these to
 * whoever is writing. A language in the help that the highlighter never loaded
 * renders as plain text, and one the highlighter loads but the help omits is a
 * capability nobody knows about. Neither fails anywhere, which is why the list
 * is here rather than in both places.
 */

/**
 * The name of the query language musiccloud defines itself.
 *
 * Its grammar lives in the backend, since that is what loads it, but the name
 * is what an author writes after the opening fence.
 */
export const MC_QUERY_LANGUAGE = "mc-query";

/**
 * Every language a code fence may name, in the order the help lists them.
 *
 * The common spellings of one language are separate entries, because an author
 * writes whichever comes to mind and both have to work.
 */
export const CODE_FENCE_LANGUAGES = [
  "js",
  "javascript",
  "ts",
  "typescript",
  "jsx",
  "tsx",
  "python",
  "swift",
  "bash",
  "json",
  "css",
  "html",
  MC_QUERY_LANGUAGE,
] as const;

/** One of the languages in {@link CODE_FENCE_LANGUAGES}. */
export type CodeFenceLanguage = (typeof CODE_FENCE_LANGUAGES)[number];

/**
 * The languages the highlighter loads, which is every one above except the
 * project's own.
 *
 * That one is passed as a grammar object rather than a name, so it is added by
 * the module that holds the grammar.
 */
export const BUNDLED_CODE_FENCE_LANGUAGES = CODE_FENCE_LANGUAGES.filter((language) => language !== MC_QUERY_LANGUAGE);

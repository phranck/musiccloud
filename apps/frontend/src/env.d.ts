declare namespace App {
  interface Locals {
    /**
     * The persisted design tokens as the `:root` stylesheet the layout writes
     * inline. The middleware builds it before the page renders, so the
     * content policy carries the hash of exactly this text. Unset for a
     * request that renders no layout, such as an API route.
     */
    designTokensCss?: string;
  }
}

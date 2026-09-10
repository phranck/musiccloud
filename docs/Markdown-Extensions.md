# Markdown Extensions

Managed editorial Markdown uses one extension registry for the public Frontend and the Developer Portal. Every extension declares an `allowedContextMask`; rendering and publication validation use the same registry.

## Content contexts

| Context | Mask |
|---|---:|
| Frontend | `1` |
| Developer Portal | `2` |
| Both | `3` |

Only masks `1`, `2`, and `3` are valid. Rendering always receives one concrete context, `1` or `2`. Publication validation may receive `3` and then requires every used extension to be allowed in both contexts.

## Two registries, and which one decides what

A shortcode is declared once, in `packages/shared/src/markdown-shortcodes/`. That declaration carries its token, its notation, its placement, whether it takes a target or a body, every parameter with its type and default, its worked examples, and the contexts it is allowed in. The renderer, the editor's syntax colouring and the reference panel in the dashboard all read that one declaration, so nothing about a shortcode is written twice and adding one cannot leave the help behind.

`apps/backend/src/services/markdown/extension-registry.ts` is the other half. It wires those declarations into marked and adds what is not a shortcode at all: footnotes, code fences, and heading anchors. Where an entry there renders a shortcode, it takes its context mask from the shared declaration rather than stating one of its own.

## Extensions

| Extension | Renders | Frontend | Developer Portal |
|---|---|:---:|:---:|
| `footnotes` | `Text[^id]` and `[^id]: Note`, through `marked-footnote` | Yes | Yes |
| `codeFence` | Triple-backtick and triple-tilde blocks, with Shiki highlighting, `recessed` or `embossed`, and validated `padding=` and `radius=` | Yes | Yes |
| `headingAnchors` | An identifier on every heading, numbered within one document | Yes | Yes |
| `mcCard` | `[[card]]` and `[[cards]]` | No | Yes |
| `mcStack` | `[[vstack]]`, `[[hstack]]` and `[[spacer]]` | Yes | Yes |
| `mcMedia` | `[[image:…]]`, `[[pdf:…]]` and `[[youtube:…]]` | Yes | Yes |
| `mcIcon` | `[[icon]]` | Yes | Yes |
| `mcPlans` | `[[plans]]` | No | Yes |
| `mcFields` | `[[fields { … }]]` | Yes | Yes |
| `mcPill` | `[[pill:…]]` | Yes | Yes |
| `mcKbd` | `{{Key}}` | Yes | Yes |

Each descriptor there contains a unique extension name, a non-zero known context mask, a factory that creates an isolated marked extension, and the token types that prove the syntax was parsed as an extension.

Validation inspects parsed token types, not raw substring matches. Extension-like text inside a fenced code example therefore does not count as extension usage.

## Shortcodes

| Shortcode | Notation | Placement | Body | Target | Frontend | Developer Portal |
|---|---|---|---|---|:---:|:---:|
| `card` | `[[card { … }]]` | Block | Markdown | Forbidden | No | Yes |
| `cards` | `[[cards { … }]]` | Block | Markdown | Forbidden | No | Yes |
| `fields` | `[[fields { … }]]` | Block | Markdown | Forbidden | Yes | Yes |
| `hstack` | `[[hstack { … }]]` | Block | Markdown | Forbidden | Yes | Yes |
| `icon` | `[[icon]]` | Inline | Forbidden | Forbidden | Yes | Yes |
| `image` | `[[image:…]]` | Block | Forbidden | Required | Yes | Yes |
| `kbd` | `{{Key}}` | Inline | Forbidden | Required | Yes | Yes |
| `pdf` | `[[pdf:…]]` | Block | Forbidden | Required | Yes | Yes |
| `pill` | `[[pill:…]]` | Inline | Forbidden | Required | Yes | Yes |
| `plans` | `[[plans]]` | Block | Forbidden | Forbidden | No | Yes |
| `spacer` | `[[spacer]]` | Block | Forbidden | Forbidden | Yes | Yes |
| `vstack` | `[[vstack { … }]]` | Block | Markdown | Forbidden | Yes | Yes |
| `youtube` | `[[youtube:…]]` | Block | Forbidden | Required | Yes | Yes |

The list is sorted by token, which is also the order the reference panel lists them in, because that panel is a list to look something up in.

One notation for all of them, so a writer learns `[[token]]` once. A container carries its content between braces, `[[token { … }]]`, and the two inline forms differ where they have to: a shortcode taking a target writes it after a colon, and `{{Key}}` is short because a single key is not worth more.

The fields list was written `:::fields … :::` before that. The renderer still reads it, so no stored page breaks, and nothing teaches it: it appears in no example and in no reference. It goes once the stored pages have been rewritten.

Every parameter each one takes is in its declaration and in the reference panel, and is therefore not repeated here. A table of parameters in a document is a second answer to a question the code already answers, and it drifts.

`card`, `cards` and `plans` are portal-only for two different reasons. A card is drawn by the portal's own stylesheet whilst the site draws its cards as neumorphic primitives, so widening it needs a mapping rather than a rule; #273 carries that. `plans` renders the developer plans, which have no meaning on the music site, and that is a product decision rather than a styling one.

## How the markup is arranged

`packages/shared/styles/markdown-shortcodes.css` holds the arrangement of the shortcode markup, and both surfaces import it: the site through `apps/frontend/src/styles/global.css`, the portal through `apps/developer/src/styles/editorial.css`. Two copies would drift, and the drift would show as a symbol sitting on the wrong side of its sentence on one of the two.

What differs between the surfaces is the material rather than the arrangement, so the stylesheet reads it from seven custom properties that each surface declares from its own tokens: `--mc-shortcode-gap`, `--mc-shortcode-gap-tight`, `--mc-shortcode-radius`, `--mc-shortcode-surface`, `--mc-shortcode-border`, `--mc-shortcode-caption-color` and `--mc-shortcode-title-color`.

## Symbols

`[[icon]]` draws a Phosphor symbol in its duotone weight. The whole set is 5.9 MB across 1512 files and a page names a handful, so the assets sit beside the built backend bundle rather than inside it and one is read the first time a page asks for it. `apps/backend/scripts/copy-phosphor-icons.mjs` puts them there, in the same arrangement the Jimp fonts use.

The sanitizer admits `svg` and `path` under a tight attribute allowlist. What makes that safe is that the path data never comes from a page: a page names an icon and the renderer looks the shapes up in the assets this repository ships.

## Videos

`[[youtube:…]]` renders a link rather than a frame. The link stands at the shape the video will take, and the surface swaps it for the frame on the first click, so nothing reaches YouTube for a reader who never plays the video and the page holds that room from the first paint.

The identifier is read out of whatever the page wrote, and the embed address is then built from `YOUTUBE_EMBED_HOST` in `packages/shared/src/markdown-shortcodes/media.ts`, so nothing a page writes decides where the frame loads from. The same constant is what `frame-src` names in the reported content policy and in the dashboard's nginx template, which a test holds together.

## Rendering and validation

`renderMarkdown(markdown, context)` caches one Marked instance per concrete context and shares one lazily created Shiki highlighter. A renderer installs only extensions allowed in its context.

`validateMarkdownForContexts(markdown, contextMask)` checks all contexts enabled for a page. A failure identifies only the extension and its allowed context mask; it never includes unpublished page content. Invalid masks fail before parsing.

Tests register a Developer Portal-only `tiers` extension to verify the context boundary. This is test-only coverage and does not introduce product Tiers syntax.

## Contextual publication cutover

Privacy and Terms keep one stable Page identity and one canonical editorial title/body across Frontend and Developer Portal publications. The cutover adds only the contextual publication metadata for `/privacy` and `/terms`; it does not copy or fork their Markdown.

## System-owned paths in the portal

`packages/shared/src/developer-portal-paths.ts` is the one place that says which portal paths an editorial page may not take. `PORTAL_RESERVED_PREFIXES` lists them, and `isPortalReservedPath` is what the backend, the portal and the dashboard all ask.

`/docs` and `/pricing` are the two exceptions, named in `PORTAL_EDITORIAL_RESERVED_PATHS`. Everything a reader reads on either comes from a page edited in the dashboard, so a sentence on one is an edit rather than a deployment. Each stays an Astro route because a route carries what a stored page cannot: which header tab is current, and the notice shown to somebody who arrived from a signup that needs a plan chosen.

Only those two exact paths are editorial. Everything beneath `/docs/` stays system-owned, so the API reference, the search targets, the OpenAPI output, the SDK output and every generated artefact under `/docs/**` are never editorial backfill sources.

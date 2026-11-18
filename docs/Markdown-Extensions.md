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

A shortcode is declared once, in `packages/shared/src/markdown-shortcodes/`. That declaration carries its token, its notation, its placement, whether it takes a target or a body, every parameter with its type and default, its worked examples, and the contexts it is allowed in. The renderer, the editor's syntax coloring and the reference panel in the dashboard all read that one declaration, so nothing about a shortcode is written twice and adding one cannot leave the help behind.

`apps/backend/src/services/markdown/extension-registry.ts` is the other half. It wires those declarations into marked and adds what is not a shortcode at all: footnotes, code fences, and heading anchors. Where an entry there renders a shortcode, it takes its context mask from the shared declaration rather than stating one of its own.

## Extensions

| Extension | Renders | Frontend | Developer Portal |
|---|---|:---:|:---:|
| `footnotes` | `Text[^id]` and `[^id]: Note`, through `marked-footnote` | Yes | Yes |
| `codeFence` | Triple-backtick and triple-tilde blocks, with Shiki highlighting, `recessed` or `embossed`, and validated `padding=` and `radius=` | Yes | Yes |
| `headingAnchors` | An identifier on every heading, numbered within one document | Yes | Yes |
| `mcCard` | `[[card { … }]]` and `[[cards]]` | Yes | Yes |
| `mcCardSections` | `[[card … ]]` written in its parts, which `mcCard` reads and draws | No | Yes |
| `mcStack` | `[[vstack]]`, `[[hstack]]` and `[[spacer]]` | Yes | Yes |
| `mcMedia` | `[[image:…]]`, `[[pdf:…]]` and `[[youtube:…]]` | Yes | Yes |
| `mcButton` | `[[button]]` | No | Yes |
| `mcIcon` | `[[icon]]` | Yes | Yes |
| `mcPlans` | `[[plans]]` | No | Yes |
| `mcFields` | `[[fields … ]]` | Yes | Yes |
| `mcPill` | `[[pill:…]]` | Yes | Yes |
| `mcKbd` | `{{Key}}` | Yes | Yes |
| `mcSupportLadder` | `[[support-ladder … ]]` | Yes | No |

Each descriptor there contains a unique extension name, a non-zero known context mask, a factory that creates an isolated marked extension, and the token types that prove the syntax was parsed as an extension.

Validation inspects parsed token types, not raw substring matches. Extension-like text inside a fenced code example therefore does not count as extension usage.

## Shortcodes

| Shortcode | Notation | Placement | Body | Target | Frontend | Developer Portal |
|---|---|---|---|---|:---:|:---:|
| `button` | `[[button]]` | Inline | Forbidden | Forbidden | No | Yes |
| `card` | `[[card { … }]]` or `[[card … ]]` | Block | Markdown | Forbidden | Yes | Yes |
| `cards` | `[[cards { … }]]` | Block | Markdown | Forbidden | Yes | Yes |
| `fields` | `[[fields … ]]` | Block | Children | Forbidden | Yes | Yes |
| `hstack` | `[[hstack { … }]]` | Block | Markdown | Forbidden | Yes | Yes |
| `icon` | `[[icon]]` | Inline | Forbidden | Forbidden | Yes | Yes |
| `image` | `[[image:…]]` | Block | Forbidden | Required | Yes | Yes |
| `kbd` | `{{Key}}` | Inline | Forbidden | Required | Yes | Yes |
| `pdf` | `[[pdf:…]]` | Block | Forbidden | Required | Yes | Yes |
| `pill` | `[[pill:…]]` | Inline | Forbidden | Required | Yes | Yes |
| `plans` | `[[plans]]` | Block | Forbidden | Forbidden | No | Yes |
| `spacer` | `[[spacer]]` | Block | Forbidden | Forbidden | Yes | Yes |
| `sponsors` | `[[sponsors]]` | Block | Forbidden | Forbidden | Yes | No |
| `support-ladder` | `[[support-ladder … ]]` | Block | Children | Forbidden | Yes | No |
| `vstack` | `[[vstack { … }]]` | Block | Markdown | Forbidden | Yes | Yes |
| `youtube` | `[[youtube:…]]` | Block | Forbidden | Required | Yes | Yes |

The list is sorted by token, which is also the order the reference panel lists them in, because that panel is a list to look something up in.

One notation for all of them, so a writer learns `[[token]]` once. A container carries its content between braces, `[[token { … }]]`, and the two inline forms differ where they have to: a shortcode taking a target writes it after a colon, and `{{Key}}` is short because a single key is not worth more.

Others are children rather than shortcodes of their own, so each means something inside one container and nothing at the top level of a page: `field` inside a fields list, `header`, `body` and `footer` inside a card, and the parts of the support ladder described below. The registry declares them under their parent, and the editor's reference shows them there.

**Braces mean content, and no braces mean children.** A container written `[[token { … }]]` holds page content, and one written `[[token … ]]` holds the parts it names. A card is written either way: with braces it is all body, which is how most cards are written, and without them it names its header, its body and its footer in whatever order suits the writing, and the card decides where each goes. A fields list is only ever the second, because it holds its entries and nothing else.

What a container carries in a child rather than in an attribute is always the same thing: content. A label, a header and a footer each take Markdown, run to a sentence or more, and would otherwise have to be quoted into an attribute, escaped, and written without a line break.

A card's header and its footer are each written both ways, because most of them are one line and a few are a paragraph or a row of controls. One line goes in the `text` attribute, `[[footer text="Every plan includes it."]]`, and anything longer goes between braces. Where a band carries both, the braces are what renders.

Every parameter each one takes is in its declaration and in the reference panel, and is therefore not repeated here. A table of parameters in a document is a second answer to a question the code already answers, and it drifts.

`button` and `plans` are portal-only. `plans` renders the developer plans, which have no meaning on the music site, and that is a product decision rather than a styling one.

A card stands on both surfaces, and each draws it in its own material. The portal styles `mc-card` in `apps/developer/src/styles/editorial.css`. On the site, `apps/frontend/src/components/markdown/MarkdownHtml.tsx` replaces the element with an `EmbossedCard`, whose text sits at the same inset as the title of a section card. A row of cards wraps the same way on both, because its columns are set in the shared stylesheet below.

A card written in its parts is portal-only, because the site draws no header or footer bands for page content. The card extension reads that form as its own token type, `mcCardSectioned`, and the `mcCardSections` entry in the registry declares where it may stand, so a page on the site that writes one is refused. A card on the site is written with braces.

## How the markup is arranged

`packages/shared/styles/markdown-shortcodes.css` holds the arrangement of the shortcode markup, and both surfaces import it: the site through `apps/frontend/src/styles/global.css`, the portal through `apps/developer/src/styles/editorial.css`. Two copies would drift, and the drift would show as a symbol sitting on the wrong side of its sentence on one of the two.

What differs between the surfaces is the material rather than the arrangement, so the stylesheet reads it from seven custom properties that each surface declares from its own tokens: `--mc-shortcode-gap`, `--mc-shortcode-gap-tight`, `--mc-shortcode-radius`, `--mc-shortcode-surface`, `--mc-shortcode-border`, `--mc-shortcode-caption-color` and `--mc-shortcode-title-color`.

## Symbols

`[[icon]]` draws in the hand of the surface it renders for. The developer portal is set in **Iconsax**, in its Bulk style; the site is set in **Phosphor**, in duotone. Both are decisions about how a product looks, so the shortcode reads the set from the content context and a page never names one.

The two sets publish different names, and that is the cost of the arrangement: a page written for one surface and published on the other may name an icon the other has no word for. The renderer leaves such a shortcode standing as its own source, which is what makes it visible rather than silent.

Neither set ships in the bundle. Together they are 6 MB across 2500 files whilst a page names a handful, so both sit beside the built backend bundle and one file is read the first time a page asks for it, in the same arrangement the Jimp fonts use. Phosphor is copied from its own package by `apps/backend/scripts/copy-phosphor-icons.mjs`. Iconsax publishes React components rather than assets, so `apps/backend/scripts/build-iconsax-bulk.mjs` reads the Bulk variant's shapes out of them and writes the assets itself.

The backend's tests never read `dist`, because the dev watcher empties and refills it on every rebuild. They read Phosphor straight from its package, and Iconsax from `apps/backend/node_modules/.cache/icons/iconsax-bulk`, which the test scripts write with the same script before every run.

The sanitizer admits `svg` and `path` under a tight attribute allowlist, and the two boxes the sets draw in. What makes that safe is that the path data never comes from a page: a page names an icon and the renderer looks the shapes up in the assets this repository ships.

## Videos

`[[youtube:…]]` renders a link rather than a frame. The link stands at the shape the video will take, and the surface swaps it for the frame on the first click, so nothing reaches YouTube for a reader who never plays the video and the page holds that room from the first paint.

The identifier is read out of whatever the page wrote, and the embed address is then built from `YOUTUBE_EMBED_HOST` in `packages/shared/src/markdown-shortcodes/media.ts`, so nothing a page writes decides where the frame loads from. The same constant is what `frame-src` names in the reported content policy and in the dashboard's nginx template, which a test holds together.

## The support ladder

`[[support-ladder … ]]` is the giving block of the support page, and only the site renders it. It holds four kinds of child:

- `bankaccount` holds one `variant` per tab, and a variant holds a `qrcode` for the look of its GiroCode and an `info` for the notice under the payee lines. The sponsor variant may also hold a `sponsorform`, described below.
- `interval` is one tab, `once`, `monthly` or `sponsor`. It holds its suggested amounts as `option` children and its free amount field as `custom`. In its `text`, `{annualAmount}` stands for the sum the tab comes to over a year, and in its `belowMinimum`, `{min}` stands for the sponsor minimum. Both are declared as placeholders of those parameters, so the editor's reference shows them there.
- `paypalme` and `ghsponsor` are the two routes out. Each address must be `https` and on the route's own host, and the route is dropped otherwise.

A page writes its amounts with the sponsoring site variables, such as `amount={amountMonth}`. Variables are put in before the page is parsed, so the suggested amounts follow the running costs entered in the dashboard.

The ladder is something a reader operates, so the backend does not draw it. `apps/backend/src/services/markdown/support-ladder-extension.ts` renders every text field of the tree as Markdown and writes the whole configuration as JSON into the `data-mc-support-ladder` attribute of an empty `div`. `packages/shared/src/support-ladder.ts` defines that shape and is the one reader of it.

Markdown passes raw HTML through, so a page could write the attribute by hand. The sanitizer therefore reads it against the shared shape, drops whatever does not fit, and runs every HTML field through its own allowlist. After sanitizing, `bindSupportLadderSettings` writes the payee and the sponsor minimum from the sponsoring settings into every marker. A page can therefore never name the account a transfer goes to.

The site mounts `SupportLadder` on the marker in `MarkdownHtml`. The GiroCode follows EPC069-12 and is drawn for single payments and sponsorships only, because the format has no field for an interval. PayPal.Me stands under single payments only, GitHub Sponsors under single and monthly payments, and the sponsor tab offers the transfer alone. `qr-code-styling` draws the code and is loaded the first time a code is drawn, so a page without a ladder never fetches it.

## The sponsor form

`[[sponsorform]]` stands inside `[[variant key="sponsor"]]` of the `bankaccount` and turns the sponsor tab into a request for a payment reference. The ladder shows the form on the tab whose transfer card carries one, so the page decides where the form belongs. Somebody who means to sponsor gives their name, one profile address, their own sentence and whether they want to be named on the site. The switch for being named starts on. The site answers with an ISO 11649 reference that opens with `RF`, two check digits and `MCSP`. The transfer card and the GiroCode then carry that reference in place of the sponsorship purpose, because a transfer carries one of the two and never both. Without the node no form appears, and the transfer carries the donation purpose at any amount, because only a tab with a form announces a sponsorship. Inside `[[interval]]` the node is dropped.

```text
[[bankaccount
  [[variant key="sponsor" title="Bank transfer or GiroCode" icon="sepa"
    [[sponsorform submitLabel="Send details"]]
  ]]
]]
```

Every word the form shows is a parameter of the node, and every one is optional. The defaults, the parameter names and what each one labels are declared once in `packages/shared/src/sponsor-form.ts`, and the editor's reference lists them. In `claimRemaining`, `{n}` stands for the number of characters still free. It is declared as that parameter's placeholder, so the reference shows it under the parameter. The words are plain text rather than Markdown, at most 160 characters each. A refusal is worded by `failureRateLimited` when the site answers `429` and by `failureRejected` otherwise, and the backend's `MC-*` code and error ID follow that sentence, as in `That did not work. Please check your details and try again. (MC-REQ-0013) Error ID: …`.

The reference lives in the visitor's browser for 60 days, which is how long the backend keeps an unclaimed request. Reloading the page therefore shows the same reference, and the form opens again on what was sent, so a correction rewrites the request under the same reference. A correction starts the 60 days again, in the browser and in the backend alike.

The form posts to `/api/sponsorships` and corrects through `/api/sponsorships/:reference` on the site's own origin. Those proxies refuse a body above 4 KiB and pass everything else on with the visitor's address, which the backend's limit of five requests an hour counts. The backend's status, its error envelope and `Retry-After` come back unchanged, and every answer carries `Cache-Control: no-store`.

## The sponsor wall

`[[sponsors]]` shows who carries this year's running costs, and only the site renders it. It has a card for every published sponsor whose year still runs, and a sentence under the cards on how much of the year is covered. A page writes the texts around the cards and nothing about the sponsors, who are entered in the dashboard. Every text is optional and the site has a default for each one: `text` introduces the block, `covered` and `missing` are the two versions of the sentence under the cards, and `empty` with `emptyAction` fill the placeholder card that stands while nobody is on the wall. In `missing`, `{missing}` stands for the amount still outstanding. It is declared as that parameter's placeholder, so the editor's reference shows it there.

Who is on the wall changes by the day, so the backend writes no sponsor into the page. `apps/backend/src/services/markdown/sponsors-extension.ts` renders the texts as Markdown and writes them as JSON into the `data-mc-sponsor-wall` attribute of an empty `div`. `packages/shared/src/sponsor-wall.ts` defines that shape and is its one reader. The sanitizer reads a hand-written marker against that shape and runs every HTML field through its allowlist, as it does for the ladder.

The site mounts the wall on the marker in `MarkdownHtml` and reads the sponsors and the year's figures from `GET /api/sponsors` on its own origin, which forwards to `GET /api/v1/sponsors`. That route carries no amount belonging to a person. From the third card on, the row moves by itself, and it eases to a stop under the pointer or the focus. A reader who prefers reduced motion gets a row that stands still. The placeholder's button opens the ladder's sponsor tab.

## Rendering and validation

`renderMarkdown(markdown, context)` caches one Marked instance per concrete context and shares one lazily created Shiki highlighter. A renderer installs only extensions allowed in its context.

`validateMarkdownForContexts(markdown, contextMask)` checks all contexts enabled for a page. A failure identifies only the extension and its allowed context mask; it never includes unpublished page content. Invalid masks fail before parsing.

Tests register a Developer Portal-only `tiers` extension to verify the context boundary. This is test-only coverage and does not introduce product Tiers syntax.

## Contextual publication cutover

Privacy and Terms keep one stable Page identity and one canonical editorial title/body across Frontend and Developer Portal publications. The cutover adds only the contextual publication metadata for `/privacy` and `/terms`; it does not copy or fork their Markdown.

## System-owned paths in the portal

`packages/shared/src/developer-portal-paths.ts` is the one place that says which portal paths an editorial page may not take. `PORTAL_RESERVED_PREFIXES` lists them, and `isPortalReservedPath` is what the backend, the portal and the dashboard all ask.

`/docs` and `/pricing` are the two exceptions, named in `PORTAL_EDITORIAL_RESERVED_PATHS`. Everything a reader reads on either comes from a page edited in the dashboard, so a sentence on one is an edit rather than a deployment. Each stays an Astro route because a route carries what a stored page cannot: which header tab is current, and the notice shown to somebody who arrived from a signup that needs a plan chosen.

Only those two exact paths are editorial. Everything beneath `/docs/` stays system-owned, so the API reference, the search targets, the OpenAPI output, the SDK output and every generated artifact under `/docs/**` are never editorial backfill sources.

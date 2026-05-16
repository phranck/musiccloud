# Markdown Extensions

This document lists the custom Markdown extensions supported by the musiccloud page content renderer.

Standard Markdown remains available. The extensions below are added on top of it.

## Field Blocks

Use field blocks for aligned key/value documentation such as query modifiers.

```md
:::fields
genre: Genre name or Genre1|Genre2 (OR) [[pill:REQ tone=alert]]
tracks: 1-50, default 10 [[pill:OPT]]
albums: 1-50, default 10 [[pill:OPT]]
artists: 1-50, default 10 [[pill:OPT]]
count: 1-50, applies the same amount to tracks, albums, and artists. Excludes tracks/albums/artists. [[pill:OPT]]
vibe: `hot` (Top-N) or `mixed` (stratified random) [[pill:OPT]]
:::
```

The renderer outputs a semantic definition list:

```html
<dl class="mc-fields">
  <dt>genre:</dt>
  <dd>Genre name or Genre1|Genre2 (OR) <span class="mc-pill mc-pill-alert">REQ</span></dd>
</dl>
```

Long descriptions wrap inside the second column and continue at the second-column start.

### Layout Options

By default, the first column is dynamic:

```md
:::fields
genre: Required genre value
tracks: Optional track count
:::
```

This uses the widest label as the first-column width.

For a fixed first column, set `labelWidth`:

```md
:::fields labelWidth=9ch
genre: Required genre value
tracks: Optional track count
:::
```

You can also set the column gap:

```md
:::fields labelWidth=9ch gap=1.25rem
genre: Required genre value
tracks: Optional track count
:::
```

Supported options:

| Option | Default | Values |
| --- | --- | --- |
| `labelWidth` | `auto` | `auto`, `px`, `rem`, `em`, `ch` |
| `gap` | `1.1rem` | `px`, `rem`, `em`, `ch` |

Invalid option values are ignored.

## Inline Pills

Pills are inline markers for compact metadata.

```md
genre: jazz [[pill:REQ tone=alert]]
tracks: 20 [[pill:OPT]]
note: [[pill:Info tone=info]]
status: [[pill:done tone=success case=upper]]
```

Syntax:

```md
[[pill:LABEL option=value option=value]]
```

`LABEL` is the text after `pill:` up to the next whitespace or closing `]]`.

Supported options:

| Option | Default | Values |
| --- | --- | --- |
| `tone` | `neutral` | `alert`, `info`, `neutral`, `success` |
| `case` | `none` | `none`, `upper`, `lower` |

Rendered classes:

| Tone | Output class |
| --- | --- |
| `alert` | `mc-pill mc-pill-alert` |
| `info` | `mc-pill mc-pill-info` |
| `neutral` | `mc-pill mc-pill-neutral` |
| `success` | `mc-pill mc-pill-success` |

Unknown options are ignored. Legacy badge markers such as `[[REQ]]`, `[[REQUIRED]]`, and `[[OPT]]` are not parsed and stay visible as plain text.

## Keyboard Hints

Keyboard hints use double braces:

```md
Press {{Esc}} to close.
Use {{Cmd+K}} to insert a link.
```

They render as:

```html
<kbd class="mc-kbd">Esc</kbd>
```

The content inside `{{...}}` is escaped before rendering.

## Code Fences

Every fenced code block is rendered as a recessed card by default:

````md
```js
const value = 1;
```
````

### Card Style

Choose the card surface with `recessed` or `embossed` after the language:

````md
```js recessed
const value = 1;
```

```js embossed
const value = 1;
```
````

If no style is provided, `recessed` is used.

For plain text without syntax highlighting, the style can be the first fence token:

````md
```recessed
Plain text
```
````

### Card Geometry

Use `padding=` and `radius=` after the language/style:

````md
```js recessed padding=1rem radius=12px
const value = 1;
```
````

`padding=` and `radius=` use the single value after `=`. Use regular CSS length values such as `0.75rem`, `1rem`, or `12px`.

### Supported Highlight Languages

The highlighter is configured for:

```text
javascript, typescript, ts, js, tsx, jsx, python, swift, bash, json, css, html, mc-query
```

Unknown languages fall back to escaped plain text.

## Plain Text Comment Highlighting

Inside `text` fences, lines that start with `#` or `//` are rendered as muted italic comments.

````md
```text
# comment
// note
plain line
```
````

Only comments at the start of the line, after optional leading whitespace, receive this styling.

## musiccloud Query Highlighting

Use the `mc-query` code fence for musiccloud query examples:

````md
```mc-query
genre: jazz | soul
tracks: 20
# internal note
```
````

The custom grammar highlights query keys, numbers, operators such as `|` and `?`, and `#` / `//` comments.

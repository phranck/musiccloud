# Markdown Extensions

Managed editorial Markdown uses one extension registry for the public Frontend and the Developer Portal. Every extension declares an `allowedContextMask`; rendering and publication validation use the same registry.

## Content contexts

| Context | Mask |
|---|---:|
| Frontend | `1` |
| Developer Portal | `2` |
| Both | `3` |

Only masks `1`, `2`, and `3` are valid. Rendering always receives one concrete context, `1` or `2`. Publication validation may receive `3` and then requires every used extension to be allowed in both contexts.

## Registry

| Extension | Syntax | Frontend | Developer Portal | Notes |
|---|---|:---:|:---:|---|
| `footnotes` | `Text[^id]` and `[^id]: Note` | Yes | Yes | GitHub-style footnotes provided by `marked-footnote`. |
| `codeFence` | Triple-backtick or triple-tilde code blocks | Yes | Yes | Supports Shiki highlighting, `recessed` or `embossed`, and validated `padding=` and `radius=` options. |
| `mcFields` | `:::fields` block | Yes | Yes | Renders definition rows and accepts validated `labelWidth=` and `gap=` options. |
| `mcPill` | `[[pill:Label]]` | Yes | Yes | Supports the existing `tone=` and `case=` options. |
| `mcKbd` | `{{Key}}` | Yes | Yes | Renders escaped keyboard hints. |

The registry is defined in `apps/backend/src/services/markdown/extension-registry.ts`. Each descriptor contains:

- a unique extension name,
- a non-zero known context mask,
- a factory that creates an isolated Marked extension implementation,
- the token types that prove the syntax was parsed as an extension.

Validation inspects parsed token types, not raw substring matches. Extension-like text inside a fenced code example therefore does not count as extension usage.

## Rendering and validation

`renderMarkdown(markdown, context)` caches one Marked instance per concrete context and shares one lazily created Shiki highlighter. A renderer installs only extensions allowed in its context.

`validateMarkdownForContexts(markdown, contextMask)` checks all contexts enabled for a page. A failure identifies only the extension and its allowed context mask; it never includes unpublished page content. Invalid masks fail before parsing.

Tests register a Developer Portal-only `tiers` extension to verify the context boundary. This is test-only coverage and does not introduce product Tiers syntax.

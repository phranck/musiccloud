# Resolve Flow Docs

Single-source documentation of the musiccloud resolve layer. The
Markdown file `resolve-flow.md` is the authoritative source. The PDF
`resolve-flow.pdf` and the SVGs in `./diagrams/` are generated
artefacts, committed alongside the source so GitHub can render the
Markdown inline and the PDF can be downloaded directly from the repo.

## Read

- **GitHub web view**: open `resolve-flow.md` directly. GitHub
  renders the Markdown with the embedded SVG diagrams inline.
- **PDF**: open `resolve-flow.pdf` for the typeset version. Same
  content, print-ready, with Barlow body type and Barlow Condensed
  headlines.

## Edit

The Markdown is the source of truth. Diagram changes go through D2.

1. Edit `./diagrams/<name>.d2` (D2 source) and / or `resolve-flow.md`
   (prose).
2. Run `make docs` from the repo root.
3. Commit the `.d2` source, the regenerated `.svg`, and the
   regenerated `resolve-flow.pdf` together with whatever code change
   motivated the doc update.

## Versioning

This document is versioned independently of the public API
specification. The version stamp shown at the top of the body is
built from three parts:

- `apps/backend/docs/resolve-flow/VERSION` carries a manually
  maintained semantic version. Bump it when a change is significant
  enough to deserve a new minor or major number.
- The Makefile adds a short Git commit hash for the documentation
  directory (or the current HEAD when the directory has no commit
  history yet, plus a `-dirty` suffix when the working tree has
  uncommitted changes here).
- The same Git revision contributes the commit date.

To inspect the stamp the next build will produce, run:

```bash
make docs-version
```

The Markdown source contains the placeholders `DOC_VERSION` and
`DOC_DATE`. The build runs them through `sed` into a temporary copy
before invoking Pandoc, so the source file stays placeholder-clean
and the PDF always reflects the current Git state.

## Build dependencies

Once per machine:

```bash
brew install d2 pandoc librsvg
brew install --cask basictex font-barlow
```

- `d2` renders the diagram sources to SVG.
- `pandoc` reads the Markdown, embeds the SVGs, and emits PDF
  through XeLaTeX.
- `librsvg` provides `rsvg-convert`, used by Pandoc to convert the
  SVG diagrams to PDF for inline embedding.
- `basictex` is a slim TeX Live install with `xelatex`. Bigger than
  Tectonic but available with all the packages this build needs
  (TikZ, fontspec, graphicx, ragged2e, array).
- `font-barlow` installs the Barlow body font. Barlow Condensed,
  used for headlines, ships with the same cask in some
  distributions but is more reliably installed manually if missing.

## Make targets

From the repo root:

| Target | Effect |
| --- | --- |
| `make docs` | Render all SVGs and the PDF. |
| `make docs-svg` | Render SVGs only. |
| `make docs-pdf` | Render the PDF only (assumes SVGs exist). |
| `make docs-version` | Print the version stamp the next build will use. |
| `make docs-clean` | Drop the PDF and LaTeX temp files. SVGs are kept. |

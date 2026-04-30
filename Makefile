# Repo-root Makefile.
#
# Scoped to documentation generation. Code build/test still goes through
# the workspace npm scripts.

DOCS_DIR := docs/resolve-flow
DOCS_DE_DIR := $(DOCS_DIR)/de
DOCS_EN_DIR := $(DOCS_DIR)/en
DIAGRAMS_DE_DIR := $(DOCS_DE_DIR)/diagrams
DIAGRAMS_EN_DIR := $(DOCS_EN_DIR)/diagrams

D2_SOURCES_DE := $(wildcard $(DIAGRAMS_DE_DIR)/*.d2)
D2_SOURCES_EN := $(wildcard $(DIAGRAMS_EN_DIR)/*.d2)
SVG_TARGETS_DE := $(D2_SOURCES_DE:.d2=.svg)
SVG_TARGETS_EN := $(D2_SOURCES_EN:.d2=.svg)
PDF_DIAGRAM_TARGETS_DE := $(D2_SOURCES_DE:.d2=.pdf)
PDF_DIAGRAM_TARGETS_EN := $(D2_SOURCES_EN:.d2=.pdf)

TEX_SOURCE_DE := $(DOCS_DE_DIR)/resolve-flow.tex
TEX_SOURCE_EN := $(DOCS_EN_DIR)/resolve-flow.tex
PDF_TARGET_DE := $(DOCS_DE_DIR)/resolve-flow.pdf
PDF_TARGET_EN := $(DOCS_EN_DIR)/resolve-flow.pdf
VERSION_FILE := $(DOCS_DIR)/VERSION

# Build-time version stamp: <semver>+<short-sha> from the docs directory,
# plus the commit date of the last touch to the docs directory. The semver
# part is a manually-bumped value in $(VERSION_FILE); the sha and date are
# derived from `git log` so every PDF carries an exact pointer back to the
# source revision it was built from.
SEMVER := $(shell cat $(VERSION_FILE) 2>/dev/null || echo 0.0.0)
DOC_SHA := $(shell git log -1 --pretty=format:%h -- $(DOCS_DIR) 2>/dev/null)
ifeq ($(DOC_SHA),)
DOC_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo uncommitted)
endif
DOC_DIRTY := $(shell git diff --quiet HEAD -- $(DOCS_DIR) 2>/dev/null || echo -dirty)
DOC_DATE := $(shell git log -1 --pretty=format:%cs -- $(DOCS_DIR) 2>/dev/null)
ifeq ($(DOC_DATE),)
DOC_DATE := $(shell git log -1 --pretty=format:%cs 2>/dev/null || date +%Y-%m-%d)
endif
DOC_VERSION := $(SEMVER)+$(DOC_SHA)$(DOC_DIRTY)

.PHONY: docs docs-de docs-en \
        docs-svg-de docs-svg-en \
        docs-diagram-pdfs-de docs-diagram-pdfs-en \
        docs-pdf-de docs-pdf-en \
        docs-clean docs-version

# `make docs` builds both languages: SVGs (for GitHub web view), per-diagram
# PDFs (for the typeset PDF), then the typeset PDFs themselves.
docs: docs-de docs-en

docs-de: docs-svg-de docs-diagram-pdfs-de docs-pdf-de
docs-en: docs-svg-en docs-diagram-pdfs-en docs-pdf-en

# Render every .d2 source to both .svg and .pdf. SVGs are committed so
# GitHub can render them inline anywhere they end up referenced; PDFs
# are what xelatex embeds, because piping SVG through rsvg-convert lost
# some path segments.
$(DIAGRAMS_DE_DIR)/%.svg: $(DIAGRAMS_DE_DIR)/%.d2
	@command -v d2 >/dev/null || { echo "d2 not installed (brew install d2)"; exit 1; }
	d2 "$<" "$@"

$(DIAGRAMS_DE_DIR)/%.pdf: $(DIAGRAMS_DE_DIR)/%.d2
	@command -v d2 >/dev/null || { echo "d2 not installed (brew install d2)"; exit 1; }
	d2 "$<" "$@"

$(DIAGRAMS_EN_DIR)/%.svg: $(DIAGRAMS_EN_DIR)/%.d2
	@command -v d2 >/dev/null || { echo "d2 not installed (brew install d2)"; exit 1; }
	d2 "$<" "$@"

$(DIAGRAMS_EN_DIR)/%.pdf: $(DIAGRAMS_EN_DIR)/%.d2
	@command -v d2 >/dev/null || { echo "d2 not installed (brew install d2)"; exit 1; }
	d2 "$<" "$@"

docs-svg-de: $(SVG_TARGETS_DE)
docs-svg-en: $(SVG_TARGETS_EN)
docs-diagram-pdfs-de: $(PDF_DIAGRAM_TARGETS_DE)
docs-diagram-pdfs-en: $(PDF_DIAGRAM_TARGETS_EN)

# Render the main PDF, parameterised on language. The .tex file is the
# authoritative source. DOC_VERSION and DOC_DATE placeholders are
# substituted into a temporary copy before xelatex runs, so the source
# file stays free of build-time metadata.
#
# Build deps:
#   brew install d2
#   brew install --cask basictex
#   tlmgr --usermode init-usertree
#   tlmgr --usermode install framed mdframed needspace zref endnotes \
#                            tcolorbox environ trimspaces tikzfill \
#                            csquotes babel-german lato
docs-pdf-de: $(PDF_DIAGRAM_TARGETS_DE) $(TEX_SOURCE_DE) $(VERSION_FILE)
	@command -v xelatex >/dev/null || { echo "xelatex not installed (brew install --cask basictex)"; exit 1; }
	@echo "Building DE PDF version $(DOC_VERSION) ($(DOC_DATE))"
	@TMPDIR=$$(mktemp -d); \
	  sed -e "s|DOC\\\\_VERSION|$(DOC_VERSION)|g" \
	      -e "s|DOC\\\\_DATE|$(DOC_DATE)|g" \
	      "$(TEX_SOURCE_DE)" > "$$TMPDIR/resolve-flow.tex"; \
	  cp -R "$(DIAGRAMS_DE_DIR)" "$$TMPDIR/diagrams"; \
	  ( cd "$$TMPDIR" && xelatex -interaction=nonstopmode resolve-flow.tex >/dev/null 2>&1; \
	                     xelatex -interaction=nonstopmode resolve-flow.tex >/dev/null 2>&1 ); \
	  if [ -f "$$TMPDIR/resolve-flow.pdf" ]; then \
	    cp "$$TMPDIR/resolve-flow.pdf" "$(PDF_TARGET_DE)"; \
	  else \
	    echo "xelatex failed; see $$TMPDIR/resolve-flow.log"; exit 1; \
	  fi; \
	  rm -rf "$$TMPDIR"

docs-pdf-en: $(PDF_DIAGRAM_TARGETS_EN) $(TEX_SOURCE_EN) $(VERSION_FILE)
	@command -v xelatex >/dev/null || { echo "xelatex not installed (brew install --cask basictex)"; exit 1; }
	@echo "Building EN PDF version $(DOC_VERSION) ($(DOC_DATE))"
	@TMPDIR=$$(mktemp -d); \
	  sed -e "s|DOC\\\\_VERSION|$(DOC_VERSION)|g" \
	      -e "s|DOC\\\\_DATE|$(DOC_DATE)|g" \
	      "$(TEX_SOURCE_EN)" > "$$TMPDIR/resolve-flow.tex"; \
	  cp -R "$(DIAGRAMS_EN_DIR)" "$$TMPDIR/diagrams"; \
	  ( cd "$$TMPDIR" && xelatex -interaction=nonstopmode resolve-flow.tex >/dev/null 2>&1; \
	                     xelatex -interaction=nonstopmode resolve-flow.tex >/dev/null 2>&1 ); \
	  if [ -f "$$TMPDIR/resolve-flow.pdf" ]; then \
	    cp "$$TMPDIR/resolve-flow.pdf" "$(PDF_TARGET_EN)"; \
	  else \
	    echo "xelatex failed; see $$TMPDIR/resolve-flow.log"; exit 1; \
	  fi; \
	  rm -rf "$$TMPDIR"

# Print the version stamp the next docs build will use.
docs-version:
	@echo "$(DOC_VERSION) ($(DOC_DATE))"

# Drop generated artefacts. SVGs are kept since they are committed
# assets so GitHub can render them.
docs-clean:
	rm -f $(PDF_TARGET_DE) $(PDF_TARGET_EN)
	rm -f $(PDF_DIAGRAM_TARGETS_DE) $(PDF_DIAGRAM_TARGETS_EN)

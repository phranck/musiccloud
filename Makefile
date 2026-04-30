# Repo-root Makefile.
#
# Scoped to documentation generation. Code build/test still goes through
# the workspace npm scripts.

DOCS_DIR := docs/resolve-flow
DIAGRAMS_DIR := $(DOCS_DIR)/diagrams
D2_SOURCES := $(wildcard $(DIAGRAMS_DIR)/*.d2)
SVG_TARGETS := $(D2_SOURCES:.d2=.svg)
PDF_DIAGRAM_TARGETS := $(D2_SOURCES:.d2=.pdf)
TEX_SOURCE := $(DOCS_DIR)/resolve-flow.tex
PDF_TARGET := $(DOCS_DIR)/resolve-flow.pdf
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

.PHONY: docs docs-svg docs-diagram-pdfs docs-pdf docs-clean docs-version

# `make docs` builds everything: SVGs (for GitHub web view), per-diagram
# PDFs (for the typeset PDF), then the typeset PDF itself.
docs: docs-svg docs-diagram-pdfs docs-pdf

# Render every .d2 source to both .svg and .pdf. SVGs are committed so
# GitHub can render them inline anywhere they end up referenced; PDFs
# are what xelatex embeds, because piping SVG through rsvg-convert lost
# some path segments.
$(DIAGRAMS_DIR)/%.svg: $(DIAGRAMS_DIR)/%.d2
	@command -v d2 >/dev/null || { echo "d2 not installed (brew install d2)"; exit 1; }
	d2 "$<" "$@"

$(DIAGRAMS_DIR)/%.pdf: $(DIAGRAMS_DIR)/%.d2
	@command -v d2 >/dev/null || { echo "d2 not installed (brew install d2)"; exit 1; }
	d2 "$<" "$@"

docs-svg: $(SVG_TARGETS)
docs-diagram-pdfs: $(PDF_DIAGRAM_TARGETS)

# Render the main PDF. The .tex file is the authoritative source.
# DOC_VERSION and DOC_DATE placeholders are substituted into a
# temporary copy before xelatex runs, so the source file stays
# free of build-time metadata.
#
# Build deps:
#   brew install d2
#   brew install --cask basictex font-barlow
#   tlmgr --usermode init-usertree
#   tlmgr --usermode install framed mdframed needspace zref endnotes
docs-pdf: $(PDF_DIAGRAM_TARGETS) $(TEX_SOURCE) $(VERSION_FILE)
	@command -v xelatex >/dev/null || { echo "xelatex not installed (brew install --cask basictex)"; exit 1; }
	@echo "Building PDF version $(DOC_VERSION) ($(DOC_DATE))"
	@TMPDIR=$$(mktemp -d); \
	  sed -e "s|DOC\\\\_VERSION|$(DOC_VERSION)|g" \
	      -e "s|DOC\\\\_DATE|$(DOC_DATE)|g" \
	      "$(TEX_SOURCE)" > "$$TMPDIR/resolve-flow.tex"; \
	  cp -R "$(DIAGRAMS_DIR)" "$$TMPDIR/diagrams"; \
	  ( cd "$$TMPDIR" && xelatex -interaction=nonstopmode resolve-flow.tex >/dev/null 2>&1; \
	                     xelatex -interaction=nonstopmode resolve-flow.tex >/dev/null 2>&1 ); \
	  if [ -f "$$TMPDIR/resolve-flow.pdf" ]; then \
	    cp "$$TMPDIR/resolve-flow.pdf" "$(PDF_TARGET)"; \
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
	rm -f $(PDF_TARGET)
	rm -f $(PDF_DIAGRAM_TARGETS)

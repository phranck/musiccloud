import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchDialog } from "./SearchDialog";

describe("SearchDialog", () => {
  it("normalizes the modal search surface through its complete compound API", () => {
    const html = renderToStaticMarkup(
      <SearchDialog open aria-label="Search API reference">
        <SearchDialog.Header>
          <SearchDialog.Header.Title>Search API reference</SearchDialog.Header.Title>
          <SearchDialog.Header.Search>
            <SearchDialog.Header.Search.Icon>Icon</SearchDialog.Header.Search.Icon>
            <SearchDialog.Header.Search.Input
              role="combobox"
              aria-autocomplete="list"
              aria-controls="api-search-results"
              aria-expanded="true"
            />
            <SearchDialog.Header.Search.Clear>Clear</SearchDialog.Header.Search.Clear>
          </SearchDialog.Header.Search>
          <SearchDialog.Header.Addon>
            <SearchDialog.Header.Close>Close</SearchDialog.Header.Close>
          </SearchDialog.Header.Addon>
        </SearchDialog.Header>
        <SearchDialog.Body>
          <SearchDialog.Body.Status>3 results</SearchDialog.Body.Status>
          <SearchDialog.Results id="api-search-results">
            <SearchDialog.Group aria-labelledby="resolve-group">
              <SearchDialog.Group.Header>
                <SearchDialog.Group.Header.Title id="resolve-group">Resolve</SearchDialog.Group.Header.Title>
                <SearchDialog.Group.Header.Addon>3</SearchDialog.Group.Header.Addon>
              </SearchDialog.Group.Header>
              <SearchDialog.Group.Items>
                <SearchDialog.Result role="option" aria-selected="true">
                  <SearchDialog.Result.Icon>Icon</SearchDialog.Result.Icon>
                  <SearchDialog.Result.Content>
                    <SearchDialog.Result.Title>Quick resolve</SearchDialog.Result.Title>
                    <SearchDialog.Result.Snippet>Resolve a music URL.</SearchDialog.Result.Snippet>
                  </SearchDialog.Result.Content>
                  <SearchDialog.Result.Addon>POST</SearchDialog.Result.Addon>
                </SearchDialog.Result>
              </SearchDialog.Group.Items>
            </SearchDialog.Group>
          </SearchDialog.Results>
          <SearchDialog.Empty>No results</SearchDialog.Empty>
        </SearchDialog.Body>
        <SearchDialog.Footer>
          <SearchDialog.Footer.Hints>
            <SearchDialog.Footer.Hint>↑ ↓ Navigate</SearchDialog.Footer.Hint>
          </SearchDialog.Footer.Hints>
        </SearchDialog.Footer>
      </SearchDialog>,
    );

    expect(html).toMatch(
      /<dialog[^>]*open=""[^>]*aria-label="Search API reference"[^>]*class="search-dialog surface-card">/,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('class="search-dialog__group-items"');
    expect(html).toContain('class="search-dialog__result-content"');
    expect(html).toContain('class="search-dialog__footer-hint"');
  });

  it("keeps the surface-card dialog horizontally centered at every viewport size", () => {
    const css = readFileSync(join(import.meta.dirname, "../../styles/docs.css"), "utf8");

    expect(css).toMatch(/\.search-dialog\.surface-card\s*\{[^}]*margin:\s*0 auto;/s);
    expect(css).toMatch(
      /\.search-dialog__header-search-input::-webkit-search-cancel-button\s*\{[^}]*display:\s*none;/s,
    );
  });
});

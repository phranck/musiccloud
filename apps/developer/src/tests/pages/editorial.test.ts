import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagesDir = join(import.meta.dirname, "../../pages");
const componentsDir = join(import.meta.dirname, "../../components/editorial");

describe("managed editorial page routing", () => {
  it("keeps a dedicated system-owned docs descendant boundary ahead of the root catch-all", () => {
    const catchAll = readFileSync(join(pagesDir, "[...path].astro"), "utf8");
    const docsCatchAll = readFileSync(join(pagesDir, "docs/[...path].astro"), "utf8");

    expect(catchAll).toContain("isManagedEditorialPath");
    expect(catchAll).toMatch(/isManagedEditorialPath\([^)]*\)[\s\S]*fetchEditorialPage/);
    expect(docsCatchAll).not.toContain("fetchEditorialPage");
    expect(docsCatchAll).toContain("Documentation page not found");
    expect(docsCatchAll).toContain("Astro.response.status = 404");
  });

  it("funnels sanitized backend HTML through one EditorialMarkdown injection site", () => {
    const page = readFileSync(join(componentsDir, "EditorialPage.astro"), "utf8");
    const markdown = readFileSync(join(componentsDir, "EditorialMarkdown.astro"), "utf8");

    expect(page).toContain("<EditorialMarkdown html={page.contentHtml}");
    expect(page).toContain("<BaseLayout");
    expect(page).toContain("<PublicHeader");
    expect(page).toContain("<PublicFooter");
    expect(page).toContain("<SurfaceCard.Body>");
    expect(markdown).toContain("set:html={html}");
  });

  it("renders safe Failure correlation and a separate NotFound state", () => {
    const catchAll = readFileSync(join(pagesDir, "[...path].astro"), "utf8");

    expect(catchAll).toContain('result.status === "not-found"');
    expect(catchAll).toContain("result.error.errorId");
    expect(catchAll).toContain("result.error.code");
    expect(catchAll).toContain("Astro.response.status = 503");
  });
});

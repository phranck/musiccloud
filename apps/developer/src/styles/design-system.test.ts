import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type StyleSource, scanDeveloperStyles } from "./design-system-guard";

const sourceRoot = join(import.meta.dirname, "..");
const appRoot = join(sourceRoot, "..");

/** Reads a Developer Portal source file relative to `apps/developer`. */
function readDeveloperFile(path: string): string {
  return readFileSync(join(appRoot, path), "utf8");
}

/** Collects every authored stylesheet-bearing source file below `src`. */
function collectStyleSources(directory: string): StyleSource[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectStyleSources(path);
    if (!/\.(?:astro|css|tsx)$/.test(entry.name)) return [];

    return [{ path: path.slice(appRoot.length + 1), content: readFileSync(path, "utf8") }];
  });
}

/** Collects authored files below a directory for structural source-tree assertions. */
function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path);

    return [path.slice(appRoot.length + 1)];
  });
}

describe("developer design system", () => {
  it("loads one canonical runtime theme in the app and coming-soon fallback", () => {
    const theme = readDeveloperFile("public/developer-theme.css");
    const layout = readDeveloperFile("src/layouts/BaseLayout.astro");
    const fallback = readDeveloperFile("src/lib/coming-soon.ts");

    expect(theme).toContain("--mc-color-accent:");
    expect(theme).toContain("--mc-space-page-inline:");
    expect(theme).toMatch(/@media \(max-width: 40rem\)[\s\S]*--mc-space-page-inline:\s*0\.75rem;/);
    expect(theme).toContain("--mc-motion-duration-fast:");
    expect(layout).toContain('href="/developer-theme.css"');
    expect(fallback).toContain('href="/developer-theme.css"');
    expect(fallback).not.toContain("--sky-top:");
  });

  it("keeps the global stylesheet as an ordered import entry point", () => {
    const globalCss = readDeveloperFile("src/styles/global.css");

    expect(globalCss.trim()).toBe(
      [
        '@import "tailwindcss";',
        '@import "./tokens.css";',
        '@import "./base.css";',
        '@import "./components.css";',
      ].join("\n"),
    );
  });

  it("declares the canonical cascade order before every component layer", () => {
    const layerOrder = "@layer properties, theme, base, components, utilities;";
    const componentStyles = ["src/styles/components.css", "src/styles/docs.css", "src/styles/pricing-material.css"];

    for (const path of componentStyles) {
      expect(readDeveloperFile(path).startsWith(`${layerOrder}\n`), path).toBe(true);
    }
  });

  it("centers text-leading icons on the first rendered line", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const searchDialog = readDeveloperFile("src/components/docs/SearchDialog.tsx");

    expect(components).toMatch(/\.page-heading\s*\{[^}]*align-items:\s*flex-start;/s);
    expect(components).toMatch(/\.page-heading__icon\s*\{[^}]*margin-block-start:\s*calc\(/s);
    expect(components).toMatch(
      /\.icon-text-first-line__icon\s*\{[^}]*height:\s*1lh;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
    );
    expect(searchDialog).toContain("search-dialog__result-icon icon-text-first-line__icon");
  });

  it("centers API section icons against the trimmed visible heading text", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(
      /\.api-reference-content-heading\[data-api-content-heading\]\s*>\s*span\s*\{[^}]*text-box:\s*trim-both cap alphabetic;/s,
    );
  });

  it("reports raw style drift with path, line, and offending value", () => {
    const diagnostics = scanDeveloperStyles([
      {
        path: "src/components/Fixture.astro",
        content: '<div class="rounded-[9px] gap-[13px]" style="color: #ff0000"></div>',
      },
    ]);

    expect(diagnostics).toEqual([
      { path: "src/components/Fixture.astro", line: 1, rule: "raw-color", value: "#ff0000" },
      { path: "src/components/Fixture.astro", line: 1, rule: "structural-utility", value: "rounded-[9px]" },
      { path: "src/components/Fixture.astro", line: 1, rule: "structural-utility", value: "gap-[13px]" },
    ]);
  });

  it("keeps authored Developer Portal sources free from raw style drift", () => {
    expect(scanDeveloperStyles(collectStyleSources(sourceRoot))).toEqual([]);
  });

  it("keeps test modules outside Astro's file-based route tree", () => {
    const routeTests = collectFiles(join(sourceRoot, "pages")).filter((path) => /\.(?:test|spec)\.[^.]+$/.test(path));

    expect(routeTests).toEqual([]);
  });
});

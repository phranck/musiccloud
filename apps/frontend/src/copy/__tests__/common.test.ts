import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.join(process.cwd(), "src");
const legacyLocaleCleanupPath = path.join(sourceRoot, "lib/legacy-locale-cleanup.ts");
const sourceExtensions = new Set([".astro", ".ts", ".tsx"]);

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(entryPath);
    if (!sourceExtensions.has(path.extname(entry.name))) return [];
    if (/\.(?:test|spec)\.[^.]+$/.test(entry.name)) return [];
    return [entryPath];
  });
}

function relativeSourcePath(filePath: string): string {
  return path.relative(sourceRoot, filePath);
}

describe("English-only frontend architecture", () => {
  it("contains no runtime localization providers, hooks, switchers, or request negotiation", () => {
    const forbiddenRuntimeI18n = [
      ["LocaleProvider", /\bLocaleProvider\b/],
      ["useLocale", /\buseLocale\s*\(/],
      ["useT", /\buseT\s*\(/],
      ["LanguageSwitcher", /\bLanguageSwitcher\b/],
      ["getRequestLocale", /\bgetRequestLocale\b/],
    ] as const;

    const violations = productionSourceFiles(sourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbiddenRuntimeI18n
        .filter(([, pattern]) => pattern.test(source))
        .map(([symbol]) => `${relativeSourcePath(filePath)}: ${symbol}`);
    });

    expect(violations).toEqual([]);
  });

  it("does not send locale parameters with editorial content or navigation requests", () => {
    const apiClient = readFileSync(path.join(sourceRoot, "api/client.ts"), "utf8");

    expect(apiClient).not.toMatch(/ENDPOINTS\.v1\.nav[\s\S]*?locale=/u);
    expect(apiClient).not.toMatch(/ENDPOINTS\.v1\.content\.detail[\s\S]*?locale=/u);
  });

  it("declares the document language statically as English", () => {
    const baseLayout = readFileSync(path.join(sourceRoot, "layouts/BaseLayout.astro"), "utf8");

    expect(baseLayout).toContain('<html lang="en">');
    expect(baseLayout).not.toMatch(/<html\s+lang=\{/u);
  });

  it("keeps the retired mc:locale key only in the one-time compatibility cleanup", () => {
    const occurrences = productionSourceFiles(sourceRoot)
      .filter((filePath) => readFileSync(filePath, "utf8").includes("mc:locale"))
      .map(relativeSourcePath);

    expect(occurrences).toEqual([relativeSourcePath(legacyLocaleCleanupPath)]);
  });
});

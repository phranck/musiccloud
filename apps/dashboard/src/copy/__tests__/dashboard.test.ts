import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dashboardCopy } from "@/copy/dashboard";

const sourceRoot = path.join(process.cwd(), "src");
const sourceExtensions = new Set([".ts", ".tsx"]);

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(entryPath);
    if (!sourceExtensions.has(path.extname(entry.name))) return [];
    if (/\.(?:test|spec)\.[^.]+$/.test(entry.name)) return [];
    return [entryPath];
  });
}

describe("English-only dashboard architecture", () => {
  it("exports the existing English copy statically", () => {
    expect(dashboardCopy.auth.login.title).toBe("Sign In");
    expect(dashboardCopy.layout.sidebar.logout).toBe("Log out");
  });

  it("contains no runtime localization provider, hook, switcher, locale type, or persistence key", () => {
    const forbidden = [
      ["I18nProvider", /\bI18nProvider\b/],
      ["useI18n", /\buseI18n\s*\(/],
      ["LanguageToggle", /\bLanguageToggle\b/],
      ["DashboardLocale", /\bDashboardLocale\b/],
      ["dashboard-locale", /dashboard-locale/],
    ] as const;

    const violations = productionSourceFiles(sourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return forbidden
        .filter(
          ([symbol, pattern]) =>
            pattern.test(source) &&
            !(symbol === "dashboard-locale" && filePath.endsWith("lib/legacy-locale-cleanup.ts")),
        )
        .map(([symbol]) => `${path.relative(sourceRoot, filePath)}: ${symbol}`);
    });

    expect(violations).toEqual([]);
  });

  it("declares the dashboard document language as English", () => {
    const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('<html lang="en">');
  });
});

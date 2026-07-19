import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");
const appsRoot = resolve(repositoryRoot, "apps");
const backendSourceRoot = resolve(process.cwd(), "src");
const scriptsRoot = resolve(repositoryRoot, "scripts");

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) {
        if (
          [".astro", ".build", "__tests__", "Tests", "build", "dist", "migrations", "node_modules"].includes(entry.name)
        ) {
          return [];
        }
        return sourceFiles(path);
      }
      if (![".ts", ".tsx", ".js", ".mjs", ".astro", ".swift"].includes(extname(entry.name))) return [];
      if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) return [];
      return [path];
    }),
  );
  return files.flat();
}

function pathFromRoot(path: string): string {
  return relative(repositoryRoot, path);
}

const localeFieldAllowlist = new Map<string, string>([
  ["apps/backend/src/db/adapters/postgres-artists.ts", "artist identity names, texts, events and memberships"],
  ["apps/backend/src/db/adapters/postgres.ts", "artist identity data and the retained admin profile preference"],
  ["apps/backend/src/db/repository.ts", "artist identity data and native app telemetry"],
  [
    "apps/backend/src/db/schemas/postgres.ts",
    "artist/place data, admin preference, telemetry and dormant legacy tables",
  ],
  ["apps/backend/src/routes/telemetry-app-error.ts", "native app telemetry input"],
  ["apps/backend/src/services/telemetry-app.ts", "native app telemetry persistence"],
  ["apps/Apple/App/Shared/Diagnostics/TelemetryEvent.swift", "native app telemetry capture"],
]);

describe("editorial locale removal architecture", () => {
  it("keeps translation-table access outside runtime code", async () => {
    const files = [...(await sourceFiles(backendSourceRoot)), ...(await sourceFiles(scriptsRoot))];
    const tableNames = [
      "content_page_translations",
      "page_segment_translations",
      "nav_item_translations",
      "contentPageTranslations",
      "pageSegmentTranslations",
      "navItemTranslations",
    ];
    const allowed = new Set([
      "apps/backend/src/db/database-readiness.ts",
      "apps/backend/src/db/schemas/postgres.ts",
      "scripts/audit-content-i18n.mjs",
    ]);
    const violations: string[] = [];

    for (const path of files) {
      const source = await readFile(path, "utf8");
      if (tableNames.some((table) => source.includes(table)) && !allowed.has(pathFromRoot(path))) {
        violations.push(pathFromRoot(path));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps every production locale field inside an explicit non-editorial domain", async () => {
    const files = await sourceFiles(appsRoot);
    const inventory: Array<{ path: string; domain: string }> = [];

    for (const path of files) {
      const source = await readFile(path, "utf8");
      if (!/\blocale\??\s*:/.test(source)) continue;
      const projectPath = pathFromRoot(path);
      const domain = localeFieldAllowlist.get(projectPath);
      inventory.push({ path: projectPath, domain: domain ?? "UNREVIEWED" });
    }

    expect(inventory.filter(({ domain }) => domain === "UNREVIEWED")).toEqual([]);
    expect(inventory.map(({ path }) => path).sort()).toEqual([...localeFieldAllowlist.keys()].sort());
  });

  it("does not retain removed translation modules", async () => {
    const files = (await sourceFiles(backendSourceRoot)).map(pathFromRoot);
    expect(files).not.toContain("apps/backend/src/routes/admin-page-translations.ts");
    expect(files).not.toContain("apps/backend/src/services/admin-translations.ts");
  });
});

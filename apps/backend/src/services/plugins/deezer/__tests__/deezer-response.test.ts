import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable.js";
import { deezerGet } from "../deezer-response.js";

/** The backend source root, from this file's directory. */
const BACKEND_SOURCE = join(import.meta.dirname, "../../../..");

/** Every TypeScript file below `directory`, tests left out because they stand in for Deezer. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Deezer client", () => {
  it("is the only place that names the Deezer API", () => {
    // Built at runtime, so this file does not name the API itself.
    const api = ["https://api", "deezer", "com"].join(".");
    const naming = sourceFiles(BACKEND_SOURCE)
      .filter((path) => readFileSync(path, "utf8").includes(api))
      .map((path) => relative(BACKEND_SOURCE, path));

    expect(naming).toEqual(["services/plugins/deezer/deezer-response.ts"]);
  });
});

describe("deezerGet", () => {
  it("returns the body of a normal answer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 200 }));

    await expect(deezerGet<{ id: number }>("/artist/1", "artist lookup")).resolves.toEqual({ id: 1 });
  });

  it("returns null for a 404 and for Deezer's no-data error inside a 200 answer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    await expect(deezerGet("/artist/1", "artist lookup")).resolves.toBeNull();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: "DataException", message: "no data", code: 800 } }), {
        status: 200,
      }),
    );
    await expect(deezerGet("/artist/1", "artist lookup")).resolves.toBeNull();
  });

  it("throws for any other error inside a 200 answer, such as the quota", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: "Exception", message: "Quota limit exceeded", code: 4 } }), {
        status: 200,
      }),
    );

    await expect(deezerGet("/artist/1", "artist lookup")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

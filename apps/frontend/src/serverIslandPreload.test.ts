// @vitest-environment node
import { ServerIslandComponent } from "astro/runtime/server/render/server-islands.js";
import { describe, expect, it } from "vitest";

/** The island's component path, as Astro passes it to the island it renders. */
const ISLAND_COMPONENT_PATH = "src/components/layout/DeferredFooter.astro";

/** The name Astro gives the island in its server island endpoint. */
const ISLAND_NAME = "DeferredFooter";

/**
 * Builds the island for the deferred footer against a minimal render result,
 * the way Astro does for `<DeferredFooter server:defer />`.
 *
 * @returns The island and the head entries it asked the page to write.
 */
async function deferredFooterIsland() {
  const extraHead: string[] = [];
  const result = {
    base: "/",
    trailingSlash: "ignore",
    serverIslandNameMap: new Map([[ISLAND_COMPONENT_PATH, ISLAND_NAME]]),
    key: crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]),
    internalFetchHeaders: {},
    _metadata: { extraHead, extraScriptHashes: [] },
  };
  const props = { "server:component-path": ISLAND_COMPONENT_PATH, "server:component-export": "default" };
  const island = new ServerIslandComponent(result as never, props, {}, ISLAND_NAME);
  return { island, extraHead };
}

describe("server island preload", () => {
  /**
   * WebKit never hands an `as=fetch` preload to the island's later `fetch()`,
   * so a preload made Safari request the island twice. `patches/astro@5.17.3.patch`
   * removes it; this fails when an Astro version without the patch writes it again.
   */
  it("writes no preload into the head, and the island still fetches its content by GET", async () => {
    const { island, extraHead } = await deferredFooterIsland();
    const content = await island.getIslandContent();

    expect(extraHead.map(String)).toEqual([]);
    expect(content).toMatch(/fetch\('\/_server-islands\/DeferredFooter\?e=[^']+&p=&s=', \{ headers \}\)/);
  });
});

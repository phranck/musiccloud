import { describe, expect, it, vi } from "vitest";

import { createRenderedPageCache } from "./rendered-page-cache";

const LIFETIME_MS = 1000;

/** A cache on a clock the test moves by hand. */
function cacheWithClock() {
  let time = 0;
  const respond = createRenderedPageCache(LIFETIME_MS, () => time);
  return {
    respond,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}

describe("createRenderedPageCache", () => {
  it("renders once and answers with the same page until its lifetime ends", async () => {
    const { respond, advance } = cacheWithClock();
    const render = vi.fn(async () => new Response("reference", { headers: { "content-security-policy": "policy" } }));

    const first = await respond(render);
    advance(LIFETIME_MS - 1);
    const second = await respond(render);

    expect(render).toHaveBeenCalledOnce();
    expect(await second.text()).toBe("reference");
    expect(second.headers.get("content-security-policy")).toBe("policy");
    expect(await first.text()).toBe("reference");

    advance(1);
    await respond(render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("keeps no failed render, so the next request renders again", async () => {
    const { respond } = cacheWithClock();
    const render = vi.fn(async () => new Response("unavailable", { status: 503 }));

    expect((await respond(render)).status).toBe(503);
    await respond(render);

    expect(render).toHaveBeenCalledTimes(2);
  });

  /** A cookie set for the visitor whose request rendered the page belongs to that visitor alone. */
  it("never hands one visitor's cookie to the next", async () => {
    const { respond } = cacheWithClock();
    const render = async () =>
      new Response("reference", { headers: { "set-cookie": "session=one", "x-other": "kept" } });

    const answer = await respond(render);

    expect(answer.headers.has("set-cookie")).toBe(false);
    expect(answer.headers.get("x-other")).toBe("kept");
  });
});

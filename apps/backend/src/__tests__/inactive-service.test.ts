/**
 * `findInactiveServiceFor` decides whether a pasted link is answered with
 * "this service is unavailable" or with "not a music link". It runs against
 * the real plugins here, so every detector a resolver could route a link
 * through is the one asked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pluginStates = vi.hoisted(() => new Map<string, boolean>());

vi.mock("../db/plugin-repository.js", () => ({
  readPluginStatesFromDb: vi.fn(async () =>
    Array.from(pluginStates.entries()).map(([id, enabled]) => ({ id, enabled, updatedAt: new Date() })),
  ),
}));

const { findInactiveServiceFor, invalidateEnabledCache } = await import("../services/plugins/registry.js");

/**
 * The credentials the KKBOX plugin's manifest requires. The tests remove them
 * so KKBOX stands for a switched-on service that lacks its credentials.
 */
const KKBOX_CREDENTIAL_ENV = ["KKBOX_CLIENT_ID", "KKBOX_CLIENT_SECRET"] as const;

describe("findInactiveServiceFor", () => {
  /** The values {@link KKBOX_CREDENTIAL_ENV} held before each test, restored after it. */
  let savedCredentials = new Map<string, string | undefined>();

  beforeEach(() => {
    pluginStates.clear();
    invalidateEnabledCache();
    savedCredentials = new Map(KKBOX_CREDENTIAL_ENV.map((name) => [name, process.env[name]]));
    for (const name of KKBOX_CREDENTIAL_ENV) delete process.env[name];
  });

  afterEach(() => {
    for (const [name, value] of savedCredentials) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("names a switched-off service for its album link and its artist link", async () => {
    // MusicBrainz is off unless the admin turns it on.
    await expect(
      findInactiveServiceFor("https://musicbrainz.org/release/b84ee12a-09ef-421b-82de-0441a926375b"),
    ).resolves.toBe("musicbrainz");
    await expect(
      findInactiveServiceFor("https://musicbrainz.org/artist/b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"),
    ).resolves.toBe("musicbrainz");
  });

  it("names a switched-on service that lacks its credentials", async () => {
    await expect(findInactiveServiceFor("https://www.kkbox.com/tw/tc/artist/OpYn0tBqZ4zG2Sk3wZ")).resolves.toBe(
      "kkbox",
    );
  });

  it("names a service the admin switched off", async () => {
    pluginStates.set("deezer", false);

    await expect(findInactiveServiceFor("https://www.deezer.com/album/302127")).resolves.toBe("deezer");
  });

  it("finds nothing for a link of an active service", async () => {
    await expect(findInactiveServiceFor("https://www.deezer.com/album/302127")).resolves.toBeNull();
    await expect(findInactiveServiceFor("https://www.deezer.com/track/3135556")).resolves.toBeNull();
  });

  it("finds nothing for a link no plugin claims", async () => {
    await expect(findInactiveServiceFor("https://www.example.com/album/123")).resolves.toBeNull();
  });
});

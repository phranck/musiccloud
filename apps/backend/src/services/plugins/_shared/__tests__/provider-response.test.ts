import { Service } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable.js";
import { readProviderJson } from "../provider-response.js";

describe("readProviderJson", () => {
  it("answers the parsed body", async () => {
    const response = new Response(JSON.stringify({ items: [1, 2] }));

    expect(await readProviderJson<{ items: number[] }>(response, Service.Deezer, "album search")).toEqual({
      items: [1, 2],
    });
  });

  it("answers a JSON null as it is, leaving the envelope check to the caller", async () => {
    expect(await readProviderJson(new Response("null"), Service.Deezer, "album search")).toBeNull();
  });

  it("throws an upstream failure naming the operation when the body is not JSON", async () => {
    const reading = readProviderJson(new Response("<html>busy</html>"), Service.SoundCloud, "track search");

    await expect(reading).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(readProviderJson(new Response("<html>"), Service.SoundCloud, "track search")).rejects.toMatchObject({
      source: Service.SoundCloud,
      message: "track search answered with a body that is not JSON",
      cause: expect.any(SyntaxError),
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { JSON_LD_SCRIPT_PATTERN, readJsonLd } from "../json-ld.js";

/** Wraps a JSON-LD body in the block form Bandcamp, Melon and Boomplay write. */
function objectBlock(body: string): string {
  return `<script type="application/ld+json">\n${body}\n</script>`;
}

/** A recording block as a track page carries it. */
const RECORDING = { "@type": "MusicRecording", name: "Song" };

describe("readJsonLd", () => {
  it("returns the first block when its @type matches", () => {
    expect(readJsonLd(objectBlock(JSON.stringify(RECORDING)), "MusicRecording")).toEqual(RECORDING);
  });

  it("returns null when the first block has another @type, even if a later block matches", () => {
    const html = `${objectBlock('{"@type":"WebPage"}')}${objectBlock(JSON.stringify(RECORDING))}`;
    expect(readJsonLd(html, "MusicRecording")).toBeNull();
  });

  it("returns null for a page without a block", () => {
    expect(readJsonLd("<html></html>", "MusicRecording")).toBeNull();
  });

  it("reports a block that is not JSON and returns null", () => {
    const onInvalid = vi.fn();
    expect(readJsonLd(objectBlock("{not json}"), "MusicRecording", { onInvalid })).toBeNull();
    expect(onInvalid).toHaveBeenCalledOnce();
  });

  it("does not report a block with another @type", () => {
    const onInvalid = vi.fn();
    readJsonLd(objectBlock('{"@type":"WebPage"}'), "MusicRecording", { onInvalid });
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("does not read a block whose tag has attributes after type under the default pattern", () => {
    const html = `<script type="application/ld+json" id="schema">${JSON.stringify(RECORDING)}</script>`;
    expect(readJsonLd(html, "MusicRecording")).toBeNull();
  });

  it("reads single quotes, other attributes and a parsed null under the script pattern", () => {
    const options = { pattern: JSON_LD_SCRIPT_PATTERN, onInvalid: vi.fn() };
    const html = `<script id="schema" type='application/ld+json' data-x="1">${JSON.stringify(RECORDING)}</script>`;
    expect(readJsonLd(html, "MusicRecording", options)).toEqual(RECORDING);
    expect(readJsonLd(`<script type="application/ld+json">null</script>`, "MusicRecording", options)).toBeNull();
    expect(readJsonLd(`<script type="application/ld+json"></script>`, "MusicRecording", options)).toBeNull();
    expect(options.onInvalid).toHaveBeenCalledTimes(2);
  });
});

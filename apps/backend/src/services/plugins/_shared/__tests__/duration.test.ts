import { describe, expect, it } from "vitest";
import { parseClockDurationMs, parseIsoDurationMs } from "../duration.js";

/*
 * The six parsers below are verbatim copies of the adapters' own parsers. They
 * are the reference the shared calls are checked against while the adapters
 * move over.
 */

/** Tidal's string branch, from `tidal/adapter.ts`. */
function oldTidal(duration: string): number | undefined {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(duration);
  if (!match || !match.slice(1).some((component) => component !== undefined)) return undefined;
  const hours = Number(match[1]) || 0;
  const minutes = Number(match[2]) || 0;
  const seconds = Number(match[3]) || 0;
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/** Bandcamp's parser, from `bandcamp/adapter.ts`. */
function oldBandcamp(iso: string): number | undefined {
  const match = /^P(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return undefined;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/** Melon's and Boomplay's parser, identical in `melon/adapter.ts` and `boomplay/adapter.ts`. */
function oldMelonBoomplay(iso: string): number | undefined {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return undefined;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/** YouTube's parser, from `youtube/adapter.ts`. */
function oldYouTube(iso: string): number {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/** Beatport's `length` branch, from `mapTrack` in `beatport/adapter.ts`. */
function oldBeatport(length: string): number | undefined {
  const parts = length.split(":");
  if (parts.length !== 2) return undefined;
  return (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)) * 1000;
}

/** Period inputs: the providers' own forms, fractional seconds, a missing `T`, misses and embedded periods. */
const PERIOD_INPUTS = [
  "PT4M30S",
  "PT1H2M3S",
  "PT03M45S",
  "PT1H",
  "PT45S",
  "PT5M41.5S",
  "PT0.25S",
  "PT1.S",
  "P00H03M45S",
  "P3M45S",
  "P1DT2H",
  "PT",
  "P",
  "",
  "abc",
  "pt3m",
  "PT3M45",
  "PT4M30S ",
  "xxPT4M30Syy",
  "PT4M30.5S",
  "T4M30S",
];

/** Clock inputs: Beatport's form, padded parts, the wrong part count and parts without digits. */
const CLOCK_INPUTS = ["7:22", "07:05", "0:00", "12:3", "1:02:03", "722", "", "a:b", "7:2x", " 7:22"];

/** Each adapter's call, as the adapter makes it. */
const SHARED_CALLS = {
  tidal: (text: string) => parseIsoDurationMs(text, { fractionalSeconds: true, requireComponent: true }),
  bandcamp: (text: string) => parseIsoDurationMs(text, { timeDesignator: false }),
  melonBoomplay: (text: string) => parseIsoDurationMs(text),
  youtube: (text: string) => parseIsoDurationMs(text, { embedded: true }) ?? 0,
};

/** The reference each call is checked against. */
const OLD_PARSERS: Record<keyof typeof SHARED_CALLS, (text: string) => number | undefined> = {
  tidal: oldTidal,
  bandcamp: oldBandcamp,
  melonBoomplay: oldMelonBoomplay,
  youtube: oldYouTube,
};

describe("parseIsoDurationMs", () => {
  for (const [adapter, call] of Object.entries(SHARED_CALLS)) {
    it.each(PERIOD_INPUTS)(`answers ${adapter}'s old parser for %j`, (input) => {
      expect(call(input)).toBe(OLD_PARSERS[adapter as keyof typeof SHARED_CALLS](input));
    });
  }
});

describe("parseClockDurationMs", () => {
  it.each(CLOCK_INPUTS)("answers Beatport's old parser for %j", (input) => {
    expect(parseClockDurationMs(input)).toBe(oldBeatport(input));
  });
});

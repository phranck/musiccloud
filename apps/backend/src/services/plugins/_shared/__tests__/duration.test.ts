import { describe, expect, it } from "vitest";
import { parseClockDurationMs, parseIsoDurationMs } from "../duration.js";

/**
 * Each adapter's call into the period parser, under the dialect the adapter
 * passes. YouTube maps a miss to `0`, which its track contract reports.
 */
const PERIOD_CALLS = {
  tidal: (text: string) => parseIsoDurationMs(text, { fractionalSeconds: true, requireComponent: true }),
  bandcamp: (text: string) => parseIsoDurationMs(text, { timeDesignator: false }),
  melonBoomplay: (text: string) => parseIsoDurationMs(text),
  youtube: (text: string) => parseIsoDurationMs(text, { embedded: true }) ?? 0,
};

/**
 * One period input and what each adapter answers for it: Tidal, Bandcamp,
 * Melon and Boomplay (one dialect), YouTube. The answers are the ones each
 * adapter's own parser gave before the shared module existed.
 */
type PeriodRow = [
  input: string,
  tidal: number | undefined,
  bandcamp: number | undefined,
  melonBoomplay: number | undefined,
  youtube: number,
];

/** The providers' own forms, fractional seconds, a missing `T`, misses and periods inside longer text. */
const PERIOD_ROWS: PeriodRow[] = [
  ["PT4M30S", 270000, undefined, 270000, 270000],
  ["PT1H2M3S", 3723000, undefined, 3723000, 3723000],
  ["PT03M45S", 225000, undefined, 225000, 225000],
  ["PT1H", 3600000, undefined, 3600000, 3600000],
  ["PT45S", 45000, undefined, 45000, 45000],
  ["PT5M41.5S", 341500, undefined, undefined, 300000],
  ["PT0.25S", 250, undefined, undefined, 0],
  ["PT1.S", undefined, undefined, undefined, 0],
  ["P00H03M45S", undefined, 225000, undefined, 0],
  ["P3M45S", undefined, 225000, undefined, 0],
  ["P1DT2H", undefined, undefined, undefined, 0],
  ["PT", undefined, undefined, 0, 0],
  ["P", undefined, 0, undefined, 0],
  ["", undefined, undefined, undefined, 0],
  ["abc", undefined, undefined, undefined, 0],
  ["pt3m", undefined, undefined, undefined, 0],
  ["PT3M45", undefined, undefined, undefined, 180000],
  ["PT4M30S ", undefined, undefined, undefined, 270000],
  ["xxPT4M30Syy", undefined, undefined, undefined, 270000],
  ["PT4M30.5S", 270500, undefined, undefined, 240000],
  ["T4M30S", undefined, undefined, undefined, 0],
];

/** One clock input and what Beatport's `mapTrack` read from it before the shared module existed. */
const CLOCK_ROWS: Array<[input: string, expected: number | undefined]> = [
  ["7:22", 442000],
  ["07:05", 425000],
  ["0:00", 0],
  ["12:3", 723000],
  ["1:02:03", undefined],
  ["722", undefined],
  ["", undefined],
  ["a:b", Number.NaN],
  ["7:2x", 422000],
  [" 7:22", 442000],
];

describe("parseIsoDurationMs", () => {
  it.each(PERIOD_ROWS)("reads %j as each adapter always has", (input, tidal, bandcamp, melonBoomplay, youtube) => {
    expect({
      tidal: PERIOD_CALLS.tidal(input),
      bandcamp: PERIOD_CALLS.bandcamp(input),
      melonBoomplay: PERIOD_CALLS.melonBoomplay(input),
      youtube: PERIOD_CALLS.youtube(input),
    }).toEqual({ tidal, bandcamp, melonBoomplay, youtube });
  });
});

describe("parseClockDurationMs", () => {
  it.each(CLOCK_ROWS)("reads %j as Beatport always has", (input, expected) => {
    expect(parseClockDurationMs(input)).toBe(expected);
  });
});

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { VinylRecord, type VinylRecordProps } from "./VinylRecord";

export interface TurntableProps {
  className?: string;
  record: VinylRecordProps;
}

const TURNTABLE_SURFACE_STYLE = {
  background: "linear-gradient(180deg, #262b34 0%, #181d24 56%, #0f1319 100%)",
} satisfies CSSProperties;

const PLATTER_STYLE = {
  background: "linear-gradient(180deg, #20262e 0%, #161b22 100%)",
  boxShadow:
    "0 0 0 2px rgba(5,7,10,0.92), 0 0 0 4px rgba(71,78,90,0.52), 0 1px 0 rgba(255,255,255,0.12), inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -2px 3px rgba(0,0,0,0.38)",
} satisfies CSSProperties;

const SPEED_KNOB_STYLE = {
  background:
    "radial-gradient(circle at 48% 48%, #252b35 0 56%, #0b0e13 57.5% 59%, #333944 60% 61.2%, #090b0f 62% 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.13), 0 3px 4px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 -3px 5px rgba(0,0,0,0.32)",
} satisfies CSSProperties;

const SPEED_MARK_STYLE = {
  background: "rgba(222,228,236,0.48)",
  transform: "translateY(-50%) rotate(-150deg)",
  transformOrigin: "0% 50%",
} satisfies CSSProperties;

const LED_STYLE = {
  background:
    "radial-gradient(circle at 35% 30%, #f0ffd8 0 11%, #8dff8c 18%, #2fc956 52%, #0b4f26 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.7), 0 0 4px rgba(104,255,122,0.24), 0 0 12px rgba(48,210,83,0.11), 0 0 22px rgba(48,210,83,0.06), inset 0 1px 1px rgba(255,255,255,0.58), inset 0 -1px 2px rgba(0,0,0,0.48)",
} satisfies CSSProperties;

const LED_GLOW_STYLE = {
  background:
    "radial-gradient(circle, rgba(118,255,133,0.34) 0 12%, rgba(54,218,83,0.19) 26%, rgba(45,186,75,0.09) 43%, transparent 66%)",
  filter: "blur(2px)",
} satisfies CSSProperties;

const SPINDLE_STYLE = {
  background:
    "radial-gradient(circle at 34% 28%, #ffffff 0 9%, #dfe5ea 14% 25%, #8f979e 43%, #343a40 68%, #eef2f5 100%)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.76), 0 1px 2px rgba(0,0,0,0.48), inset 0 1px 1px rgba(255,255,255,0.72), inset 0 -1px 1px rgba(0,0,0,0.58)",
} satisfies CSSProperties;

function brandLetters(word: string) {
  return word.split("").map((letter) => (
    <span aria-hidden="true" key={letter}>
      {letter}
    </span>
  ));
}

export function Turntable({ className, record }: TurntableProps) {
  return (
    <figure
      aria-label="Turntable"
      className={cn("relative aspect-square overflow-hidden rounded-[inherit] bg-[#171a1f]", className)}
      style={TURNTABLE_SURFACE_STYLE}
    >
      <span
        aria-label="music cloud brand"
        className="absolute left-[5.2%] top-[5.2%] z-40 grid w-[10.2%] gap-[0.18em] text-[clamp(0.48rem,1.72vw,0.62rem)] leading-none text-white/85"
        style={{ fontFamily: '"Michroma", var(--font-sans)' }}
      >
        <span className="flex w-full justify-between" aria-hidden="true">
          {brandLetters("music")}
        </span>
        <span className="flex w-full justify-between font-black text-white" aria-hidden="true">
          {brandLetters("cloud")}
        </span>
      </span>

      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 z-10 aspect-square w-[calc(86%_-_4px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        data-turntable-platter="true"
        style={PLATTER_STYLE}
      />

      <span className="absolute bottom-[3.1%] left-[3.1%] z-30 aspect-square w-[19%] font-condensed text-[clamp(0.32rem,1.24vw,0.45rem)] font-bold leading-none tracking-[0.03em] text-white/70">
        <span className="absolute left-[16.7%] top-[36.5%] -translate-y-full whitespace-nowrap">33</span>
        <span className="absolute left-[39.5%] top-[21.9%] -translate-y-full whitespace-nowrap">45</span>
        <span className="absolute left-[15.5%] top-[63.5%] -translate-x-full -translate-y-1/2 whitespace-nowrap">
          ON
        </span>
        <span className="absolute left-[21.9%] top-[87.5%] -translate-x-full whitespace-nowrap">STANDBY</span>
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 aspect-square w-[73%] rounded-full"
          data-turntable-speed-knob="true"
          style={SPEED_KNOB_STYLE}
        >
          <span
            className="absolute left-1/2 top-1/2 h-0.5 w-[38%] rounded-full"
            data-turntable-speed-indicator="true"
            style={SPEED_MARK_STYLE}
          />
        </span>
      </span>

      <span
        aria-label="Power LED"
        className="absolute bottom-[6%] right-[6.2%] z-40 aspect-square w-[calc(2.1%_-_1px)] overflow-visible rounded-full"
        style={LED_STYLE}
      >
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -z-10 aspect-square w-[430%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={LED_GLOW_STYLE}
        />
      </span>

      <span className="absolute left-1/2 top-1/2 z-20 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2">
        <VinylRecord {...record} className={cn("h-full w-full", record.className)} />
      </span>

      <span
        aria-label="Chrome spindle"
        className="pointer-events-none absolute left-1/2 top-1/2 z-50 aspect-square w-[2.15%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={SPINDLE_STYLE}
      />
    </figure>
  );
}

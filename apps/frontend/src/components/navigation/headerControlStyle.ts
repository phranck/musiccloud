/**
 * @file The look every header control shares: a recessed glass track with a
 * raised indicator inside, as the Day/Night switcher draws it. The menu button
 * and the support link both read these, so the header shows one kind of
 * control rather than several that merely resemble each other.
 */

import type { CSSProperties } from "react";
import { raisedControlRadius } from "@/components/cards/cardGeometry";

/**
 * The raised control's corner radius, which is the switcher's indicator radius
 * from the cascade in `cardGeometry`. Set on the raised element and on a panel
 * that drops from it.
 */
export const HEADER_RAISED_RADIUS_STYLE = {
  "--neu-radius-base": raisedControlRadius,
  "--neu-radius-sm": raisedControlRadius,
  borderRadius: "var(--neu-radius)",
} as CSSProperties;

/** Classes of the recessed track a header control sits in, inside its `RecessedCard`. */
export const HEADER_CONTROL_TRACK_CLASS = "mc-glass-nav-track flex p-1";

/**
 * Classes of the raised part of a header control: the glass indicator, its
 * bright text, the 34px height of the switcher's segments, and a focus ring.
 * A control adds its own width and padding.
 */
export const HEADER_CONTROL_RAISED_CLASS =
  "embossed-gradient-border mc-glass-nav-indicator mc-txt-nav-bright relative z-10 flex h-[34px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-none focus-visible:outline-2 focus-visible:outline-white/40 focus-visible:outline-offset-2";

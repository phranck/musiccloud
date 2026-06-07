import type { CSSProperties } from "react";

export const dialogCardRadius = "20px";
export const dialogCardPadding = "10px";
export const dialogButtonWellPadding = "2px";
export const dialogButtonWellRadius = `calc(${dialogCardRadius} - ${dialogCardPadding})`;
export const dialogTransitionMs = 320;
export const dialogTransitionStyle = { transitionDuration: `${dialogTransitionMs}ms` } as CSSProperties;

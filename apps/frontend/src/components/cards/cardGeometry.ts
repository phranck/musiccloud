// Root of the geometry cascade. Resolves to the SSR-injected `--mc-card-radius`
// (the design-token `cardRadius`, default 32px = 2rem) so a saved token blob
// re-rounds every card at runtime; every nested radius derives from it.
export const embossedCardOuterRadius = "var(--mc-card-radius, 2rem)";
export const embossedCardContentInset = "0.75rem";
export const recessedSurfaceRadius = `calc(${embossedCardOuterRadius} - ${embossedCardContentInset})`;
export const recessedControlInset = "0.1875rem";
export const raisedControlRadius = `calc(${recessedSurfaceRadius} - ${recessedControlInset})`;

export const outerEmbossedCardClassName = "w-full max-w-full sm:max-w-lg mx-auto p-0";
export const fullWidthEmbossedCardClassName = "w-full p-0";
export const recessedControlInsetClassName = "p-[var(--mc-recessed-control-inset)]";
export const recessedControlHeightClassName = "h-[47px]";
export const recessedControlSizeClassName = "size-[47px]";

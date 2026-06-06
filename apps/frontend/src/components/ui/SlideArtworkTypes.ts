export const SlideArtworkKind = {
  Square: "square",
  Round: "round",
} as const;

export type SlideArtworkKind = (typeof SlideArtworkKind)[keyof typeof SlideArtworkKind];

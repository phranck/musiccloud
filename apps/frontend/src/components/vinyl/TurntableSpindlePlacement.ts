export const TurntableSpindlePlacement = {
  Deck: "deck",
  Record: "record",
} as const;

export type TurntableSpindlePlacementValue = (typeof TurntableSpindlePlacement)[keyof typeof TurntableSpindlePlacement];

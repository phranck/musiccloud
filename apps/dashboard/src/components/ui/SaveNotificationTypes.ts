export const SaveNotificationPhase = {
  Hidden: "hidden",
  Entering: "entering",
  Visible: "visible",
  Exiting: "exiting",
} as const;

export type SaveNotificationPhase = (typeof SaveNotificationPhase)[keyof typeof SaveNotificationPhase];

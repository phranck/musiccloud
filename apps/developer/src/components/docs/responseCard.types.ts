/** Stable semantic tones shared by response-card renderers and status icons. */
export const ResponseTone = {
  Success: "success",
  ClientError: "client-error",
  ServerError: "server-error",
  Neutral: "neutral",
} as const;

/** One supported semantic response-card tone. */
export type ResponseToneValue = (typeof ResponseTone)[keyof typeof ResponseTone];

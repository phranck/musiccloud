export const shareCopy = {
  copyLink: "Copy share link to clipboard",
  shareLink: "Copy Share Link",
  copied: "Copied!",
  copyError: "Copy failed",
  nativeShare: (title: string) => `Share "${title}"`,
  toggleMediaView: "Toggle cover and turntable view",
  error: {
    title: "The page could not be loaded",
    description: "The server reported a traceable error. These details let us find the cause in the logs.",
    code: "Error code",
    reference: "Error ID",
    copy: "Copy error details",
    copied: "Error details copied",
    back: "Back to musiccloud",
  },
} as const;

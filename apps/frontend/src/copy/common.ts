import { ERROR_CODE_REGISTRY } from "@musiccloud/shared";

export const commonCopy = {
  a11y: {
    skipToContent: "Skip to content",
    search: "Search",
    searchInput: "Search for music by link or name",
    clearSearch: "Clear search",
    close: "Close",
    footerNavigation: "Footer navigation",
  },
  pager: {
    previous: "Previous",
    next: "Next",
  },
  error: {
    dialogTitle: "Search problem",
    dismiss: "OK",
    offline: "Looks like you're offline. Check your connection and try again.",
    // The proxy answers a backend timeout with MC-API-0005, so a browser-side
    // timeout reads the same sentence from the same entry.
    timeout: ERROR_CODE_REGISTRY["MC-API-0005"].userMessage,
    generic: "Something went wrong. Please try again.",
    genericWithCode: (code: string) => `Something went wrong. Please try again. (${code})`,
    withErrorId: (message: string, errorId: string) => `${message} Error ID: ${errorId}`,
    boundaryTitle: "Something went wrong",
    boundaryMessage: "An unexpected error occurred. Please try reloading the page.",
    boundaryReload: "Reload page",
  },
  footer: {
    madeBy: "made by",
  },
  dayNight: {
    label: "Background mode",
    day: "Day",
    night: "Night",
    system: "System",
    automatic: "Automatic",
    dayHelp: "Always show the day sky",
    nightHelp: "Always show the night sky",
    systemHelp: "Follow your system's light or dark mode",
    automaticHelp: "Switch by the local time of day",
  },
  navigation: {
    menu: "Menu",
  },
} as const;

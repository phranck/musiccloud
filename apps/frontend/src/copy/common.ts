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
    timeout: "This is taking longer than usual. Please try again.",
    generic: "Something went wrong. Please try again.",
    genericWithCode: (code: string) => `Something went wrong. Please try again. (${code})`,
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

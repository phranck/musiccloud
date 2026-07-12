/** Joins optional class names for the static React-backed docs components. */
export const joinClassNames = (...classNames: Array<string | undefined>) => classNames.filter(Boolean).join(" ");

export const ContentContext = {
  Frontend: 1 << 0,
  DeveloperPortal: 1 << 1,
} as const;

export type SingleContentContext = (typeof ContentContext)[keyof typeof ContentContext];
export type ContentContextMask = number;

export const NavigationArea = {
  Main: 1 << 0,
  Footer: 1 << 1,
} as const;

export type SingleNavigationArea = (typeof NavigationArea)[keyof typeof NavigationArea];
export type NavigationAreaMask = number;

export const KNOWN_CONTENT_CONTEXT_MASK = ContentContext.Frontend | ContentContext.DeveloperPortal;
export const KNOWN_NAVIGATION_AREA_MASK = NavigationArea.Main | NavigationArea.Footer;

export function isValidContentContextMask(mask: number): mask is ContentContextMask {
  return (
    mask === ContentContext.Frontend || mask === ContentContext.DeveloperPortal || mask === KNOWN_CONTENT_CONTEXT_MASK
  );
}

export function activeContentContexts(mask: ContentContextMask): SingleContentContext[] {
  if (!isValidContentContextMask(mask)) {
    throw new RangeError(`Invalid content context mask: ${mask}`);
  }

  return [ContentContext.Frontend, ContentContext.DeveloperPortal].filter(
    (context): context is SingleContentContext => (mask & context) === context,
  );
}

export function hasAllContextBits(mask: ContentContextMask, requiredMask: ContentContextMask): boolean {
  if (!isValidContentContextMask(mask)) {
    throw new RangeError(`Invalid content context mask: ${mask}`);
  }
  if (!isValidContentContextMask(requiredMask)) {
    throw new RangeError(`Invalid required context mask: ${requiredMask}`);
  }

  return (mask & requiredMask) === requiredMask;
}

export function isValidNavigationAreaMask(mask: number): mask is NavigationAreaMask {
  return mask === NavigationArea.Main || mask === NavigationArea.Footer || mask === KNOWN_NAVIGATION_AREA_MASK;
}

export function activeNavigationAreas(mask: NavigationAreaMask): SingleNavigationArea[] {
  if (!isValidNavigationAreaMask(mask)) {
    throw new RangeError(`Invalid navigation area mask: ${mask}`);
  }

  return [NavigationArea.Main, NavigationArea.Footer].filter(
    (area): area is SingleNavigationArea => (mask & area) === area,
  );
}

export function expectedNavigationPlacements(
  contextMask: ContentContextMask,
  areaMask: NavigationAreaMask,
): Array<{ context: SingleContentContext; area: SingleNavigationArea }> {
  return activeContentContexts(contextMask).flatMap((context) =>
    activeNavigationAreas(areaMask).map((area) => ({ context, area })),
  );
}

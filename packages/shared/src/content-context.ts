export const ContentContext = {
  Frontend: 1 << 0,
  DeveloperPortal: 1 << 1,
} as const;

export type SingleContentContext = (typeof ContentContext)[keyof typeof ContentContext];
export type ContentContextMask = number;

export const KNOWN_CONTENT_CONTEXT_MASK = ContentContext.Frontend | ContentContext.DeveloperPortal;

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

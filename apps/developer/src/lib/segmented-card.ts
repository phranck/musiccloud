const BODY_SELECTOR = "[data-segmented-card-body]";
const bodyAnimations = new WeakMap<HTMLElement, Animation>();

function motionDurationMs(card: HTMLElement): number {
  const value = window.getComputedStyle(card).getPropertyValue("--segmented-card-transition-duration").trim();
  const duration = Number.parseFloat(value);
  if (!Number.isFinite(duration)) return 0;
  return value.endsWith("s") && !value.endsWith("ms") ? duration * 1_000 : duration;
}

function motionEasing(card: HTMLElement): string {
  return window.getComputedStyle(card).getPropertyValue("--segmented-card-transition-easing").trim() || "ease-in-out";
}

/**
 * Applies a panel-state mutation while smoothly moving the shared card body
 * between its measured old and new heights.
 */
export function animateSegmentedCardBody(card: HTMLElement, update: () => void): void {
  const body = card.querySelector<HTMLElement>(BODY_SELECTOR);
  if (!body) {
    update();
    return;
  }

  const previousAnimation = bodyAnimations.get(body);
  if (previousAnimation) {
    previousAnimation.commitStyles();
    previousAnimation.cancel();
  }

  const startHeight = body.getBoundingClientRect().height;
  body.style.removeProperty("height");
  update();
  const targetHeight = body.getBoundingClientRect().height;
  const duration = motionDurationMs(card);

  if (!duration || startHeight === targetHeight || typeof body.animate !== "function") {
    bodyAnimations.delete(body);
    delete card.dataset.segmentedCardAnimating;
    return;
  }

  card.dataset.segmentedCardAnimating = "true";
  const animation = body.animate([{ height: `${startHeight}px` }, { height: `${targetHeight}px` }], {
    duration,
    easing: motionEasing(card),
  });
  bodyAnimations.set(body, animation);

  void animation.finished
    .then(() => {
      if (bodyAnimations.get(body) !== animation) return;
      bodyAnimations.delete(body);
      delete card.dataset.segmentedCardAnimating;
    })
    .catch(() => undefined);
}

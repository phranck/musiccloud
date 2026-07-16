const CONTROL_SELECTOR = ".segmented-control";
const ITEM_SELECTOR = ".segmented-control__item";

function updateSegmentedControlIndicator(control: HTMLElement): void {
  const selectedItem = control.querySelector<HTMLElement>(`${ITEM_SELECTOR}[aria-selected="true"]`);
  if (!selectedItem) {
    delete control.dataset.segmentedControlIndicatorReady;
    return;
  }

  control.style.setProperty("--segmented-control-indicator-x", `${selectedItem.offsetLeft}px`);
  control.style.setProperty("--segmented-control-indicator-y", `${selectedItem.offsetTop}px`);
  control.style.setProperty("--segmented-control-indicator-width", `${selectedItem.offsetWidth}px`);
  control.style.setProperty("--segmented-control-indicator-height", `${selectedItem.offsetHeight}px`);
  control.dataset.segmentedControlIndicatorReady = "true";
}

function bindSegmentedControlIndicator(control: HTMLElement): () => void {
  if (control.dataset.segmentedControlIndicatorBound === "true") return () => undefined;
  control.dataset.segmentedControlIndicatorBound = "true";

  const items = Array.from(control.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
  const mutationObserver = new MutationObserver(() => updateSegmentedControlIndicator(control));
  for (const item of items) mutationObserver.observe(item, { attributeFilter: ["aria-selected"] });

  const update = () => updateSegmentedControlIndicator(control);
  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
  if (resizeObserver) {
    resizeObserver.observe(control);
    for (const item of items) resizeObserver.observe(item);
  } else {
    window.addEventListener("resize", update);
  }

  update();

  return () => {
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener("resize", update);
    delete control.dataset.segmentedControlIndicatorBound;
    delete control.dataset.segmentedControlIndicatorReady;
    control.style.removeProperty("--segmented-control-indicator-x");
    control.style.removeProperty("--segmented-control-indicator-y");
    control.style.removeProperty("--segmented-control-indicator-width");
    control.style.removeProperty("--segmented-control-indicator-height");
  };
}

/** Binds the sliding selection surface for every shared segmented control. */
export function bindSegmentedControlIndicators(root: ParentNode = document): () => void {
  const cleanups = Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).map(bindSegmentedControlIndicator);
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

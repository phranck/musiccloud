import type { VfdCanvasColors } from "@/components/ui/VfdDisplayTypes";

/**
 * Resolves a raw CSS color expression into a concrete RGB(A) value.
 *
 * The VFD reads its phosphor colors from CSS custom properties so the host
 * page can theme the display. Those properties may carry any color syntax
 * (`color(...)`, `hsl(...)`, named colors, custom-property chains), and the
 * canvas only accepts fully resolved colors. To bridge that gap, this
 * helper appends a hidden probe element with the requested color, reads the
 * resolved `getComputedStyle().color`, then removes the probe.
 *
 * Falls back to `fallback` when the value is blank, whitespace-only, or
 * fails to resolve to a non-empty color string.
 *
 * @param element The element to anchor the probe in, so theme variables resolve in scope.
 * @param value The raw CSS color expression to resolve.
 * @param fallback Color string returned when resolution fails.
 */
function resolveCssColor(element: HTMLElement, value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style.color = trimmed;
  element.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

/**
 * Reads the four phosphor-intensity CSS custom properties and returns a
 * fully resolved color bucket the canvas pipeline can hand to `fillStyle`.
 *
 * Each entry falls back to the element's own `color` (or `currentColor`)
 * when the corresponding custom property is unset or unresolvable, so the
 * display always renders something even if the theme is incomplete.
 */
export function resolveCanvasColors(element: HTMLElement): VfdCanvasColors {
  const computed = window.getComputedStyle(element);
  const fallback = computed.color || "currentColor";
  return {
    bright: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-bright-color"), fallback),
    normal: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-normal-color"), fallback),
    dim: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-dim-color"), fallback),
    ghost: resolveCssColor(element, computed.getPropertyValue("--mc-vfd-ghost-color"), fallback),
  };
}

/**
 * z-index scale for layered UI.
 *
 * Keep all stacked UI on this scale. Resist escalating to 9999 --
 * extreme values usually indicate a stacking context problem, not a fix.
 */
export const zIndex = {
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  /** OverlayCard base; actual z = modal + stackIndex * 100 */
  modal: 2000,
  /** Popovers and portal-dropdowns that must float above modals */
  popover: 3000,
  toast: 4000,
} as const;

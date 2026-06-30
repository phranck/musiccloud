import { useEffect, useState } from "react";
import { DisplaySignal, sendMusicSignal } from "@/lib/analytics/umami";
import { createModeStore } from "@/lib/createModeStore";

/**
 * Two display modes for the audio preview's spectrum/level indicator.
 *
 * - `multiBand`: per-channel frequency-band bars (the default). Each channel
 *   shows multiple bars whose vertical extent tracks the per-band level.
 * - `stereoVu`: a single horizontal VU bar per channel, growing outward from
 *   the centre of the display (left channel to the left, right channel to
 *   the right), with a bright peak column at the leading edge and a dim
 *   trail behind it. Pixel-precise, ignoring inter-cell glyph gaps.
 */
export const AnalyzerMode = {
  MultiBand: "multiBand",
  StereoVu: "stereoVu",
} as const;

export type AnalyzerMode = (typeof AnalyzerMode)[keyof typeof AnalyzerMode];

// Core persistence + subscriber fan-out via the shared factory. The
// analyzer-specific layer below (toggle analytics, the "D" keybinding, and the
// SSR-safe hook) is kept local on top of this store.
const store = createModeStore<AnalyzerMode>({
  storageKey: "mc.player.analyzerMode",
  defaultMode: AnalyzerMode.MultiBand,
  isValid: (value): value is AnalyzerMode => value === AnalyzerMode.MultiBand || value === AnalyzerMode.StereoVu,
});

let activePlayerCount = 0;

/**
 * Flip the current analyzer mode and broadcast the change to all subscribed
 * players. The new mode is persisted to localStorage so it survives reloads.
 */
export function toggleAnalyzerMode(): void {
  const next = store.getMode() === AnalyzerMode.MultiBand ? AnalyzerMode.StereoVu : AnalyzerMode.MultiBand;
  store.setMode(next);
  sendMusicSignal(next === AnalyzerMode.StereoVu ? DisplaySignal.VuMeter : DisplaySignal.Analyzer);
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key !== "d" && event.key !== "D") return;
  if (isTextInputTarget(event.target)) return;
  event.preventDefault();
  toggleAnalyzerMode();
}

function activatePlayer(): void {
  if (typeof window === "undefined") return;
  if (activePlayerCount === 0) {
    window.addEventListener("keydown", handleGlobalKeydown);
  }
  activePlayerCount += 1;
}

function deactivatePlayer(): void {
  if (typeof window === "undefined") return;
  activePlayerCount -= 1;
  if (activePlayerCount <= 0) {
    window.removeEventListener("keydown", handleGlobalKeydown);
    activePlayerCount = 0;
  }
}

/**
 * Subscribes the calling component to the global analyzer mode and installs
 * the "D" keybinding for as long as at least one player is mounted.
 *
 * The hook returns the current mode and triggers a re-render whenever the
 * mode changes globally. The initial render returns `multiBand` on every
 * mount (regardless of stored preference) so SSR and the first client
 * render match. A subsequent effect-driven sync then upgrades the value to
 * the stored preference.
 */
export function useAnalyzerMode(): AnalyzerMode {
  const [mode, setMode] = useState<AnalyzerMode>(AnalyzerMode.MultiBand);

  useEffect(() => {
    // Sync to the stored preference (getMode hydrates on first client access),
    // then track changes. The initial render stays MultiBand so SSR and the
    // first client render match before this effect upgrades the value.
    setMode(store.getMode());
    const unsubscribe = store.subscribe(setMode);
    activatePlayer();
    return () => {
      unsubscribe();
      deactivatePlayer();
    };
  }, []);

  return mode;
}

import { useEffect, useState } from "react";
import { DisplaySignal, sendMusicSignal } from "@/lib/analytics/umami";

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

const STORAGE_KEY = "mc.player.analyzerMode";

let currentMode: AnalyzerMode = AnalyzerMode.MultiBand;
let initialized = false;
let activePlayerCount = 0;
const subscribers = new Set<(mode: AnalyzerMode) => void>();

function isAnalyzerMode(value: unknown): value is AnalyzerMode {
  return value === AnalyzerMode.MultiBand || value === AnalyzerMode.StereoVu;
}

function readStoredMode(): AnalyzerMode {
  if (typeof window === "undefined") return AnalyzerMode.MultiBand;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isAnalyzerMode(raw) ? raw : AnalyzerMode.MultiBand;
  } catch {
    return AnalyzerMode.MultiBand;
  }
}

function writeStoredMode(mode: AnalyzerMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage may be disabled (private mode quota, blocked cookies, etc.).
    // The mode then stays in-memory for the current session, which is fine
    // because the persistence is purely a convenience.
  }
}

function ensureClientInit(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  currentMode = readStoredMode();
}

function notifySubscribers(): void {
  for (const subscriber of subscribers) subscriber(currentMode);
}

/**
 * Flip the current analyzer mode and broadcast the change to all subscribed
 * players. The new mode is persisted to localStorage so it survives reloads.
 */
export function toggleAnalyzerMode(): void {
  ensureClientInit();
  currentMode = currentMode === AnalyzerMode.MultiBand ? AnalyzerMode.StereoVu : AnalyzerMode.MultiBand;
  writeStoredMode(currentMode);
  sendMusicSignal(currentMode === AnalyzerMode.StereoVu ? DisplaySignal.VuMeter : DisplaySignal.Analyzer);
  notifySubscribers();
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
    ensureClientInit();
    setMode(currentMode);
    subscribers.add(setMode);
    activatePlayer();
    return () => {
      subscribers.delete(setMode);
      deactivatePlayer();
    };
  }, []);

  return mode;
}

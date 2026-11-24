/**
 * The tab-wide keyboard registry for audio players. Every mounted player
 * registers a handle here, and one shared pair of window `keydown` listeners
 * routes the spacebar and the arrow keys to the right player while no text
 * entry or control holds the key.
 */
import { SEEK_STEP_SECONDS } from "@/components/audio/audioSeek";

/**
 * Tab-wide registry of mounted `AudioPlayer` instances. Used by the
 * single shared window-keydown listener to route the spacebar and arrow keys
 * to a player when no input element holds focus. Set iteration is
 * insertion-order, which on the share page means the hero card first and the
 * top tracks after it. The fallback target is therefore the most prominent
 * preview on the page.
 */
export interface AudioKeyboardHandle {
  /** Forwards to the player's `togglePlay`. Stable across renders. */
  togglePlay: () => void;
  /** True while the player is in `Playing` or `Paused` phase, false otherwise. */
  isActive: () => boolean;
  /** Relative seek by signed seconds (arrow keys). No-op unless active. */
  seekBy: (deltaSeconds: number) => void;
  /** Jump to the track start (cmd+Left). No-op unless active. */
  seekToStart: () => void;
  /** Jump to `SEEK_END_GUARD_SECONDS` before the end (cmd+Right). No-op unless active. */
  seekToNearEnd: () => void;
}

/** The handles of every mounted player, in mount order. */
const audioRegistry = new Set<AudioKeyboardHandle>();
/**
 * Number of registered handles. The shared listeners are attached when it
 * rises from `0` and removed when it falls back to `0`.
 */
let audioListenerRefCount = 0;

/**
 * Returns true if the spacebar should fall through to the default browser
 * behaviour (form input, button activation, link follow, contentEditable
 * typing) rather than triggering preview playback. Keeps the global handler
 * from hijacking focus-driven keyboard a11y.
 *
 * @param event - The keydown event to inspect.
 * @returns True when the event target is a text entry, a button, a link or editable content.
 */
function shouldIgnoreSpacebarTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLButtonElement) return true;
  if (target instanceof HTMLAnchorElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Returns true if arrow-key seeking should fall through to default behaviour.
 *
 * The spacebar activates a focused button or link, so those must be excluded
 * for it. Arrow keys have no native action on buttons or links, so only
 * genuine text-entry targets are spared, where arrows move the caret, slider
 * thumb, or option selection. This is deliberately narrower than
 * {@link shouldIgnoreSpacebarTarget}: a focused play/pause/toggle button (the
 * common state right after a click) must NOT swallow the seek.
 *
 * @param event - The keydown event to inspect.
 * @returns True when the event target is a text entry or editable content.
 */
function shouldIgnoreArrowTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * The player a key press is routed to: the first active player, or else the
 * first registered one.
 *
 * @returns The target handle, or `null` when no player is registered.
 */
function resolveSpacebarTarget(): AudioKeyboardHandle | null {
  for (const player of audioRegistry) {
    if (player.isActive()) return player;
  }
  return audioRegistry.values().next().value ?? null;
}

/**
 * Window `keydown` listener that toggles the target player on a plain,
 * non-repeating spacebar press and prevents the page from scrolling.
 *
 * @param event - The keydown event.
 */
function handleAudioSpacebar(event: KeyboardEvent): void {
  if (event.code !== "Space") return;
  if (event.repeat) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (shouldIgnoreSpacebarTarget(event)) return;
  const target = resolveSpacebarTarget();
  if (!target) return;
  event.preventDefault();
  target.togglePlay();
}

/**
 * Window `keydown` listener for the arrow keys on an active player. A plain
 * arrow seeks by {@link SEEK_STEP_SECONDS}, cmd+Left jumps to the start and
 * cmd+Right jumps near the end.
 *
 * @param event - The keydown event.
 */
function handleAudioArrows(event: KeyboardEvent): void {
  if (event.repeat) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (event.altKey || event.ctrlKey || event.shiftKey) return;
  if (shouldIgnoreArrowTarget(event)) return;
  const target = resolveSpacebarTarget();
  if (!target || !target.isActive()) return;
  event.preventDefault();
  const isLeft = event.key === "ArrowLeft";
  if (event.metaKey) {
    if (isLeft) target.seekToStart();
    else target.seekToNearEnd();
    return;
  }
  target.seekBy(isLeft ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
}

/**
 * Adds a player handle to the tab-wide registry and (de)activates the shared
 * window-keydown listeners (spacebar + arrows) via refcount. Returns the
 * cleanup function to be used directly inside a React effect cleanup.
 *
 * @param handle - The player's keyboard handle.
 * @returns A cleanup that removes the handle and detaches the listeners once none is left.
 */
export function registerAudioForKeyboard(handle: AudioKeyboardHandle): () => void {
  audioRegistry.add(handle);
  if (audioListenerRefCount === 0) {
    window.addEventListener("keydown", handleAudioSpacebar);
    window.addEventListener("keydown", handleAudioArrows);
  }
  audioListenerRefCount += 1;
  return () => {
    audioRegistry.delete(handle);
    audioListenerRefCount -= 1;
    if (audioListenerRefCount === 0) {
      window.removeEventListener("keydown", handleAudioSpacebar);
      window.removeEventListener("keydown", handleAudioArrows);
    }
  };
}

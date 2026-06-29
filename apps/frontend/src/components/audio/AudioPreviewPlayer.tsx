import { ENDPOINTS } from "@musiccloud/shared";
import gsap from "gsap";
import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import {
  AudioPreviewStatus,
  type AudioPreviewStatus as AudioPreviewStatusType,
} from "@/components/audio/AudioPreviewStatus";
import { resolveSeekTarget, SEEK_END_GUARD_SECONDS, SEEK_STEP_SECONDS } from "@/components/audio/audioPreviewSeek";
import {
  clearSpectrumFrame,
  getSpectrumFrame,
  isSpectrumActive,
  publishSpectrumFrame,
  writeSpectrumLevels,
  writeSpectrumPeakHold,
} from "@/components/audio/spectrumStore";
import { Player } from "@/components/playback/Player";
import { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import { useT } from "@/i18n/localeContext";
import { PreviewSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { setupMotion } from "@/lib/motion/setup";
import { type MediaKindType, MediaKindValue } from "@/lib/types/media-card";

interface AudioPreviewPlayerProps {
  /** Immediately-playable preview URL. Optional when `refreshShortId` is set. */
  previewUrl?: string;
  /** Short ID used to refresh an expired/missing Deezer preview URL via the
   *  `/api/share-preview/:shortId` proxy. When set without `previewUrl`, the
   *  player mounts in a loading state and fetches on mount. */
  refreshShortId?: string;
  /** Whether the source is a short preview clip (default) or a full track
   *  (CC / Jamendo). Switches the player's wording from "preview" to "song". */
  mediaKind?: MediaKindType;
  trackTitle: string;
  /** Fires synchronously when the user starts playback via click, media key, or Space. */
  onPlaybackIntent?: () => void;
  onStatusChange?: (status: AudioPreviewStatusType) => void;
  /** Fires after a ±step arrow seek so the host can flash a VFD hint. Not fired for cmd jumps. */
  onSeekHint?: (direction: VfdScrollOutDirection) => void;
}

/**
 * AudioPreviewPlayer - Audio preview playback component
 *
 * Orchestrates the compound Player component for audio preview functionality.
 * Handles audio element lifecycle and state management.
 *
 * State machine phases:
 *   loading  — Waiting for a lazy fetch to deliver a preview URL.
 *   idle     — Ready to play. Duration defaults to 30s, updated once metadata loads.
 *   playing  — Playback active.
 *   paused   — Playback paused.
 *   error    — Audio URL unplayable. Component renders unavailable state.
 *   unavailable — Backend confirmed no preview can be produced for this track.
 */
const PlayerPhase = {
  Loading: "loading",
  Idle: "idle",
  Playing: "playing",
  Paused: "paused",
  Error: "error",
  Unavailable: "unavailable",
} as const;

const PlayerActionType = {
  UrlReady: "URL_READY",
  UrlUnavailable: "URL_UNAVAILABLE",
  MetadataLoaded: "METADATA_LOADED",
  Play: "PLAY",
  Pause: "PAUSE",
  TimeUpdate: "TIME_UPDATE",
  Ended: "ENDED",
  Error: "ERROR",
} as const;

const AudioContextState = {
  Closed: "closed",
  Running: "running",
  Suspended: "suspended",
} as const;

const MediaSessionAction = {
  Play: "play",
  Pause: "pause",
} as const;

const MediaSessionPlaybackState = {
  Playing: "playing",
  Paused: "paused",
  None: "none",
} as const;

type PlayerState =
  | { phase: typeof PlayerPhase.Loading }
  | { phase: typeof PlayerPhase.Idle; duration: number }
  | { phase: typeof PlayerPhase.Playing; currentTime: number; duration: number }
  | { phase: typeof PlayerPhase.Paused; currentTime: number; duration: number }
  | { phase: typeof PlayerPhase.Error }
  | { phase: typeof PlayerPhase.Unavailable };

type PlayerAction =
  | { type: typeof PlayerActionType.UrlReady }
  | { type: typeof PlayerActionType.UrlUnavailable }
  | { type: typeof PlayerActionType.MetadataLoaded; duration: number }
  | { type: typeof PlayerActionType.Play }
  | { type: typeof PlayerActionType.Pause }
  | { type: typeof PlayerActionType.TimeUpdate; currentTime: number; duration: number }
  | { type: typeof PlayerActionType.Ended }
  | { type: typeof PlayerActionType.Error };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case PlayerActionType.UrlReady:
      if (state.phase === PlayerPhase.Loading) return { phase: PlayerPhase.Idle, duration: 30 };
      return state;
    case PlayerActionType.UrlUnavailable:
      if (state.phase === PlayerPhase.Loading) return { phase: PlayerPhase.Unavailable };
      return state;
    case PlayerActionType.MetadataLoaded:
      if (state.phase === PlayerPhase.Idle) return { ...state, duration: action.duration };
      if (state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused)
        return { ...state, duration: action.duration };
      return state;
    case PlayerActionType.Play:
      if (state.phase === PlayerPhase.Idle)
        return { phase: PlayerPhase.Playing, currentTime: 0, duration: state.duration };
      if (state.phase === PlayerPhase.Paused) return { ...state, phase: PlayerPhase.Playing };
      return state;
    case PlayerActionType.Pause:
      if (state.phase === PlayerPhase.Playing) return { ...state, phase: PlayerPhase.Paused };
      return state;
    case PlayerActionType.TimeUpdate:
      if (state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused)
        return { ...state, currentTime: action.currentTime, duration: action.duration };
      return state;
    case PlayerActionType.Ended:
      if (state.phase === PlayerPhase.Playing) return { phase: PlayerPhase.Idle, duration: state.duration };
      return state;
    case PlayerActionType.Error:
      return { phase: PlayerPhase.Error };
    default:
      return state;
  }
}

/** Fallback track length when the element reports no usable duration (preview clips are ~30s). */
const DEFAULT_DURATION_SECONDS = 30;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resolveAudioProgressRatio(audio: HTMLAudioElement): number {
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : DEFAULT_DURATION_SECONDS;
  const ratio = audio.currentTime / duration;
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

const SPECTRUM_CHANNEL_BAND_COUNT = 13;
const SPECTRUM_UPDATE_MS = 50;
const SPECTRUM_FADE_FACTOR = 0.68;
const SPECTRUM_FADE_MIN_LEVEL = 0.03;
const SPECTRUM_LOW_BAND_COUNT = 4;
const SPECTRUM_RECOVERY_CHECK_MS = 700;
const PLAYER_PROGRESS_REWIND_MS = 420;
// Per-channel stereo VU normalisation. RMS values for typical music sit in
// the 0.15..0.45 range; multiplying by 2.4 maps an "average" passage to
// roughly 0.6..1.0 deflection. Clamped to 1 so brief peaks don't blow out.
const STEREO_LEVEL_INPUT_GAIN = 2.4;
// Low-pass smoothing for the stereo VU level. Higher = more responsive to
// peaks, lower = calmer needle. 0.4 hits the classic VU-meter feel: visible
// transient response without the rapid flicker of raw frame-by-frame RMS.
const STEREO_LEVEL_SMOOTHING = 0.4;
// Decay factor applied to the stored level when playback pauses or the
// analyser cannot deliver samples, so the bars ease back to zero instead
// of snapping off.
const STEREO_LEVEL_DECAY = 0.5;
// Time the per-channel peak indicator stays pinned at its last maximum
// before it starts decaying back toward zero. Classic VU/peak-meter feel:
// about a second of stand-still so the eye can latch onto transients.
const STEREO_PEAK_HOLD_MS = 900;
// Linear decay applied to the held peak (0..1 scale) per spectrum tick
// once the hold window has elapsed. At a 50ms tick that yields ~0.5/sec,
// so a full-scale hold falls back to zero in roughly two seconds.
const STEREO_PEAK_HOLD_DECAY_PER_TICK = 0.025;
// Sample-accurate gain ramp applied on the very first play of a fresh
// audio source so the audio fades in from silence to unity. The ramp
// hides the startup transient that MP3 decoders and freshly engaged
// MediaElementSource → destination routing produce together: even a
// brief, low-amplitude burst at the moment the audio output device
// re-engages is audible as a click against the prior silence. The ramp
// is only scheduled on the first play of each fresh audio element
// (tracked via hasStartedRef) — resuming a previously-played, paused
// track does not need it because the audio path is already warm.
const STARTUP_FADE_MS = 30;
// Sample-accurate gain ramp applied on teardown when the audio is still
// playing at unmount. Required because the share-page Top-Tracks button
// triggers an SPA navigation while the current preview is mid-playback:
// the old MediaCard unmounts, audio.pause() + AudioContext.close() fire
// in immediate succession, and the OS audio session disengages
// mid-stream. The DAC silencing at a non-zero waveform sample produces
// an audible speaker click. User-initiated pauses do NOT exhibit this
// because the context stays alive after audio.pause() — the click is
// specifically about close() racing the audio path. The ramp drives the
// gain to zero before the deferred pause + teardown run, so the close
// sees silence at the destination.
const TEARDOWN_FADE_MS = 30;
// Safety margin added on top of TEARDOWN_FADE_MS before the deferred
// pause + context close fires, so the scheduled gain ramp has fully
// settled at the audio graph before the destination is destroyed.
const TEARDOWN_FADE_GUARD_MS = 10;

type BrowserAudioContextConstructor = typeof AudioContext;

interface StereoSpectrumData {
  left: Uint8Array<ArrayBuffer>;
  right: Uint8Array<ArrayBuffer>;
  /** Time-domain sample buffers, used to derive the per-channel RMS level. */
  leftTime: Uint8Array<ArrayBuffer>;
  rightTime: Uint8Array<ArrayBuffer>;
}

interface StereoSpectrumAnalysers {
  left: AnalyserNode;
  right: AnalyserNode;
}

/**
 * Per-channel peak hold level (0..1) and the timestamp at which it was last
 * refreshed. The hold value latches at the most recent maximum of the
 * smoothed VU level, stays put for `STEREO_PEAK_HOLD_MS`, then decays back to
 * zero. Drives the standalone "stuck" peak pixel column in the stereo-VU
 * display mode.
 */
interface StereoPeakHoldState {
  level: number;
  setAt: number;
}

/**
 * Tab-wide registry of mounted `AudioPreviewPlayer` instances. Used by the
 * single shared window-keydown listener to route the spacebar and arrow keys
 * to a player when no input element holds focus. Set iteration is
 * insertion-order, which on the share page corresponds to "hero card first,
 * then top tracks" — so the fallback target is the most prominent preview on
 * the page.
 */
interface AudioPreviewKeyboardHandle {
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

const audioPreviewRegistry = new Set<AudioPreviewKeyboardHandle>();
let audioPreviewListenerRefCount = 0;

/**
 * Returns true if the spacebar should fall through to the default browser
 * behaviour (form input, button activation, link follow, contentEditable
 * typing) rather than triggering preview playback. Keeps the global handler
 * from hijacking focus-driven keyboard a11y.
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
 * Unlike the spacebar — which activates a focused button or link, so those must
 * be excluded — arrow keys have no native action on buttons or links. Only
 * genuine text-entry targets are spared, where arrows move the caret, slider
 * thumb, or option selection. This is deliberately narrower than
 * {@link shouldIgnoreSpacebarTarget}: a focused play/pause/toggle button (the
 * common state right after a click) must NOT swallow the seek.
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

function resolveSpacebarTarget(): AudioPreviewKeyboardHandle | null {
  for (const player of audioPreviewRegistry) {
    if (player.isActive()) return player;
  }
  return audioPreviewRegistry.values().next().value ?? null;
}

function handleAudioPreviewSpacebar(event: KeyboardEvent): void {
  if (event.code !== "Space") return;
  if (event.repeat) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (shouldIgnoreSpacebarTarget(event)) return;
  const target = resolveSpacebarTarget();
  if (!target) return;
  event.preventDefault();
  target.togglePlay();
}

function handleAudioPreviewArrows(event: KeyboardEvent): void {
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
 */
function registerAudioPreviewForKeyboard(handle: AudioPreviewKeyboardHandle): () => void {
  audioPreviewRegistry.add(handle);
  if (audioPreviewListenerRefCount === 0) {
    window.addEventListener("keydown", handleAudioPreviewSpacebar);
    window.addEventListener("keydown", handleAudioPreviewArrows);
  }
  audioPreviewListenerRefCount += 1;
  return () => {
    audioPreviewRegistry.delete(handle);
    audioPreviewListenerRefCount -= 1;
    if (audioPreviewListenerRefCount === 0) {
      window.removeEventListener("keydown", handleAudioPreviewSpacebar);
      window.removeEventListener("keydown", handleAudioPreviewArrows);
    }
  };
}

async function fetchPreviewUrl(refreshShortId: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(ENDPOINTS.frontend.sharePreview(refreshShortId), { signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { previewUrl: string | null };
  return body.previewUrl;
}

function getAudioContextConstructor(): BrowserAudioContextConstructor | undefined {
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: BrowserAudioContextConstructor }).webkitAudioContext
  );
}

function resolveSpectrumBandRange(band: number, bandCount: number, usableBins: number): [number, number] {
  const logMax = Math.log(usableBins + 1);
  const start = 2 + Math.floor(Math.exp((band / bandCount) * logMax) - 1);
  const end = 2 + Math.floor(Math.exp(((band + 1) / bandCount) * logMax) - 1);
  return [start, Math.max(start + 1, end)];
}

/**
 * RMS over a time-domain byte buffer (each byte centred at 128 for silence).
 * The result is normalised so a fully silent buffer returns 0 and a
 * full-scale sine wave returns ~0.707.
 */
function resolveTimeDomainRms(timeDomainData: Uint8Array<ArrayBuffer>): number {
  const sampleCount = timeDomainData.length;
  if (sampleCount === 0) return 0;
  let sumSquares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = (timeDomainData[index] ?? 128) - 128;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount) / 128;
}

function resolveStereoLevel(rms: number, previousLevel: number): number {
  const normalized = Math.max(0, Math.min(1, rms * STEREO_LEVEL_INPUT_GAIN));
  return previousLevel * (1 - STEREO_LEVEL_SMOOTHING) + normalized * STEREO_LEVEL_SMOOTHING;
}

function decayStereoLevel(previousLevel: number): number {
  const next = previousLevel * STEREO_LEVEL_DECAY;
  return next < 0.005 ? 0 : next;
}

/**
 * Advances one channel's peak hold state for the current spectrum tick.
 * The latch snaps to the new level whenever the live signal pushes higher
 * than the held value; otherwise the level stays put until the hold window
 * has elapsed, then decays linearly toward zero.
 */
function advancePeakHold(state: StereoPeakHoldState, currentLevel: number, now: number): StereoPeakHoldState {
  if (currentLevel >= state.level) {
    return { level: currentLevel, setAt: now };
  }
  if (now - state.setAt < STEREO_PEAK_HOLD_MS) {
    return state;
  }
  const decayed = Math.max(currentLevel, state.level - STEREO_PEAK_HOLD_DECAY_PER_TICK);
  return { level: decayed, setAt: state.setAt };
}

function decayPeakHoldChannel(state: StereoPeakHoldState): StereoPeakHoldState {
  const next = state.level * STEREO_LEVEL_DECAY;
  return { level: next < 0.005 ? 0 : next, setAt: state.setAt };
}

/**
 * Resolves the per-band levels from raw FFT bytes and writes them in place
 * into `dest` — zero allocation per tick (policy 7; the former
 * `resolveSpectrumBands` allocated two fresh arrays every 50 ms). Two passes:
 * fill the raw band levels, then normalise by the frame peak so quiet
 * passages still deflect. The math is identical to the previous version.
 *
 * @param frequencyData - Raw byte FFT magnitudes for one channel.
 * @param bandCount - Number of bands to fill (must not exceed `dest.length`).
 * @param dest - Pre-allocated band buffer, written in place.
 */
function resolveSpectrumBandsInto(frequencyData: Uint8Array<ArrayBuffer>, bandCount: number, dest: Float32Array): void {
  const usableBins = Math.max(1, frequencyData.length - 2);
  let framePeak = 0;
  for (let band = 0; band < bandCount; band += 1) {
    const [start, end] = resolveSpectrumBandRange(band, bandCount, usableBins);
    let total = 0;
    let count = 0;
    for (let index = start; index < end; index += 1) {
      total += frequencyData[Math.min(frequencyData.length - 1, index)] ?? 0;
      count += 1;
    }

    const position = bandCount <= 1 ? 1 : band / (bandCount - 1);
    const lowBandRatio = Math.max(0, 1 - band / Math.max(1, SPECTRUM_LOW_BAND_COUNT));
    const lowFrequencyDamping = 0.4 + position * 0.82;
    const dynamicCurve = 1.12 + lowBandRatio * 0.38;
    const normalized = Math.max(0, total / Math.max(1, count) / 255 - 0.04) / 0.96;
    const value = normalized ** dynamicCurve * lowFrequencyDamping;
    dest[band] = value;
    if (value > framePeak) framePeak = value;
  }

  const frameGain = framePeak > 0 ? Math.min(1.45, 0.82 / Math.max(framePeak, 0.42)) : 1;
  for (let band = 0; band < bandCount; band += 1) {
    dest[band] = Math.min(1, (dest[band] ?? 0) * frameGain);
  }
}

/** One band's fade-out step (mirrors the former `fadeSpectrumBands` map). */
function fadeBandValue(band: number): number {
  return band <= SPECTRUM_FADE_MIN_LEVEL ? 0 : band * SPECTRUM_FADE_FACTOR;
}

function useAudioPreviewController({
  previewUrl,
  refreshShortId,
  mediaKind,
  trackTitle,
  onPlaybackIntent,
  onStatusChange,
  onSeekHint,
}: AudioPreviewPlayerProps) {
  const t = useT();
  const initialPhase: PlayerState = previewUrl
    ? { phase: PlayerPhase.Idle, duration: 30 }
    : { phase: PlayerPhase.Loading };
  const [state, dispatch] = useReducer(playerReducer, initialPhase);
  const [effectiveUrl, setEffectiveUrl] = useReducer(
    (_: string | null, next: string | null) => next,
    previewUrl ?? null,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<StereoSpectrumAnalysers | null>(null);
  const channelSplitterRef = useRef<ChannelSplitterNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  // Frame loops run on the shared gsap.ticker (plan MC-029 Task 5.3, policy 3 —
  // no private requestAnimationFrame source). Each ref holds the registered
  // ticker callback so the matching stop can remove it; null means "not running".
  const spectrumTickRef = useRef<(() => void) | null>(null);
  const spectrumDataRef = useRef<StereoSpectrumData | null>(null);
  const spectrumLastUpdateRef = useRef(0);
  // Peak-hold timing state stays local (the store only carries the resulting
  // level, not the per-channel hold timestamp). Bands/levels/peak-hold levels
  // live in the spectrum store and are written in place each tick (Task 5.1).
  const peakHoldLeftRef = useRef<StereoPeakHoldState>({ level: 0, setAt: 0 });
  const peakHoldRightRef = useRef<StereoPeakHoldState>({ level: 0, setAt: 0 });
  const progressTickRef = useRef<(() => void) | null>(null);
  const progressRewindTickRef = useRef<(() => void) | null>(null);
  const progressRatioRef = useRef(0);
  const hasStartedRef = useRef(false);
  const [progressRatio, setProgressRatio] = useState(0);

  // Tune the shared ticker once on mount (lagSmoothing); idempotent.
  useEffect(() => {
    setupMotion();
  }, []);

  // Lazy fetch the preview URL when the component mounted without one.
  // Aborts on unmount so a slow Deezer call doesn't update a stale tree.
  useEffect(() => {
    if (previewUrl || !refreshShortId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const nextPreviewUrl = await fetchPreviewUrl(refreshShortId, controller.signal);
        if (nextPreviewUrl) {
          setEffectiveUrl(nextPreviewUrl);
          dispatch({ type: PlayerActionType.UrlReady });
        } else {
          sendMusicSignal(PreviewSignal.Unavailable);
          notifyStatusChangeFromEvent(AudioPreviewStatus.Unavailable);
          dispatch({ type: PlayerActionType.UrlUnavailable });
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        sendMusicSignal(PreviewSignal.Unavailable);
        notifyStatusChangeFromEvent(AudioPreviewStatus.Unavailable);
        dispatch({ type: PlayerActionType.UrlUnavailable });
      }
    })();
    return () => controller.abort();
  }, [previewUrl, refreshShortId]);

  const resetPeakHold = useCallback(() => {
    peakHoldLeftRef.current = { level: 0, setAt: 0 };
    peakHoldRightRef.current = { level: 0, setAt: 0 };
  }, []);

  const stopSpectrumLoop = useCallback(
    ({ clearBands = true }: { clearBands?: boolean } = {}) => {
      if (spectrumTickRef.current) gsap.ticker.remove(spectrumTickRef.current);
      spectrumTickRef.current = null;
      spectrumLastUpdateRef.current = 0;
      if (!clearBands) return;
      clearSpectrumFrame();
      resetPeakHold();
    },
    [resetPeakHold],
  );

  const setProgressRatioValue = useCallback((ratio: number) => {
    const nextRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
    if (progressRatioRef.current === nextRatio) return;
    progressRatioRef.current = nextRatio;
    setProgressRatio(nextRatio);
  }, []);
  const setProgressRatioFromEvent = useEffectEvent(setProgressRatioValue);

  const stopProgressRewind = useCallback(() => {
    if (progressRewindTickRef.current) gsap.ticker.remove(progressRewindTickRef.current);
    progressRewindTickRef.current = null;
  }, []);

  const stopProgressLoop = useCallback(
    (audio?: HTMLAudioElement | null) => {
      if (progressTickRef.current) gsap.ticker.remove(progressTickRef.current);
      progressTickRef.current = null;
      if (audio) setProgressRatioValue(resolveAudioProgressRatio(audio));
    },
    [setProgressRatioValue],
  );

  const startProgressRewind = useCallback(() => {
    stopProgressRewind();
    const startRatio = progressRatioRef.current;
    if (startRatio <= 0) {
      setProgressRatioValue(0);
      return;
    }

    let startedAt: number | null = null;
    const tick = () => {
      const now = performance.now();
      if (startedAt === null) startedAt = now;
      const elapsedRatio = Math.min(1, (now - startedAt) / PLAYER_PROGRESS_REWIND_MS);
      setProgressRatioValue(startRatio * (1 - elapsedRatio));
      if (elapsedRatio < 1) return;
      gsap.ticker.remove(tick);
      progressRewindTickRef.current = null;
      setProgressRatioValue(0);
    };

    progressRewindTickRef.current = tick;
    gsap.ticker.add(tick);
  }, [setProgressRatioValue, stopProgressRewind]);
  const startProgressRewindFromEvent = useEffectEvent(startProgressRewind);

  const startProgressLoop = useCallback(
    (audio: HTMLAudioElement) => {
      stopProgressLoop();
      const tick = () => {
        setProgressRatioValue(resolveAudioProgressRatio(audio));
        if (audio.paused || audio.ended) {
          gsap.ticker.remove(tick);
          progressTickRef.current = null;
        }
      };
      progressTickRef.current = tick;
      gsap.ticker.add(tick);
    },
    [setProgressRatioValue, stopProgressLoop],
  );

  const startSpectrumFadeOut = useCallback(() => {
    stopSpectrumLoop({ clearBands: false });
    if (!isSpectrumActive()) return;
    const frame = getSpectrumFrame();

    const tick = () => {
      const now = performance.now();
      if (now - spectrumLastUpdateRef.current < SPECTRUM_UPDATE_MS) return;
      spectrumLastUpdateRef.current = now;

      // Decay every band toward zero in place (no allocation per fade tick).
      let bandsStillVisible = false;
      for (let band = 0; band < frame.leftBands.length; band += 1) {
        const left = fadeBandValue(frame.leftBands[band] ?? 0);
        const right = fadeBandValue(frame.rightBands[band] ?? 0);
        frame.leftBands[band] = left;
        frame.rightBands[band] = right;
        if (left > 0 || right > 0) bandsStillVisible = true;
      }
      const nextLeftLevel = decayStereoLevel(frame.levels[0] ?? 0);
      const nextRightLevel = decayStereoLevel(frame.levels[1] ?? 0);
      writeSpectrumLevels(nextLeftLevel, nextRightLevel);
      const nextLeftHold = decayPeakHoldChannel(peakHoldLeftRef.current);
      const nextRightHold = decayPeakHoldChannel(peakHoldRightRef.current);
      peakHoldLeftRef.current = nextLeftHold;
      peakHoldRightRef.current = nextRightHold;
      writeSpectrumPeakHold(nextLeftHold.level, nextRightHold.level);
      publishSpectrumFrame();

      const levelsStillVisible = nextLeftLevel > 0 || nextRightLevel > 0;
      const peakHoldStillVisible = nextLeftHold.level > 0 || nextRightHold.level > 0;
      if (bandsStillVisible || levelsStillVisible || peakHoldStillVisible) return;
      gsap.ticker.remove(tick);
      spectrumTickRef.current = null;
      clearSpectrumFrame();
      resetPeakHold();
    };

    spectrumTickRef.current = tick;
    gsap.ticker.add(tick);
  }, [resetPeakHold, stopSpectrumLoop]);
  const startSpectrumFadeOutFromEvent = useEffectEvent(startSpectrumFadeOut);
  const notifyStatusChange = useCallback(
    (status: AudioPreviewStatusType) => {
      onStatusChange?.(status);
    },
    [onStatusChange],
  );
  const notifyStatusChangeFromEvent = useEffectEvent(notifyStatusChange);
  const notifyPlaybackIntent = useCallback(() => {
    onPlaybackIntent?.();
  }, [onPlaybackIntent]);

  const teardownSpectrum = useCallback(() => {
    stopSpectrumLoop();
    mediaSourceRef.current?.disconnect();
    channelSplitterRef.current?.disconnect();
    analysersRef.current?.left.disconnect();
    analysersRef.current?.right.disconnect();
    gainNodeRef.current?.disconnect();
    mediaSourceRef.current = null;
    channelSplitterRef.current = null;
    analysersRef.current = null;
    gainNodeRef.current = null;
    spectrumDataRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== AudioContextState.Closed) {
      audioContext.onstatechange = null;
      void audioContext.close().catch(() => {
        // Closing can fail in interrupted browser audio sessions. The audio
        // element is disposed independently, so there is nothing else to do.
      });
    }
  }, [stopSpectrumLoop]);

  const startSpectrumLoop = useCallback(() => {
    const analysers = analysersRef.current;
    if (!analysers || spectrumTickRef.current !== null) return;

    const data: StereoSpectrumData = spectrumDataRef.current ?? {
      left: new Uint8Array(analysers.left.frequencyBinCount),
      right: new Uint8Array(analysers.right.frequencyBinCount),
      leftTime: new Uint8Array(analysers.left.fftSize),
      rightTime: new Uint8Array(analysers.right.fftSize),
    };
    spectrumDataRef.current = data;
    const frame = getSpectrumFrame();

    const tick = () => {
      const now = performance.now();
      if (now - spectrumLastUpdateRef.current < SPECTRUM_UPDATE_MS) return;
      spectrumLastUpdateRef.current = now;
      analysers.left.getByteFrequencyData(data.left);
      analysers.right.getByteFrequencyData(data.right);
      analysers.left.getByteTimeDomainData(data.leftTime);
      analysers.right.getByteTimeDomainData(data.rightTime);
      // Bands straight into the store buffers (zero allocation per tick).
      resolveSpectrumBandsInto(data.left, SPECTRUM_CHANNEL_BAND_COUNT, frame.leftBands);
      resolveSpectrumBandsInto(data.right, SPECTRUM_CHANNEL_BAND_COUNT, frame.rightBands);
      // Smoothed levels — the previous value is the store's last write.
      const nextLeftLevel = resolveStereoLevel(resolveTimeDomainRms(data.leftTime), frame.levels[0] ?? 0);
      const nextRightLevel = resolveStereoLevel(resolveTimeDomainRms(data.rightTime), frame.levels[1] ?? 0);
      writeSpectrumLevels(nextLeftLevel, nextRightLevel);

      const nextLeftHold = advancePeakHold(peakHoldLeftRef.current, nextLeftLevel, now);
      const nextRightHold = advancePeakHold(peakHoldRightRef.current, nextRightLevel, now);
      peakHoldLeftRef.current = nextLeftHold;
      peakHoldRightRef.current = nextRightHold;
      writeSpectrumPeakHold(nextLeftHold.level, nextRightHold.level);
      publishSpectrumFrame();
    };

    spectrumTickRef.current = tick;
    gsap.ticker.add(tick);
  }, []);

  /**
   * Wires up (or reuses) the Web Audio spectrum pipeline for the given audio
   * element and returns a promise that resolves to `true` once the
   * AudioContext is in the `running` state.
   *
   * **Critical timing contract:** callers MUST invoke this from inside a
   * user-gesture synchronous stack (e.g. a click handler), and BEFORE
   * `audio.play()`. Two browser policies enforce this:
   *
   *   1. `new AudioContext()` and `audioContext.resume()` both consume
   *      transient user activation. If `resume()` first runs in a microtask
   *      scheduled after `audio.play()` has resolved, the activation may
   *      already be consumed or expired — particularly on Safari, and on
   *      Chrome with a cold HTTP cache or a slow CDN. The browser then
   *      silently leaves the context `suspended`. Audio still plays because
   *      `play()` captured its own activation earlier, but the analyser
   *      receives no samples and the watchdog interval cannot lift the
   *      suspension without a fresh gesture. This is the exact failure mode
   *      where preview playback works but the VFD spectrum stays dark and
   *      a page reload "fixes" it (warm cache → fast play() → activation
   *      still alive when resume() runs).
   *
   *   2. `createMediaElementSource(audio)` should run before `audio.play()`
   *      so the element streams through the AudioContext from the first
   *      sample. Wiring up an already-playing element is supported but
   *      prone to brief routing glitches.
   *
   * To honour both, this function performs ALL synchronous work — context
   * construction, source/splitter/analyser creation, connections — before
   * yielding, and only returns a promise for the `resume()` round trip.
   * Callers that await the returned promise from a `.then()` chain after
   * `audio.play()` are fine because the `resume()` call itself was issued
   * synchronously while the gesture was still alive.
   */
  const ensureSpectrumAnalyzer = useCallback(
    (audio: HTMLAudioElement): Promise<boolean> => {
      // Fast path: pipeline already wired. Reuse and only nudge the context
      // if it has slipped back to `suspended`. resume() is fired synchronously
      // (not awaited) so the caller's gesture window is preserved.
      if (analysersRef.current) {
        const existingContext = audioContextRef.current;
        if (!existingContext) return Promise.resolve(false);
        if (existingContext.state === AudioContextState.Running) return Promise.resolve(true);
        if (existingContext.state === AudioContextState.Suspended) {
          return existingContext
            .resume()
            .then(() => existingContext.state === AudioContextState.Running)
            .catch(() => false);
        }
        return Promise.resolve(false);
      }

      const AudioContextConstructor = getAudioContextConstructor();
      if (!AudioContextConstructor) return Promise.resolve(false);

      const audioContext = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;

      // Install the state-change handler before connections so a context
      // that flips back to `running` after an interruption (route change,
      // audio focus loss, system audio session pause) re-kicks the spectrum
      // loop without waiting for the watchdog interval.
      audioContext.onstatechange = () => {
        if (audioContext.state === AudioContextState.Running) {
          if (!audio.paused && !audio.ended) startSpectrumLoop();
          return;
        }
        stopSpectrumLoop({ clearBands: false });
        if (!audio.paused && !audio.ended && audioContext.state === AudioContextState.Suspended) {
          // resume() in a state-change callback has no fresh user gesture.
          // It succeeds when the browser itself interrupted the session
          // (e.g. after a tab refocus), and fails silently when the autoplay
          // policy demands a new gesture. In the latter case the analyser
          // stays dark until the user clicks play/pause again.
          void audioContext
            .resume()
            .then(() => {
              if (audioContext.state === AudioContextState.Running && !audio.paused && !audio.ended)
                startSpectrumLoop();
            })
            .catch(() => {
              clearSpectrumFrame();
              resetPeakHold();
            });
        }
      };

      // Wire splitter + analysers + media source SYNCHRONOUSLY. The fragile
      // call is `createMediaElementSource(audio)`: it can only be invoked
      // once per HTMLAudioElement (subsequent calls throw InvalidStateError)
      // and it taints the analyser to zeros if the audio source is not
      // CORS-clean. The catch tears the partial pipeline down so playback
      // still proceeds when the analyser branch is unavailable.
      try {
        const splitter = audioContext.createChannelSplitter(2);
        const leftAnalyser = audioContext.createAnalyser();
        const rightAnalyser = audioContext.createAnalyser();
        for (const analyser of [leftAnalyser, rightAnalyser]) {
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.66;
        }

        // The GainNode sits between the media source and the destination
        // so the teardown path can ramp the signal down before the audio
        // element is paused and the context is closed. The splitter that
        // feeds the analysers is connected AFTER the gain node, so the
        // VFD visualisation matches what is heard at all times — during
        // the teardown fade the spectrum dims along with the audio.
        const gain = audioContext.createGain();
        gain.gain.value = 1;

        const source = audioContext.createMediaElementSource(audio);
        source.connect(gain);
        gain.connect(audioContext.destination);
        gain.connect(splitter);
        splitter.connect(leftAnalyser, 0);
        splitter.connect(rightAnalyser, 1);

        gainNodeRef.current = gain;
        mediaSourceRef.current = source;
        channelSplitterRef.current = splitter;
        analysersRef.current = { left: leftAnalyser, right: rightAnalyser };
        spectrumDataRef.current = {
          left: new Uint8Array(leftAnalyser.frequencyBinCount),
          right: new Uint8Array(rightAnalyser.frequencyBinCount),
          leftTime: new Uint8Array(leftAnalyser.fftSize),
          rightTime: new Uint8Array(rightAnalyser.fftSize),
        };
      } catch {
        mediaSourceRef.current?.disconnect();
        channelSplitterRef.current?.disconnect();
        analysersRef.current?.left.disconnect();
        analysersRef.current?.right.disconnect();
        gainNodeRef.current?.disconnect();
        mediaSourceRef.current = null;
        channelSplitterRef.current = null;
        analysersRef.current = null;
        gainNodeRef.current = null;
        spectrumDataRef.current = null;
        clearSpectrumFrame();
        resetPeakHold();
        return Promise.resolve(false);
      }

      // Kick resume() while the gesture is still alive on this synchronous
      // tick. Returning the promise (instead of awaiting) keeps the caller's
      // surrounding control flow synchronous up to the .then() chain — and
      // that is exactly how the surrounding gesture activation survives.
      if (audioContext.state === AudioContextState.Running) return Promise.resolve(true);
      return audioContext
        .resume()
        .then(() => audioContext.state === AudioContextState.Running)
        .catch(() => false);
    },
    [resetPeakHold, startSpectrumLoop, stopSpectrumLoop],
  );

  // Watchdog for the spectrum render loop while playback is active. The
  // initial wire-up happens synchronously inside togglePlay (so the user
  // gesture window is honoured), and the AudioContext's `onstatechange`
  // handler restarts the loop whenever the context flips back to `running`.
  // This watchdog only covers the narrower case where the rAF loop stopped
  // without a matching state-change event — e.g. after `stopSpectrumLoop`
  // was invoked while the player is still in the `playing` phase. Calling
  // `ensureSpectrumAnalyzer` from here would not help: at this point we are
  // far outside the original user gesture, so `audioContext.resume()` would
  // silently leave a suspended context untouched.
  useEffect(() => {
    if (state.phase !== PlayerPhase.Playing) return;
    const audio = audioRef.current;
    if (!audio) return;

    const recoverSpectrum = () => {
      if (audio.paused || audio.ended) return;
      if (!analysersRef.current) return;
      if (audioContextRef.current?.state !== AudioContextState.Running) return;
      if (spectrumTickRef.current !== null) return;
      startSpectrumLoop();
    };

    // No immediate call: the spectrum loop is started directly from
    // togglePlay after the user click, before this effect runs. The
    // watchdog only needs to cover after-the-fact rAF stalls, which is
    // exactly what the periodic interval handles. (Triggering a state-
    // mutating helper here at mount also trips React Doctor's
    // no-adjust-state-on-prop-change rule.)
    const recoveryTimer = window.setInterval(recoverSpectrum, SPECTRUM_RECOVERY_CHECK_MS);
    return () => window.clearInterval(recoveryTimer);
  }, [startSpectrumLoop, state.phase]);

  // Bind the <audio> element when a URL becomes available. The only
  // dependency is the URL itself — playback state transitions (play/pause)
  // must NOT retear the audio element down, or the play() promise starting
  // the transition gets aborted and surfaces as a spurious "unavailable".
  useEffect(() => {
    if (!effectiveUrl) return;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.muted = false;
    audio.volume = 1;
    audio.src = effectiveUrl;

    const handleLoadedMetadata = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : DEFAULT_DURATION_SECONDS;
      dispatch({ type: PlayerActionType.MetadataLoaded, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleTimeUpdate = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : DEFAULT_DURATION_SECONDS;
      dispatch({ type: PlayerActionType.TimeUpdate, currentTime: audio.currentTime, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleEnded = () => {
      stopProgressLoop();
      setProgressRatioFromEvent(1);
      startProgressRewindFromEvent();
      startSpectrumFadeOutFromEvent();
      sendMusicSignal(PreviewSignal.Finished);
      notifyStatusChangeFromEvent(AudioPreviewStatus.Ready);
      dispatch({ type: PlayerActionType.Ended });
    };
    const handleError = () => {
      stopProgressLoop();
      sendMusicSignal(PreviewSignal.Error);
      notifyStatusChangeFromEvent(AudioPreviewStatus.Unavailable);
      dispatch({ type: PlayerActionType.Error });
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audioRef.current = audio;

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      stopProgressLoop();
      stopProgressRewind();
      audioRef.current = null;

      // Teardown fade-OUT path. When the user switches tracks via the
      // share-page Top-Tracks selector WHILE the current preview is
      // still playing, this unmount happens in mid-playback. Without a
      // fade, the immediate audio.pause() + AudioContext.close() cuts
      // the OS audio session at a non-zero waveform sample, producing
      // an audible speaker click. User-initiated pauses don't show
      // this symptom because the context stays alive after pause.
      //
      // The audio element is intentionally left running for the fade
      // window so the WebAudio graph has real samples to ramp. The
      // actual audio.pause() + audio.src clear + teardownSpectrum() are
      // deferred via setTimeout so they execute AFTER the sample-
      // accurate gain ramp has settled at zero. Because Astro View
      // Transitions keep the window/JS heap across share-page
      // navigations, the deferred timer survives the SPA swap.
      const audioContext = audioContextRef.current;
      const gainNode = gainNodeRef.current;
      const canFade =
        audioContext !== null &&
        audioContext.state === AudioContextState.Running &&
        gainNode !== null &&
        !audio.paused &&
        !audio.ended;

      if (canFade) {
        const fadeStartTime = audioContext.currentTime;
        try {
          gainNode.gain.cancelScheduledValues(fadeStartTime);
          gainNode.gain.setValueAtTime(gainNode.gain.value, fadeStartTime);
          gainNode.gain.linearRampToValueAtTime(0, fadeStartTime + TEARDOWN_FADE_MS / 1000);
        } catch {
          // If scheduling throws because the context flipped to closed
          // between the canFade check and the ramp call, the fallback
          // below will still finish the teardown cleanly.
        }
        window.setTimeout(() => {
          audio.pause();
          audio.src = "";
          teardownSpectrum();
        }, TEARDOWN_FADE_MS + TEARDOWN_FADE_GUARD_MS);
        return;
      }

      // No-fade fallback (already paused/ended or no gain pipeline).
      // Pause first so the audio element stops feeding samples before
      // AudioContext.close() disengages the destination.
      audio.pause();
      audio.src = "";
      teardownSpectrum();
    };
  }, [effectiveUrl, stopProgressLoop, stopProgressRewind, teardownSpectrum]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === PlayerPhase.Idle || state.phase === PlayerPhase.Paused) {
      stopProgressRewind();
      stopSpectrumLoop({ clearBands: false });
      audio.muted = false;
      audio.volume = 1;

      // Order is load-bearing. `ensureSpectrumAnalyzer` performs all
      // AudioContext setup synchronously — constructor, source, splitter,
      // analyser connections — and fires `resume()` on the same tick. This
      // must happen BEFORE `audio.play()` so the AudioContext operations
      // share the user-gesture activation that the click on the play button
      // provides. Doing it inside the play().then() callback (the previous
      // behaviour) makes resume() race with audio.play()'s own resolution:
      // when play() takes longer than a few hundred ms (cold HTTP cache,
      // slow Deezer CDN, decode latency) the activation expires, resume()
      // resolves but leaves the context suspended, and the analyser stays
      // dark while playback continues. The promise itself is awaited inside
      // play().then() — that part is fine because the gesture-bound call
      // already happened on this synchronous tick.
      const spectrumReadyPromise = ensureSpectrumAnalyzer(audio);

      // Mute the WebAudio gain synchronously BEFORE audio.play() so the
      // very first decoded samples hit the speaker at zero amplitude.
      // The corresponding ramp back to unity is scheduled below, after
      // audio.play() resolves, so that the audio fades in over the
      // startup window instead of slamming on at full level.
      //
      // This eliminates the startup click users hear when a brand-new
      // track begins playing — observed when switching from a paused
      // (silent) state to a freshly mounted preview. The transient
      // arises from the MP3 decoder warming up and the
      // MediaElementSource → destination route engaging the audio
      // output device for the first time; both produce a brief
      // amplitude spike that the human ear perceives as a click against
      // the prior silence. Resuming a paused track is left untouched
      // (hasStartedRef gate) because the audio path is already warm
      // and the click does not occur there.
      const isFirstPlay = !hasStartedRef.current;
      const startupGainNode = gainNodeRef.current;
      const startupAudioContext = audioContextRef.current;
      if (isFirstPlay && startupGainNode && startupAudioContext) {
        const muteAt = startupAudioContext.currentTime;
        startupGainNode.gain.cancelScheduledValues(muteAt);
        startupGainNode.gain.setValueAtTime(0, muteAt);
      }

      notifyPlaybackIntent();
      audio
        .play()
        .then(() => {
          sendMusicSignal(hasStartedRef.current ? PreviewSignal.Resumed : PreviewSignal.Started);
          dispatch({ type: PlayerActionType.Play });
          notifyStatusChange(AudioPreviewStatus.Playing);
          hasStartedRef.current = true;
          startProgressLoop(audio);

          // Sample-accurate ramp back up to unity. Re-read the refs in
          // case `ensureSpectrumAnalyzer` had to rebuild the pipeline
          // between the synchronous mute above and this resolution.
          const rampGainNode = gainNodeRef.current;
          const rampAudioContext = audioContextRef.current;
          if (isFirstPlay && rampGainNode && rampAudioContext) {
            const rampStart = rampAudioContext.currentTime;
            rampGainNode.gain.cancelScheduledValues(rampStart);
            rampGainNode.gain.setValueAtTime(0, rampStart);
            rampGainNode.gain.linearRampToValueAtTime(1, rampStart + STARTUP_FADE_MS / 1000);
          }

          void spectrumReadyPromise
            .then((isAnalyzerReady) => {
              if (isAnalyzerReady && !audio.paused) startSpectrumLoop();
            })
            .catch(() => {
              clearSpectrumFrame();
              resetPeakHold();
            });
        })
        .catch(() => {
          sendMusicSignal(PreviewSignal.Error);
          notifyStatusChange(AudioPreviewStatus.Unavailable);
          dispatch({ type: PlayerActionType.Error });
        });
    } else if (state.phase === PlayerPhase.Playing) {
      audio.pause();
      stopProgressLoop(audio);
      startSpectrumFadeOut();
      sendMusicSignal(PreviewSignal.Paused);
      notifyStatusChange(AudioPreviewStatus.Paused);
      dispatch({ type: PlayerActionType.Pause });
    }
  }, [
    ensureSpectrumAnalyzer,
    resetPeakHold,
    startProgressLoop,
    startSpectrumFadeOut,
    startSpectrumLoop,
    state.phase,
    stopProgressLoop,
    stopProgressRewind,
    stopSpectrumLoop,
    notifyPlaybackIntent,
    notifyStatusChange,
  ]);

  const togglePlayFromEvent = useEffectEvent(togglePlay);

  const notifySeekHint = useCallback(
    (direction: VfdScrollOutDirection) => {
      onSeekHint?.(direction);
    },
    [onSeekHint],
  );

  /**
   * Seeks the audio by a signed delta (arrow-key step). No-op when the player
   * is not in `Playing` or `Paused` phase. Clamps to `0 … duration`. Fires
   * `onSeekHint` so the host can flash a VFD direction hint.
   *
   * @param deltaSeconds - Signed offset in seconds (negative = rewind).
   */
  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : DEFAULT_DURATION_SECONDS;
      audio.currentTime = resolveSeekTarget(audio.currentTime, deltaSeconds, dur);
      setProgressRatioValue(resolveAudioProgressRatio(audio));
      notifySeekHint(deltaSeconds < 0 ? VfdScrollOutDirection.Left : VfdScrollOutDirection.Right);
    },
    [state.phase, notifySeekHint, setProgressRatioValue],
  );

  /**
   * Jumps to the track start (cmd+Left). No-op unless active.
   * Does not fire `onSeekHint` — silent jump per product spec.
   */
  const seekToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
    audio.currentTime = 0;
    setProgressRatioValue(resolveAudioProgressRatio(audio));
  }, [state.phase, setProgressRatioValue]);

  /**
   * Jumps to `SEEK_END_GUARD_SECONDS` before the end (cmd+Right). No-op unless
   * active. Does not fire `onSeekHint` — silent jump per product spec.
   */
  const seekToNearEnd = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : DEFAULT_DURATION_SECONDS;
    audio.currentTime = Math.max(0, dur - SEEK_END_GUARD_SECONDS);
    setProgressRatioValue(resolveAudioProgressRatio(audio));
  }, [state.phase, setProgressRatioValue]);

  const seekByFromEvent = useEffectEvent(seekBy);
  const seekToStartFromEvent = useEffectEvent(seekToStart);
  const seekToNearEndFromEvent = useEffectEvent(seekToNearEnd);

  /**
   * Wires up the global MediaSession so the OS can route Media Keys, Bluetooth
   * headset buttons, macOS Touch-Bar / Now-Playing controls and similar
   * transport inputs to the preview player while the tab is the active media
   * source.
   *
   * Only registered while the player is in `Playing` or `Paused` phase: in
   * `Loading`, `Error`, `Unavailable` and `Idle` there is no audio to control
   * yet, so claiming the OS media slot would be misleading. On cleanup the
   * action handlers, metadata and `playbackState` are cleared so the Now-
   * Playing UI does not show a stale entry once the preview is gone.
   *
   * Multiple parallel `AudioPreviewPlayer` instances on the same page share
   * the single tab-wide MediaSession: whichever player most recently entered
   * Playing/Paused owns the OS controls. That matches user intuition (the
   * media key controls the preview you last interacted with) and avoids
   * extra coordination machinery.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;

    const mediaSession = navigator.mediaSession;
    mediaSession.metadata = new window.MediaMetadata({ title: trackTitle });
    mediaSession.playbackState =
      state.phase === PlayerPhase.Playing ? MediaSessionPlaybackState.Playing : MediaSessionPlaybackState.Paused;

    const handler = () => togglePlayFromEvent();
    try {
      mediaSession.setActionHandler(MediaSessionAction.Play, handler);
      mediaSession.setActionHandler(MediaSessionAction.Pause, handler);
    } catch {
      // Older browsers throw on unsupported actions. Whatever did register
      // stays active until cleanup runs.
    }

    return () => {
      try {
        mediaSession.setActionHandler(MediaSessionAction.Play, null);
        mediaSession.setActionHandler(MediaSessionAction.Pause, null);
      } catch {
        // ignored — see above
      }
      mediaSession.metadata = null;
      mediaSession.playbackState = MediaSessionPlaybackState.None;
    };
  }, [state.phase, trackTitle]);

  const isPlayerActive = state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused;
  const isPlayerActiveRef = useRef(isPlayerActive);
  useEffect(() => {
    isPlayerActiveRef.current = isPlayerActive;
  }, [isPlayerActive]);

  /**
   * Registers this player with the tab-wide keyboard router so the global
   * keydown listener can start, toggle, or seek playback without a player
   * control being focused. Resolves the autoplay-policy gap left by
   * MediaSession: the OS media keys can only take over once playback has
   * started at least once, whereas spacebar/arrow keys in the focused tab
   * count as real user gestures and are therefore allowed to kick off the
   * very first play.
   */
  useEffect(() => {
    return registerAudioPreviewForKeyboard({
      togglePlay: () => togglePlayFromEvent(),
      isActive: () => isPlayerActiveRef.current,
      seekBy: (delta) => seekByFromEvent(delta),
      seekToStart: () => seekToStartFromEvent(),
      seekToNearEnd: () => seekToNearEndFromEvent(),
    });
  }, []);

  const isLoading = state.phase === PlayerPhase.Loading;
  const isUnavailable = state.phase === PlayerPhase.Error || state.phase === PlayerPhase.Unavailable;
  const isDisabled = isLoading || isUnavailable;
  const isPlaying = state.phase === PlayerPhase.Playing;

  const currentTime = state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused ? state.currentTime : 0;
  const duration =
    state.phase === PlayerPhase.Idle || state.phase === PlayerPhase.Playing || state.phase === PlayerPhase.Paused
      ? state.duration
      : 30;

  const isSong = mediaKind === MediaKindValue.Song;
  const unavailableText = isSong ? t("audio.songUnavailable") : t("audio.previewUnavailable");

  const timeText = isLoading
    ? t("audio.previewLoading")
    : isUnavailable
      ? unavailableText
      : formatTime(state.phase === PlayerPhase.Idle ? duration : currentTime);

  const ariaLabel = isLoading
    ? t("audio.previewLoading")
    : isUnavailable
      ? unavailableText
      : isPlaying
        ? isSong
          ? "Pause song"
          : "Pause preview"
        : isSong
          ? "Play song"
          : "Play preview";

  return {
    ariaLabel,
    isDisabled,
    isLoading,
    isPlaying,
    isUnavailable,
    mediaLabel: isSong ? "Song" : "Preview",
    progressRatio,
    timeText,
    title: isLoading ? t("audio.previewLoading") : isUnavailable ? unavailableText : undefined,
    togglePlay,
    trackTitle,
  };
}

export function AudioPreviewPlayer(props: AudioPreviewPlayerProps) {
  const player = useAudioPreviewController(props);

  return (
    <section aria-label={`${player.mediaLabel}: ${player.trackTitle}`}>
      <Player
        isPlaying={player.isPlaying}
        isDisabled={player.isDisabled}
        timeText={player.timeText}
        progressRatio={player.progressRatio}
        ariaLabel={player.ariaLabel}
        title={player.title}
        onTogglePlay={player.togglePlay}
      />
    </section>
  );
}

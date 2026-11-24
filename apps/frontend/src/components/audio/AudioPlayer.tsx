import gsap from "gsap";
import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { AudioStatus, type AudioStatus as AudioStatusType } from "@/components/audio/AudioStatus";
import {
  type AudioGraphNodes,
  disconnectAudioGraph,
  getAudioContextConstructor,
  type StereoSpectrumAnalysers,
  type StereoSpectrumData,
} from "@/components/audio/audioGraph";
import { registerAudioForKeyboard } from "@/components/audio/audioKeyboardRegistry";
import { resolveSeekTarget, SEEK_END_GUARD_SECONDS } from "@/components/audio/audioSeek";
import {
  AudioContextState,
  MediaSessionAction,
  MediaSessionPlaybackState,
  PlayerActionType,
  PlayerPhase,
  type PlayerState,
  playerReducer,
  resolveAudioDuration,
  resolveAudioProgressRatio,
} from "@/components/audio/playerStateMachine";
import { fetchPreviewUrl } from "@/components/audio/previewSource";
import { quantizeProgressRatio } from "@/components/audio/progressQuantize";
import {
  advancePeakHold,
  decayPeakHoldChannel,
  decayStereoLevel,
  fadeBandValue,
  resolveSpectrumBandsInto,
  resolveStereoLevel,
  resolveTimeDomainRms,
  SPECTRUM_CHANNEL_BAND_COUNT,
  SPECTRUM_RECOVERY_CHECK_MS,
  SPECTRUM_UPDATE_MS,
  type StereoPeakHoldState,
} from "@/components/audio/spectrumAnalysis";
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
import { audioCopy } from "@/copy/audio";
import { PreviewSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { prefersReducedMotion, setupMotion } from "@/lib/motion/setup";
import { type MediaKindType, MediaKindValue } from "@/lib/types/media-card";

export interface AudioPlayerProps {
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
  /**
   * Identity of the current record (album-scoped). When it CHANGES across a
   * source switch while playing, playback is NOT auto-continued: the engine
   * reports Ready so the deck coasts to a halt and the record-swap orchestration
   * re-triggers play once the new disc has settled. Unchanged (same album),
   * reduced motion, or omitted (standalone `AudioPlayer`) keeps the seamless
   * continue behaviour.
   */
  recordSwapKey?: string;
  /**
   * Holds the transport while the host is still putting the view together,
   * such as while the artist data loads: the play button is disabled, and the
   * spacebar and media keys do nothing. Calls to `togglePlay` itself still run,
   * because the turntable's restart after a record swap goes through it and is
   * part of the swap rather than an input. Unlike `isDisabled`, it leaves the
   * time display and the analyzer alone, since a record may still be playing.
   */
  playbackLocked?: boolean;
  /** Fires synchronously when the user starts playback via click, media key, or Space. */
  onPlaybackIntent?: () => void;
  onStatusChange?: (status: AudioStatusType) => void;
  /** Fires after a ±step arrow seek so the host can flash a VFD hint. Not fired for cmd jumps. */
  onSeekHint?: (direction: VfdScrollOutDirection) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLAYER_PROGRESS_REWIND_MS = 420;
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

/**
 * Headless audio-preview engine: owns the `<audio>` element lifecycle, the
 * WebAudio spectrum pipeline, the play-state machine, the seek transport, the
 * tab-wide keyboard registry and MediaSession, and returns a flat view-model
 * (play flags, time/progress, transport callbacks) for a host to render.
 *
 * Used directly by the {@link AudioPlayer} component and by the
 * `TurntablePlayerProvider`, which lifts the engine into the turntable hub so
 * the knob/LED/platter share one playback source.
 *
 * @param props - {@link AudioPlayerProps}.
 * @returns The audio view-model: status flags, `timeText`, `progressRatio`,
 *   `ariaLabel`, and the `togglePlay`/`seekBy`/`seekToStart`/`seekToNearEnd`
 *   transport callbacks (all stable across renders).
 */
export function useAudioController({
  previewUrl,
  refreshShortId,
  mediaKind,
  trackTitle,
  recordSwapKey,
  playbackLocked = false,
  onPlaybackIntent,
  onStatusChange,
  onSeekHint,
}: AudioPlayerProps) {
  const initialPhase: PlayerState = previewUrl
    ? { phase: PlayerPhase.Idle, duration: 30 }
    : { phase: PlayerPhase.Loading };
  const [state, dispatch] = useReducer(playerReducer, initialPhase);
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  // effectiveUrl is derived so a same-album track switch (the previewUrl prop
  // changing on the mounted hub) flows straight into the source effect below, which
  // swaps the element's src in place. `fetchedUrl` is the fallback for the refresh
  // path, where the component mounted without a preview URL.
  const effectiveUrl = previewUrl ?? fetchedUrl;
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
  // Mirrors whether playback is active, read by the source effect on a same-album
  // src swap to decide whether to continue playing the new track on the same element.
  const isPlayingRef = useRef(false);
  // True while a source SWITCH is in flight (a new source effect has mounted), so
  // the previous cleanup's deferred teardown keeps the AudioContext warm instead of
  // closing it. Only a real unmount (no following source effect) leaves it false and
  // closes the context. See the source effect + finishTeardown.
  const switchPendingRef = useRef(false);
  // True once the source effect has mounted a source, so a later run is a switch.
  // `hasStartedRef` turns true only on a first play, and a track that failed to
  // load or was never played still leaves its phase behind for the next track.
  const hasMountedSourceRef = useRef(false);
  // REGRESSION GUARD — do not defeat the quantize. This is the only React state the
  // playback progress feeds, and it is sampled on the shared 60 Hz ticker
  // (startProgressLoop). It MUST only ever be written through setProgressRatioValue,
  // which snaps the ratio to a coarse grid (quantizeProgressRatio) and dedups it.
  // Writing raw per-frame values here re-renders the ENTIRE player subtree 60×/s and
  // starves hover/transition paints — the "everything lags/stutters while a song
  // plays" bug. The analyzer stays smooth through it all because it bypasses React
  // via the imperative spectrumStore. If you need finer progress, move it to an
  // imperative store like spectrumStore — never remove the quantize.
  const [progressRatio, setProgressRatio] = useState(0);

  // Tune the shared ticker once on mount (lagSmoothing); idempotent.
  useEffect(() => {
    setupMotion();
  }, []);

  // Keep the playing-state mirror current so the source effect can read it without
  // taking state.phase as a dependency (which would re-run the swap on every play/pause).
  useEffect(() => {
    isPlayingRef.current = state.phase === PlayerPhase.Playing;
  }, [state.phase]);

  // Mirrors the album-scoped record identity so the source effect can compare the
  // incoming key against the previous one WITHOUT taking recordSwapKey as a
  // dependency (which would rebuild the audio element on an identity change alone).
  const recordSwapKeyRef = useRef(recordSwapKey);
  useEffect(() => {
    recordSwapKeyRef.current = recordSwapKey;
  }, [recordSwapKey]);
  // The record identity applied at the last source switch — the baseline the next
  // switch compares against to tell a same-album track change from a record swap.
  const lastSwapKeyRef = useRef(recordSwapKey);

  // Lazy fetch the preview URL when the component mounted without one.
  // Aborts on unmount so a slow Deezer call doesn't update a stale tree.
  useEffect(() => {
    if (previewUrl || !refreshShortId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const nextPreviewUrl = await fetchPreviewUrl(refreshShortId, controller.signal);
        if (nextPreviewUrl) {
          setFetchedUrl(nextPreviewUrl);
          dispatch({ type: PlayerActionType.UrlReady });
        } else {
          sendMusicSignal(PreviewSignal.Unavailable);
          notifyStatusChangeFromEvent(AudioStatus.Unavailable);
          dispatch({ type: PlayerActionType.UrlUnavailable });
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        sendMusicSignal(PreviewSignal.Unavailable);
        notifyStatusChangeFromEvent(AudioStatus.Unavailable);
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
    // Snap to the progress grid so the shared 60 Hz ticker only flips React state
    // when the bar visibly moves (~a few Hz), not every frame. The raw 60 Hz churn
    // re-rendered the whole player subtree and starved hover/transition paints.
    const nextRatio = quantizeProgressRatio(ratio);
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
      // Runs on the shared 60 Hz ticker. Sampling every frame is fine ONLY because
      // setProgressRatioValue quantizes + dedups before touching React state (see the
      // regression guard on the progressRatio state); it re-renders on a visible step,
      // not per frame.
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
    (status: AudioStatusType) => {
      onStatusChange?.(status);
    },
    [onStatusChange],
  );
  const notifyStatusChangeFromEvent = useEffectEvent(notifyStatusChange);
  const notifyPlaybackIntent = useCallback(() => {
    onPlaybackIntent?.();
  }, [onPlaybackIntent]);

  // Hands the current element's Web Audio nodes to the caller and nulls the node +
  // buffer refs. A graph belongs to the one element its MediaElementSource was
  // created for, so a source switch releases it at once: `ensureSpectrumAnalyzer`
  // reuses whatever the refs hold, and a stale graph there would leave the next
  // track playing past the analyzer.
  const releaseAudioGraph = useCallback((): AudioGraphNodes => {
    const nodes: AudioGraphNodes = {
      source: mediaSourceRef.current,
      splitter: channelSplitterRef.current,
      analysers: analysersRef.current,
      gain: gainNodeRef.current,
    };
    mediaSourceRef.current = null;
    channelSplitterRef.current = null;
    analysersRef.current = null;
    gainNodeRef.current = null;
    spectrumDataRef.current = null;
    return nodes;
  }, []);

  // Releases and disconnects the current graph. Shared by teardownSpectrum and the
  // ensureSpectrumAnalyzer catch path. It does NOT stop the loop or close the
  // context: those steps differ per call site (teardown closes the context; the
  // catch leaves it open for a rebuild).
  const disconnectAudioGraphNodes = useCallback(() => {
    disconnectAudioGraph(releaseAudioGraph());
  }, [releaseAudioGraph]);

  const teardownSpectrum = useCallback(() => {
    stopSpectrumLoop();
    disconnectAudioGraphNodes();

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== AudioContextState.Closed) {
      audioContext.onstatechange = null;
      void audioContext.close().catch(() => {
        // Closing can fail in interrupted browser audio sessions. The audio
        // element is disposed independently, so there is nothing else to do.
      });
    }
  }, [disconnectAudioGraphNodes, stopSpectrumLoop]);

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
        disconnectAudioGraphNodes();
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
    [disconnectAudioGraphNodes, resetPeakHold, startSpectrumLoop, stopSpectrumLoop],
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

  // Starts playback on the given element: the load-bearing gesture-synchronous
  // AudioContext/gain setup, then audio.play() with the startup fade. Extracted
  // from togglePlay so a same-album source switch can continue playback on the
  // same element (see the source effect below).
  const beginPlayback = useCallback(
    (audio: HTMLAudioElement) => {
      stopProgressRewind();
      stopSpectrumLoop({ clearBands: false });
      audio.muted = false;
      audio.volume = 1;

      // Order is load-bearing. `ensureSpectrumAnalyzer` performs all AudioContext
      // setup synchronously and fires `resume()` on the same tick, BEFORE
      // `audio.play()`, so the operations share the play button's user-gesture
      // activation (a resume() racing play()'s resolution can leave the context
      // suspended and the analyser dark while playback continues).
      const spectrumReadyPromise = ensureSpectrumAnalyzer(audio);

      // Mute the WebAudio gain synchronously before play() so the first decoded
      // samples hit the speaker at zero amplitude; the ramp back to unity below
      // fades the audio in over the startup window instead of slamming on. This
      // kills the startup click a brand-new track produces (MP3 decoder warmup +
      // MediaElementSource route engaging). Resuming a paused track is skipped
      // (hasStartedRef) because the audio path is already warm.
      const isFirstPlay = !hasStartedRef.current;
      const startupGainNode = gainNodeRef.current;
      const startupAudioContext = audioContextRef.current;
      if (isFirstPlay && startupGainNode && startupAudioContext) {
        const muteAt = startupAudioContext.currentTime;
        startupGainNode.gain.cancelScheduledValues(muteAt);
        startupGainNode.gain.setValueAtTime(0, muteAt);
      }

      notifyPlaybackIntent();
      // A play() still pending when its element is switched out settles for a
      // source that is gone, because the switch pauses and empties the element
      // and that rejects the promise. The player's phase belongs to the current
      // element, so both outcomes are dropped for any other one.
      audio
        .play()
        .then(() => {
          if (audioRef.current !== audio) return;
          sendMusicSignal(hasStartedRef.current ? PreviewSignal.Resumed : PreviewSignal.Started);
          dispatch({ type: PlayerActionType.Play });
          notifyStatusChange(AudioStatus.Playing);
          hasStartedRef.current = true;
          startProgressLoop(audio);

          // Sample-accurate ramp back up to unity. Re-read the refs in case
          // `ensureSpectrumAnalyzer` rebuilt the pipeline between the mute above
          // and this resolution.
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
          if (audioRef.current !== audio) return;
          sendMusicSignal(PreviewSignal.Error);
          notifyStatusChange(AudioStatus.Unavailable);
          dispatch({ type: PlayerActionType.Error });
        });
    },
    [
      ensureSpectrumAnalyzer,
      notifyPlaybackIntent,
      notifyStatusChange,
      resetPeakHold,
      startProgressLoop,
      startSpectrumLoop,
      stopProgressRewind,
      stopSpectrumLoop,
    ],
  );
  // Decides how a source switch (a previewUrl change on the mounted hub) proceeds.
  // A same-album track change — or no swap identity, or reduced motion — continues
  // playback seamlessly on the fresh element. A record swap to a different album
  // instead hands playback to the swap orchestration: it reports Ready so the deck
  // coasts to a halt and leaves the new element idle until the disc has settled and
  // the deck re-triggers play. `previousSwapKey` is the identity at the prior
  // switch (captured before the ref is advanced), so it is never the incoming one.
  const applySourceSwitch = useEffectEvent((audio: HTMLAudioElement, previousSwapKey: string | undefined) => {
    dispatch({ type: PlayerActionType.SourceChanged });
    setProgressRatioValue(0);
    if (!isPlayingRef.current) return;
    const currentSwapKey = recordSwapKeyRef.current;
    const isRecordSwap = currentSwapKey !== undefined && currentSwapKey !== previousSwapKey && !prefersReducedMotion();
    if (isRecordSwap) {
      notifyStatusChange(AudioStatus.Ready);
      return;
    }
    beginPlayback(audio);
  });

  // The audio element is (re)created whenever the effective URL changes. Both a
  // same-album track switch and a different-album record swap change the URL on the
  // mounted hub (the hub no longer remounts per track, MC-113); the element is
  // rebuilt for the new source, and `applySourceSwitch` decides whether to continue
  // playback on the new element (same album) or defer it to the swap orchestration
  // (different album). Playback-state transitions (play/pause) do NOT re-run this —
  // only the URL does — so a running play() is never torn down mid-promise. The
  // cleanup fades the old element out then disconnects it, but KEEPS the
  // AudioContext warm across the switch (only an unmount closes it): a fresh context
  // cannot be resumed without a user gesture, which the record swap's coast + slide
  // (~3s) outlives — the exact cause of the new track running silently with a dark
  // analyzer after the swap. Reusing the still-running context needs no resume.
  useEffect(() => {
    if (!effectiveUrl) return;

    // A new source is mounting: mark this as a switch so the PREVIOUS cleanup's
    // deferred teardown keeps the context warm instead of closing it.
    switchPendingRef.current = true;

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.muted = false;
    audio.volume = 1;
    audio.src = effectiveUrl;

    const handleLoadedMetadata = () => {
      const dur = resolveAudioDuration(audio);
      dispatch({ type: PlayerActionType.MetadataLoaded, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleTimeUpdate = () => {
      const dur = resolveAudioDuration(audio);
      dispatch({ type: PlayerActionType.TimeUpdate, currentTime: audio.currentTime, duration: dur });
      setProgressRatioFromEvent(resolveAudioProgressRatio(audio));
    };
    const handleEnded = () => {
      stopProgressLoop();
      setProgressRatioFromEvent(1);
      startProgressRewindFromEvent();
      startSpectrumFadeOutFromEvent();
      sendMusicSignal(PreviewSignal.Finished);
      notifyStatusChangeFromEvent(AudioStatus.Ready);
      dispatch({ type: PlayerActionType.Ended });
    };
    const handleError = () => {
      stopProgressLoop();
      sendMusicSignal(PreviewSignal.Error);
      notifyStatusChangeFromEvent(AudioStatus.Unavailable);
      dispatch({ type: PlayerActionType.Error });
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audioRef.current = audio;

    // Advance the record-swap baseline for every source change (including idle
    // adopts and the initial mount) so it never goes stale, capturing the prior
    // identity first for the switch decision.
    const previousSwapKey = lastSwapKeyRef.current;
    lastSwapKeyRef.current = recordSwapKeyRef.current;

    // A source switch (not the first source): reset the player to a fresh idle
    // track, whatever phase the previous one ended in, and either continue or
    // defer playback per the swap decision.
    if (hasMountedSourceRef.current) {
      applySourceSwitch(audio, previousSwapKey);
    }
    hasMountedSourceRef.current = true;

    return () => {
      // Reset the switch flag; a FOLLOWING source effect (a real switch) sets it
      // back to true before the deferred teardown below reads it. On unmount no such
      // effect runs, so it stays false and the context is closed.
      switchPendingRef.current = false;

      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      stopProgressLoop();
      stopProgressRewind();
      audioRef.current = null;
      // Released synchronously, so a following source effect that continues playback
      // builds a graph for its own element instead of reusing this one.
      const previousGraph = releaseAudioGraph();

      // Pauses + clears the old element. Kept synchronous (or on the fade timer) so
      // it never leaks past a later render tick.
      const detachOldElement = () => {
        audio.pause();
        audio.src = "";
      };
      // Disconnects the old element's graph. On a switch the AudioContext stays warm
      // for the next track, and the spectrum loop is stopped only when the next track
      // has not built a graph yet, because otherwise the running loop is already its
      // own. On a real unmount the full teardown closes the context. Deferred so a
      // following source effect can flip `switchPendingRef` to true first, but
      // pause-free so the deferral cannot inflate teardown pauses.
      const finalizeGraph = () => {
        disconnectAudioGraph(previousGraph);
        if (switchPendingRef.current) {
          if (!analysersRef.current) stopSpectrumLoop();
          return;
        }
        teardownSpectrum();
      };

      const audioContext = audioContextRef.current;
      const gainNode = previousGraph.gain;
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
          // The fallback below still finishes teardown if scheduling throws.
        }
        window.setTimeout(() => {
          detachOldElement();
          finalizeGraph();
        }, TEARDOWN_FADE_MS + TEARDOWN_FADE_GUARD_MS);
        return;
      }

      // Not playing: detach synchronously (nothing to fade), but defer the switch-vs-
      // unmount graph decision so a synchronous following source effect can flag the
      // switch first.
      detachOldElement();
      window.setTimeout(finalizeGraph, 0);
    };
  }, [effectiveUrl, stopProgressLoop, stopProgressRewind, stopSpectrumLoop, releaseAudioGraph, teardownSpectrum]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === PlayerPhase.Idle || state.phase === PlayerPhase.Paused) {
      beginPlayback(audio);
    } else if (state.phase === PlayerPhase.Playing) {
      audio.pause();
      stopProgressLoop(audio);
      startSpectrumFadeOut();
      sendMusicSignal(PreviewSignal.Paused);
      notifyStatusChange(AudioStatus.Paused);
      dispatch({ type: PlayerActionType.Pause });
    }
  }, [beginPlayback, notifyStatusChange, startSpectrumFadeOut, state.phase, stopProgressLoop]);

  // The spacebar and the media keys are input like the play button, so they
  // respect the lock the button shows; reading the prop here keeps it current
  // for the long-lived listeners without re-registering them.
  const togglePlayFromInput = useEffectEvent(() => {
    if (!playbackLocked) togglePlay();
  });

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
      const dur = resolveAudioDuration(audio);
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
    const dur = resolveAudioDuration(audio);
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
   * Multiple parallel `AudioPlayer` instances on the same page share
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

    const handler = () => togglePlayFromInput();
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
    return registerAudioForKeyboard({
      togglePlay: () => togglePlayFromInput(),
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
  const unavailableText = isSong ? audioCopy.songUnavailable : audioCopy.previewUnavailable;

  const timeText = isLoading
    ? audioCopy.previewLoading
    : isUnavailable
      ? unavailableText
      : formatTime(state.phase === PlayerPhase.Idle ? duration : currentTime);

  const ariaLabel = isLoading
    ? audioCopy.previewLoading
    : isUnavailable
      ? unavailableText
      : isPlaying
        ? isSong
          ? audioCopy.pauseSong
          : audioCopy.pausePreview
        : isSong
          ? audioCopy.playSong
          : audioCopy.playPreview;

  return {
    ariaLabel,
    isDisabled,
    isLoading,
    isPlaybackLocked: playbackLocked,
    isPlaying,
    isUnavailable,
    mediaLabel: isSong ? audioCopy.songLabel : audioCopy.previewLabel,
    progressRatio,
    seekBy,
    seekToNearEnd,
    seekToStart,
    timeText,
    title: isLoading ? audioCopy.previewLoading : isUnavailable ? unavailableText : undefined,
    togglePlay,
    trackTitle,
  };
}

/**
 * AudioPlayer - Audio preview playback component
 *
 * Orchestrates the compound Player component for audio preview functionality.
 * Handles audio element lifecycle and state management through
 * {@link useAudioController}, whose phases `playerStateMachine` defines.
 *
 * @param props - {@link AudioPlayerProps}.
 */
export function AudioPlayer(props: AudioPlayerProps) {
  const player = useAudioController(props);

  return (
    <section aria-label={`${player.mediaLabel}: ${player.trackTitle}`}>
      <Player
        isPlaying={player.isPlaying}
        isDisabled={player.isDisabled}
        isPlaybackLocked={player.isPlaybackLocked}
        timeText={player.timeText}
        progressRatio={player.progressRatio}
        ariaLabel={player.ariaLabel}
        title={player.title}
        onTogglePlay={player.togglePlay}
      />
    </section>
  );
}

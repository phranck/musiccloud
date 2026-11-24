/**
 * The player's Web Audio graph: the shared `AudioContext`, the per-element
 * source, gain, splitter and analyser nodes, their gesture-synchronous setup
 * before playback, their release on a source switch and the full teardown on
 * unmount.
 */
import { type RefObject, useCallback, useRef } from "react";
import { type AudioGraphNodes, disconnectAudioGraph, getAudioContextConstructor } from "@/components/audio/audioGraph";
import { AudioContextState } from "@/components/audio/playerStateMachine";
import { clearSpectrumFrame } from "@/components/audio/spectrumStore";
import type { SpectrumLoop } from "@/components/audio/useSpectrumLoop";

/**
 * What the graph shares with the spectrum loop: the analyser and buffer refs
 * the graph fills and the loop reads, and the loop controls the graph's
 * state-change handler calls. Every field is documented on `SpectrumLoop`.
 */
export type AudioGraphOptions = Pick<
  SpectrumLoop,
  "analysersRef" | "spectrumDataRef" | "startSpectrumLoop" | "stopSpectrumLoop" | "resetPeakHold"
>;

/** The graph's refs and its stable callbacks. */
export interface AudioGraph {
  /** The shared audio context, kept warm across source switches and closed on unmount. */
  audioContextRef: RefObject<AudioContext | null>;
  /** The current element's gain node, used for the startup and teardown fades. */
  gainNodeRef: RefObject<GainNode | null>;
  /** Hands the current element's nodes to the caller and nulls the node and buffer refs. */
  releaseAudioGraph: () => AudioGraphNodes;
  /** Stops the loop, disconnects the graph and closes the audio context. */
  teardownSpectrum: () => void;
  /** Builds or reuses the graph for an element and resolves to whether the context runs. */
  ensureSpectrumAnalyzer: (audio: HTMLAudioElement) => Promise<boolean>;
}

/**
 * Owns the Web Audio graph of one player. Every ref in a dependency list is a
 * stable ref object, so each callback changes only when one of the callbacks
 * it lists changes.
 *
 * @param options - {@link AudioGraphOptions}.
 * @returns The graph's refs and its stable callbacks.
 */
export function useAudioGraph({
  analysersRef,
  spectrumDataRef,
  startSpectrumLoop,
  stopSpectrumLoop,
  resetPeakHold,
}: AudioGraphOptions): AudioGraph {
  const audioContextRef = useRef<AudioContext | null>(null);
  const channelSplitterRef = useRef<ChannelSplitterNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

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
  }, [analysersRef, spectrumDataRef]);

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
   *      already be consumed or expired, particularly on Safari, and on
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
   * To honour both, this function performs ALL synchronous work (context
   * construction, source/splitter/analyser creation, connections) before
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
        // VFD visualisation matches what is heard at all times. During
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
      // surrounding control flow synchronous up to the .then() chain, and
      // that is exactly how the surrounding gesture activation survives.
      if (audioContext.state === AudioContextState.Running) return Promise.resolve(true);
      return audioContext
        .resume()
        .then(() => audioContext.state === AudioContextState.Running)
        .catch(() => false);
    },
    [analysersRef, disconnectAudioGraphNodes, resetPeakHold, spectrumDataRef, startSpectrumLoop, stopSpectrumLoop],
  );

  return { audioContextRef, gainNodeRef, releaseAudioGraph, teardownSpectrum, ensureSpectrumAnalyzer };
}

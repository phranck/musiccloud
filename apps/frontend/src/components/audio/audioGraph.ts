/**
 * The Web Audio graph types the player builds for each audio element, the
 * helper that takes such a graph out of the audio routing, and the lookup of
 * the browser's `AudioContext` constructor.
 */

/** The `AudioContext` constructor type, shared by the standard and the WebKit-prefixed one. */
export type BrowserAudioContextConstructor = typeof AudioContext;

/**
 * The byte buffers one spectrum tick reads the two analysers into. They are
 * allocated once per graph and reused on every tick.
 */
export interface StereoSpectrumData {
  /** Frequency-domain bytes of the left channel, `frequencyBinCount` long. */
  left: Uint8Array<ArrayBuffer>;
  /** Frequency-domain bytes of the right channel, `frequencyBinCount` long. */
  right: Uint8Array<ArrayBuffer>;
  /** Time-domain sample buffers, used to derive the per-channel RMS level. */
  leftTime: Uint8Array<ArrayBuffer>;
  /** Time-domain samples of the right channel, `fftSize` long. */
  rightTime: Uint8Array<ArrayBuffer>;
}

/** The analyser nodes fed by the channel splitter, one per stereo channel. */
export interface StereoSpectrumAnalysers {
  /** Analyser on splitter output 0, the left channel. */
  left: AnalyserNode;
  /** Analyser on splitter output 1, the right channel. */
  right: AnalyserNode;
}

/**
 * The Web Audio nodes built for one audio element. Every field is null when the
 * graph was never built or only partly built.
 */
export interface AudioGraphNodes {
  /** The element's media source node, which can be created only once per element. */
  source: MediaElementAudioSourceNode | null;
  /** The splitter that feeds the two analysers from the gain node. */
  splitter: ChannelSplitterNode | null;
  /** The per-channel analysers behind the splitter. */
  analysers: StereoSpectrumAnalysers | null;
  /** The gain node between the source and the destination, used for the startup and teardown fades. */
  gain: GainNode | null;
}

/**
 * Disconnects every node of one element's graph. Safe on a partly built graph.
 *
 * @param nodes - The graph to take out of the audio routing.
 */
export function disconnectAudioGraph(nodes: AudioGraphNodes): void {
  nodes.source?.disconnect();
  nodes.splitter?.disconnect();
  nodes.analysers?.left.disconnect();
  nodes.analysers?.right.disconnect();
  nodes.gain?.disconnect();
}

/**
 * The browser's `AudioContext` constructor, falling back to the
 * `webkitAudioContext` that older Safari versions expose.
 *
 * @returns The constructor, or `undefined` when the browser has no Web Audio support.
 */
export function getAudioContextConstructor(): BrowserAudioContextConstructor | undefined {
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: BrowserAudioContextConstructor }).webkitAudioContext
  );
}

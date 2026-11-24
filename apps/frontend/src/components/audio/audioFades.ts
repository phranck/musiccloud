/**
 * The gain ramps that hide clicks when a track starts and when a playing
 * element is torn down: their durations and the helpers that schedule them on
 * the player's gain node.
 */

/**
 * Sample-accurate gain ramp in milliseconds applied on the very first play of
 * a fresh audio source so the audio fades in from silence to unity. The ramp
 * hides the startup transient that MP3 decoders and freshly engaged
 * MediaElementSource → destination routing produce together: even a brief,
 * low-amplitude burst at the moment the audio output device re-engages is
 * audible as a click against the prior silence. The ramp is only scheduled on
 * the first play of each fresh audio element (tracked via `hasStartedRef`).
 * Resuming a previously-played, paused track does not need it because the
 * audio path is already warm.
 */
const STARTUP_FADE_MS = 30;
/**
 * Sample-accurate gain ramp in milliseconds applied on teardown when the audio
 * is still playing at unmount. Required because the share-page Top-Tracks
 * button triggers an SPA navigation while the current preview is
 * mid-playback: the old MediaCard unmounts, `audio.pause()` and
 * `AudioContext.close()` fire in immediate succession, and the OS audio
 * session disengages mid-stream. The DAC silencing at a non-zero waveform
 * sample produces an audible speaker click. User-initiated pauses do NOT
 * exhibit this because the context stays alive after `audio.pause()`, so the
 * click is specifically about `close()` racing the audio path. The ramp
 * drives the gain to zero before the deferred pause and teardown run, so the
 * close sees silence at the destination.
 */
const TEARDOWN_FADE_MS = 30;
/**
 * Safety margin in milliseconds added on top of {@link TEARDOWN_FADE_MS}
 * before the deferred pause and context close fire, so the scheduled gain ramp
 * has fully settled at the audio graph before the destination is destroyed.
 */
const TEARDOWN_FADE_GUARD_MS = 10;

/**
 * Mutes the gain at the context's current time. Called synchronously before
 * `audio.play()` on a first play, so the first decoded samples reach the
 * speaker at zero amplitude.
 *
 * @param gainNode - The element's gain node.
 * @param audioContext - The context the gain node belongs to.
 */
export function muteForStartup(gainNode: GainNode, audioContext: AudioContext): void {
  const muteAt = audioContext.currentTime;
  gainNode.gain.cancelScheduledValues(muteAt);
  gainNode.gain.setValueAtTime(0, muteAt);
}

/**
 * Ramps the gain from zero to unity over {@link STARTUP_FADE_MS}, starting at
 * the context's current time. Called once a first `play()` has resolved.
 *
 * @param gainNode - The element's gain node.
 * @param audioContext - The context the gain node belongs to.
 */
export function rampUpFromStartup(gainNode: GainNode, audioContext: AudioContext): void {
  const rampStart = audioContext.currentTime;
  gainNode.gain.cancelScheduledValues(rampStart);
  gainNode.gain.setValueAtTime(0, rampStart);
  gainNode.gain.linearRampToValueAtTime(1, rampStart + STARTUP_FADE_MS / 1000);
}

/**
 * Ramps the gain to zero over {@link TEARDOWN_FADE_MS} and runs `onFaded`
 * once the ramp and {@link TEARDOWN_FADE_GUARD_MS} have passed. If scheduling
 * the ramp throws, `onFaded` still runs on the same timer, so teardown always
 * finishes.
 *
 * @param gainNode - The gain node of the element being torn down.
 * @param audioContext - The running context the gain node belongs to.
 * @param onFaded - Pauses the element and finishes its teardown.
 */
export function fadeOutForTeardown(gainNode: GainNode, audioContext: AudioContext, onFaded: () => void): void {
  const fadeStartTime = audioContext.currentTime;
  try {
    gainNode.gain.cancelScheduledValues(fadeStartTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, fadeStartTime);
    gainNode.gain.linearRampToValueAtTime(0, fadeStartTime + TEARDOWN_FADE_MS / 1000);
  } catch {
    // The fallback below still finishes teardown if scheduling throws.
  }
  window.setTimeout(onFaded, TEARDOWN_FADE_MS + TEARDOWN_FADE_GUARD_MS);
}

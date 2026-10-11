/**
 * @file The error an upstream source throws when it did not answer.
 *
 * A source that answers "there is nothing" returns an empty value. One that
 * times out, fails, rate-limits or answers with an error throws this instead.
 * Callers depend on the difference: an empty answer may be remembered, a
 * failure must not be, or one bad minute upstream is stored as a fact about
 * the artist or the track for days.
 */

/** An upstream source failed to answer, as opposed to answering with nothing. */
export class UpstreamUnavailableError extends Error {
  /**
   * @param source - The upstream that failed, such as `deezer` or `lastfm`.
   * @param message - What failed, for the log.
   * @param cause - The underlying error, when there is one.
   */
  constructor(
    readonly source: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "UpstreamUnavailableError";
  }
}

/**
 * @file Transport for the Jamendo API v3.0: configuration, request spacing,
 * the error type, the low-level GET and the `/tracks` retry.
 *
 * Every Jamendo request of the Creative-Commons path goes through
 * {@link jamendoRequest}, so the client id, the timeout, the burst throttle and
 * the envelope check apply to all of them. The endpoint wrappers in
 * `client.ts` build on {@link jamendoFetch} and {@link fetchJamendoTracks}.
 */

import { createConcurrencyLimiter } from "../../../lib/concurrency.js";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";
import { createMinIntervalThrottle } from "../../../lib/infra/throttle.js";
import type { JamendoEnvelope, JamendoTrackRaw } from "./types.js";

/** Base URL of the Jamendo API v3.0; every request path is appended to it. */
const JAMENDO_BASE = "https://api.jamendo.com/v3.0";

/**
 * Reads the configured Jamendo client id, throwing when it is absent so callers
 * fail loudly instead of silently hitting an unauthenticated endpoint.
 *
 * @returns The non-empty `JAMENDO_CLIENT_ID`.
 * @throws Error when `JAMENDO_CLIENT_ID` is unset or empty.
 */
function requireClientId(): string {
  const id = process.env.JAMENDO_CLIENT_ID;
  if (!id) {
    throw new Error("JAMENDO_CLIENT_ID is not set");
  }
  return id;
}

// ── Jamendo request throttle ──────────────────────────────────────────────
//
// Jamendo rate-limits request bursts (a handful of requests per second with no
// spacing trips it). EVERY Jamendo call in the CC path funnels through
// `jamendoRequest`, so one shared throttle here keeps the whole path under the
// limit: starts are at least `JAMENDO_MIN_GAP_MS` apart, and at most two
// responses may be in flight. Combined with the permanent `genre_artworks`
// cache (a genre's cover is fetched once, ever), steady-state load is near
// zero. The only burst is the one-time browse-grid artwork generation, which
// this spaces out safely. The gap is env-overridable (tests set it to 0).

/** The minimum gap in milliseconds between the starts of two Jamendo requests, read once at module load. */
const JAMENDO_MIN_GAP_MS = Number(process.env.JAMENDO_MIN_GAP_MS ?? 350);
/** How many Jamendo responses may be open at once. */
const JAMENDO_MAX_IN_FLIGHT = 2;
/** Caps the open Jamendo responses at `JAMENDO_MAX_IN_FLIGHT`. */
const limitJamendoRequest = createConcurrencyLimiter(JAMENDO_MAX_IN_FLIGHT);
/** Spaces the starts of Jamendo requests by `JAMENDO_MIN_GAP_MS`. */
const jamendoThrottle = createMinIntervalThrottle(JAMENDO_MIN_GAP_MS);

/**
 * Longest one Jamendo request may take, its answer included. Start spacing and
 * the in-flight cap keep slow requests from blocking every other Creative
 * Commons request behind them. Jamendo usually answers within a second and
 * rarely takes three; the bound stays well below the 15 s the site waits for a
 * resolve, so a stalled request costs one error rather than the whole queue.
 * Env-overridable so tests can expire it quickly.
 */
const JAMENDO_REQUEST_TIMEOUT_MS = Number(process.env.JAMENDO_REQUEST_TIMEOUT_MS ?? 8000);

/**
 * Runs `task` when the next start slot is due, spaced by
 * {@link JAMENDO_MIN_GAP_MS} from the previous start. The throttle tracks start
 * times rather than completion, so independent slow responses overlap. The
 * limiter holds at most {@link JAMENDO_MAX_IN_FLIGHT} responses open and frees
 * a slot on every outcome, so one failed request never wedges the queue.
 *
 * @param task - The request to run once its start slot is due.
 * @returns The task's result, settling as the task settles.
 */
function throttleJamendo<T>(task: () => Promise<T>): Promise<T> {
  return limitJamendoRequest(async () => {
    await jamendoThrottle.acquire();
    return task();
  });
}

/**
 * Signals that Jamendo could not answer: the connection failed, it replied with
 * a non-OK status, or its envelope reported a failure.
 *
 * Typed so callers can tell a third party being unavailable from this service
 * being broken, without matching on message text. A missing client id is not
 * one of these, because that is our own misconfiguration.
 */
export class JamendoUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "JamendoUnavailableError";
  }
}

/**
 * Tells the timeout of {@link fetchWithTimeout} apart from the other failures.
 * Its timer aborts with an `AbortError`, while the answer is awaited and while
 * it is read. The client passes no signal of its own, so nothing else aborts.
 *
 * @param error - What the request or the reading of its answer threw.
 * @returns Whether the request ran out of time.
 */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Low-level GET against a Jamendo endpoint. Adds `client_id`, `format=json`
 * and every provided param, then validates the response envelope. Every call
 * is funnelled through {@link throttleJamendo} so the CC path stays under
 * Jamendo's burst rate limit.
 *
 * @typeParam T - Element type of the `results` array.
 * @param path - Endpoint path below the API base, e.g. `/tracks`.
 * @param params - Query params; `undefined`/empty values are skipped.
 * @returns The parsed `results` array.
 * @throws {@link JamendoUnavailableError} in every case {@link jamendoRequest}
 *   names. Other errors indicate our own fault, such as a missing client id.
 */
export async function jamendoFetch<T>(path: string, params: Record<string, string | number | undefined>): Promise<T[]> {
  return (await jamendoRequest<T>(path, params)).results;
}

/**
 * Throttled GET returning the whole Jamendo envelope, so a caller can read the
 * header fields as well as the rows. {@link jamendoFetch} and
 * {@link fetchJamendoTracks} are built on it.
 *
 * @typeParam T - Element type of the `results` array.
 * @param path - Endpoint path below the API base, e.g. `/tracks`.
 * @param params - Query params; `undefined`/empty values are skipped.
 * @returns The validated envelope.
 * @throws {@link JamendoUnavailableError} on transport failure, on an answer
 *   that takes longer than {@link JAMENDO_REQUEST_TIMEOUT_MS} or cannot be read,
 *   on non-OK HTTP, or on an envelope reporting failure. Other errors indicate
 *   our own fault, such as a missing client id.
 */
async function jamendoRequest<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<JamendoEnvelope<T>> {
  return throttleJamendo(async () => {
    const url = new URL(`${JAMENDO_BASE}${path}`);
    url.searchParams.set("client_id", requireClientId());
    url.searchParams.set("format", "json");
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    const timedOutMessage = `Jamendo did not answer within ${JAMENDO_REQUEST_TIMEOUT_MS} ms`;
    let response: Response;
    try {
      response = await fetchWithTimeout(url.href, {}, JAMENDO_REQUEST_TIMEOUT_MS);
    } catch (error) {
      throw new JamendoUnavailableError(isTimeout(error) ? timedOutMessage : "Jamendo could not be reached", error);
    }
    if (!response.ok) {
      throw new JamendoUnavailableError(`Jamendo request failed: HTTP ${response.status}`);
    }
    let body: JamendoEnvelope<T>;
    try {
      body = (await response.json()) as JamendoEnvelope<T>;
    } catch (error) {
      throw new JamendoUnavailableError(
        isTimeout(error) ? timedOutMessage : "Jamendo's answer could not be read",
        error,
      );
    }
    if (body.headers.status !== "success") {
      throw new JamendoUnavailableError(`Jamendo API error: ${body.headers.error_message ?? body.headers.code}`);
    }
    return body;
  });
}

/**
 * Attempts one `/tracks` request gets before its answer is given up on.
 *
 * Jamendo's `/tracks` endpoint answers a large share of requests with an empty
 * `results` array under `status: "success"`, and the identical request returns
 * the real rows when it is repeated. Successive attempts fail close to
 * independently, so at the roughly two-in-five rate seen on that endpoint eight
 * attempts leave about one request in a thousand without an answer.
 */
const JAMENDO_TRACKS_ATTEMPTS = 8;

/**
 * GET `/tracks`, repeating the empty answers Jamendo gives in error.
 *
 * Requests `fullcount=true`, because a healthy answer then always carries
 * `results_fullcount` (`0` for a genuine miss) and a faulty empty one never
 * does. An answer that is empty and lacks it is repeated through the shared
 * throttle, up to {@link JAMENDO_TRACKS_ATTEMPTS} times. Every `/tracks` call of
 * the Jamendo client goes through here, because each of them otherwise reports
 * an existing track, tracklist or search hit as absent.
 *
 * A request that needed repeating is logged as a deviation, so the rate of
 * faulty answers stays visible while the users see none of them.
 *
 * @param params - Query params for `/tracks`, as for {@link jamendoFetch}.
 * @returns The rows of the first healthy answer, possibly empty.
 * @throws {@link JamendoUnavailableError} when no attempt brought a healthy
 *   answer, and on every failure {@link jamendoRequest} reports.
 */
export async function fetchJamendoTracks(
  params: Record<string, string | number | undefined>,
): Promise<JamendoTrackRaw[]> {
  for (let attempt = 1; attempt <= JAMENDO_TRACKS_ATTEMPTS; attempt += 1) {
    const envelope = await jamendoRequest<JamendoTrackRaw>("/tracks", { ...params, fullcount: "true" });
    if (envelope.results.length > 0 || envelope.headers.results_fullcount !== undefined) {
      if (attempt > 1) {
        log.deviation({
          component: "JamendoClient",
          errorCode: "MC-API-0001",
          operation: "jamendo_tracks",
          outcome: "faulty_empty_answers_repeated",
          faultyAnswers: attempt - 1,
        });
      }
      return envelope.results;
    }
  }
  throw new JamendoUnavailableError(`Jamendo answered /tracks without results ${JAMENDO_TRACKS_ATTEMPTS} times`);
}

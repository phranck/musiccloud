import { recordingDurationsAgree } from "../../../services/plugins/_shared/confidence.js";
import {
  isTrackSearchFallbackMatch,
  recordingSearchQuery,
} from "../../../services/plugins/_shared/track-search-query.js";
import type { NormalizedTrack, SearchQuery } from "../../../services/types.js";
import type { JsonValue } from "../canonical-json.js";
import type { DeleteRowOperation, RowValues } from "../manifest.js";
import { deletion, textOf } from "../planner-rows.js";
import { PlanFailure, type Planner, type PlanPorts } from "../planning.js";

/** The name this repair carries in its manifest. */
export const RECORDING_LINKS_REPAIR = "recording-links";

/** The issue that owns this repair. */
const RECORDING_LINKS_ISSUE = 768;

/**
 * Only destinations that a text search chose can be wrong about the recording. A link that matched by ISRC, or that is
 * the source itself, rests on an identifier, which the metadata guard does not judge.
 */
const JUDGED_MATCH_METHOD = "search";

/**
 * What the planner concluded about one stored destination.
 *
 * - `incompatible`: the service answered and reports a duration that cannot belong to the recording. Only this verdict removes a link.
 * - `unproven`: the guard rejects the answer for another reason, such as a title that names the version differently,
 *   while the duration agrees. The destination may well be the right performance, so it stays.
 * - `unverified`: the service did not answer, so nothing is known.
 */
export type LinkVerdict = "compatible" | "incompatible" | "unproven" | "unverified" | "identity-match";

/** One stored destination, the question asked about it, and the answer. Holds public provider metadata only. */
export interface LinkEvaluation {
  service: string;
  externalId: string | null;
  matchMethod: string;
  verdict: LinkVerdict;
  /** A short fixed code. A failed lookup never reports its message, which can carry addresses or tokens. */
  reason:
    | "identity-match"
    | "guard-accepted"
    | "duration-differs"
    | "guard-rejected-duration-agrees"
    | "no-external-id"
    | "lookup-failed";
  /** What the service reports right now, when it answered. */
  observed?: { title: string; artists: string[]; durationMs: number | null };
}

function optionalTextOf(row: RowValues, column: string): string | null {
  const value = row[column];
  return typeof value === "string" ? value : null;
}

/**
 * Builds the recording as the resolver saw it when it searched, from the stored track and its credits.
 *
 * @param track - The `tracks` row.
 * @param credits - The `track_artist_credits` rows in credit order.
 * @returns The source recording, from which the same search query is built as at resolve time.
 */
function sourceRecording(track: RowValues, credits: readonly RowValues[]): NormalizedTrack {
  const durationMs = track.duration_ms;
  const sourceUrl = optionalTextOf(track, "source_url");
  return {
    sourceService: textOf(track, "source_service") as NormalizedTrack["sourceService"],
    sourceId: textOf(track, "id"),
    title: textOf(track, "title"),
    artists: credits.map((credit) => textOf(credit, "credit_name")),
    albumName: optionalTextOf(track, "album_name") ?? undefined,
    durationMs: typeof durationMs === "number" ? durationMs : undefined,
    webUrl: sourceUrl ?? "",
  };
}

/**
 * Judges one stored destination against the recording with the shared guard.
 *
 * The service's own catalog is asked once for the id the link stores. The destination is incompatible only when the
 * service answered and its duration differs from the recording's beyond the bound the matching guard uses. Where the
 * guard rejects the answer for another reason while the duration agrees, the verdict is `unproven` and the link
 * stays. A failed lookup says nothing about the recording, so it is never a reason to remove a link.
 *
 * @param query - The recording's search query.
 * @param link - A `service_links` row.
 * @param ports - Lookup port.
 * @returns The verdict with its reason.
 */
export async function evaluateLink(query: SearchQuery, link: RowValues, ports: PlanPorts): Promise<LinkEvaluation> {
  const service = textOf(link, "service");
  const externalId = optionalTextOf(link, "external_id");
  const matchMethod = textOf(link, "match_method");
  const base = { service, externalId, matchMethod };
  if (matchMethod !== JUDGED_MATCH_METHOD) return { ...base, verdict: "identity-match", reason: "identity-match" };
  if (!externalId) return { ...base, verdict: "unverified", reason: "no-external-id" };
  let candidate: NormalizedTrack;
  try {
    candidate = await ports.fetchTrack(service, externalId);
  } catch {
    return { ...base, verdict: "unverified", reason: "lookup-failed" };
  }
  const observed = { title: candidate.title, artists: candidate.artists, durationMs: candidate.durationMs ?? null };
  if (isTrackSearchFallbackMatch(query, candidate))
    return { ...base, verdict: "compatible", reason: "guard-accepted", observed };
  if (!recordingDurationsAgree(query.durationMs, candidate.durationMs))
    return { ...base, verdict: "incompatible", reason: "duration-differs", observed };
  return { ...base, verdict: "unproven", reason: "guard-rejected-duration-agrees", observed };
}

/**
 * Plans the removal of the stored destinations of one recording whose duration cannot be the recording's.
 *
 * Each such link goes into the manifest as a `delete-row` operation, together with the identifier observations
 * its service reported, because those described the destination that is being removed. Recorded misses stay: they
 * record completed searches and agree with a removed link. The canonical recording, its credits, its short URLs and
 * every other destination are not touched.
 *
 * @param context - Rows of the restored copy, and the lookup port.
 * @param options - `track-id`: exactly one stored track id.
 * @returns The manifest, possibly without operations when every destination is compatible or unverified.
 * @throws {PlanFailure} For a missing or repeated `track-id`, or a track that is not in the copy.
 */
export const planRecordingLinks: Planner = async (context, options) => {
  const trackIds = options["track-id"] ?? [];
  if (trackIds.length !== 1) throw new PlanFailure("PLAN_OPTION_INVALID");
  const trackId = trackIds[0];

  const [track] = await context.query("SELECT * FROM tracks WHERE id = $1", [trackId]);
  if (!track) throw new PlanFailure("PLAN_ROW_MISSING");
  const credits = await context.query(
    'SELECT * FROM track_artist_credits WHERE track_id = $1 ORDER BY credit_position, id COLLATE "C"',
    [trackId],
  );
  const links = await context.query('SELECT * FROM service_links WHERE track_id = $1 ORDER BY service COLLATE "C"', [
    trackId,
  ]);
  const observations = await context.query(
    'SELECT * FROM track_external_ids WHERE track_id = $1 ORDER BY id COLLATE "C"',
    [trackId],
  );

  const recording = sourceRecording(track, credits);
  const query = recordingSearchQuery(recording);
  const evaluations: LinkEvaluation[] = [];
  const operations: DeleteRowOperation[] = [];
  for (const link of links) {
    const evaluation = await evaluateLink(query, link, context.ports);
    evaluations.push(evaluation);
    if (evaluation.verdict !== "incompatible") continue;
    operations.push(deletion("service_links", link));
    for (const observation of observations)
      if (observation.source_service === evaluation.service)
        operations.push(deletion("track_external_ids", observation));
  }

  const evidence: JsonValue = {
    trackId,
    recording: { title: recording.title, artists: recording.artists, durationMs: recording.durationMs ?? null },
    query: {
      title: query.title,
      artist: query.artist,
      artists: query.artists ?? [],
      durationMs: query.durationMs ?? null,
    },
    evaluations: evaluations as unknown as JsonValue,
    operations: operations.map((operation) => `${operation.table}/${operation.keyValue}`),
  };
  return {
    manifest: {
      formatVersion: 1,
      repair: RECORDING_LINKS_REPAIR,
      issue: RECORDING_LINKS_ISSUE,
      sourceArchiveSha256: context.sourceArchiveSha256,
      requiredMigrationHash: context.migrationHash,
      operations,
    },
    evidence,
  };
};

import { describe, expect, it } from "vitest";
import type { NormalizedTrack } from "../../../services/types.js";
import type { RowValues } from "../manifest.js";
import { evaluateLink, planRecordingLinks } from "../planners/recording-links.js";
import { type PlanContext, PlanFailure } from "../planning.js";
import { ARCHIVE_HASH, MIGRATION_HASH } from "./memory-row-store.js";

const track: RowValues = {
  id: "t1",
  title: "Child In Time - Live (1970)",
  duration_ms: 576000,
  source_service: "youtube",
  source_url: "https://www.youtube.com/watch?v=source",
  album_name: null,
  isrc: null,
};
const credits: RowValues[] = [{ id: "t1-credit-0", track_id: "t1", credit_name: "Deep Purple", credit_position: 0 }];
const link = (service: string, externalId: string | null, matchMethod: string): RowValues => ({
  id: `t1-${service}`,
  track_id: "t1",
  service,
  external_id: externalId,
  url: `https://${service}.example/${externalId}`,
  confidence: 0.7,
  match_method: matchMethod,
  created_at: "2026-08-20T15:17:21.825+00:00",
});
const observation = (service: string, value: string): RowValues => ({
  id: `t1-isrc-${service}-${value}`,
  track_id: "t1",
  id_type: "isrc",
  id_value: value,
  source_service: service,
  observed_at: "2026-08-20T15:17:21.825+00:00",
});

/** A provider answer for the same recording, with the duration and title the provider reports. */
function reported(service: string, durationMs: number, title = "Child in Time (Live)"): NormalizedTrack {
  return {
    sourceService: service as NormalizedTrack["sourceService"],
    sourceId: "1",
    title,
    artists: ["Deep Purple"],
    durationMs,
    webUrl: `https://${service}.example/1`,
  };
}

const rows: Record<string, RowValues[]> = {
  tracks: [track],
  track_artist_credits: credits,
  service_links: [
    link("apple-music", "a1", "search"),
    link("deezer", "3122917", "search"),
    link("spotify", "s1", "search"),
    link("youtube", "source", "isrc"),
  ],
  track_external_ids: [
    observation("apple-music", "GBCBR1100195"),
    observation("deezer", "GBDXG0600116"),
    observation("spotify", "GBDXG0600116"),
  ],
};

/** A context over fixed rows. The lookup answers per service, and records which services it was asked about. */
function contextOver(
  answers: Record<string, NormalizedTrack | Error>,
  data: Record<string, RowValues[]> = rows,
): { context: PlanContext; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    context: {
      migrationHash: MIGRATION_HASH,
      sourceArchiveSha256: ARCHIVE_HASH,
      ports: {
        async fetchTrack(service) {
          asked.push(service);
          const answer = answers[service];
          if (!answer || answer instanceof Error) throw answer ?? new Error("no answer");
          return answer;
        },
      },
      async query(sql) {
        const table = /FROM (\w+)/.exec(sql)?.[1] ?? "";
        return data[table] ?? [];
      },
    },
    // asked is returned alongside so a test can read it after the planner ran
  };
}

describe("planning the removal of destinations the guard rejects", () => {
  it("removes the links whose service reports an incompatible duration, and the observations that service made", async () => {
    const { context } = contextOver({
      "apple-music": reported("apple-music", 576000, "Child In Time - Live (1970)"),
      deezer: reported("deezer", 627000),
      spotify: reported("spotify", 627000),
    });
    const { manifest } = await planRecordingLinks(context, { "track-id": ["t1"] });
    expect(
      manifest.operations.map((operation) => `${operation.kind} ${operation.table}/${operation.keyValue}`),
    ).toEqual([
      "delete-row service_links/t1-deezer",
      "delete-row track_external_ids/t1-isrc-deezer-GBDXG0600116",
      "delete-row service_links/t1-spotify",
      "delete-row track_external_ids/t1-isrc-spotify-GBDXG0600116",
    ]);
  });

  it("records the stored rows exactly, so the runner can recognize them", async () => {
    const { context } = contextOver({
      "apple-music": reported("apple-music", 576000),
      deezer: reported("deezer", 627000),
      spotify: reported("spotify", 576000),
    });
    const { manifest } = await planRecordingLinks(context, { "track-id": ["t1"] });
    expect(manifest.operations[0]).toMatchObject({ kind: "delete-row", row: rows.service_links[1] });
    expect(manifest).toMatchObject({
      repair: "recording-links",
      issue: 768,
      sourceArchiveSha256: ARCHIVE_HASH,
      requiredMigrationHash: MIGRATION_HASH,
    });
  });

  it("keeps a link whose service reports the same recording within the duration bound, and plans nothing", async () => {
    const { context } = contextOver({
      "apple-music": reported("apple-music", 579000, "Child In Time - Live (1970)"),
      deezer: reported("deezer", 580000),
      spotify: reported("spotify", 572000),
    });
    const { manifest, evidence } = await planRecordingLinks(context, { "track-id": ["t1"] });
    expect(manifest.operations).toEqual([]);
    expect(JSON.stringify(evidence)).toContain("guard-accepted");
  });

  it("keeps a link that the guard rejects for its title while the duration agrees, and says so in the evidence", async () => {
    const { context } = contextOver({
      "apple-music": reported("apple-music", 576000, "Child In Time - Live (1970)"),
      deezer: reported("deezer", 574986, "Child In Time (Live: Granada TV Studios 14th July, 1970)"),
      spotify: reported("spotify", 576000),
    });
    const { manifest, evidence } = await planRecordingLinks(context, { "track-id": ["t1"] });
    expect(manifest.operations).toEqual([]);
    expect(JSON.stringify(evidence)).toContain("guard-rejected-duration-agrees");
  });

  it("does not remove a link because a lookup failed, and does not report the failure message", async () => {
    const { context } = contextOver({
      "apple-music": reported("apple-music", 576000),
      deezer: new Error("HTTP 503 from https://api.example/?access_token=secret-token"),
      spotify: reported("spotify", 576000),
    });
    const { manifest, evidence } = await planRecordingLinks(context, { "track-id": ["t1"] });
    expect(manifest.operations).toEqual([]);
    expect(JSON.stringify(evidence)).toContain("lookup-failed");
    expect(JSON.stringify(evidence)).not.toContain("secret-token");
  });

  it("does not ask a service about a link that rests on an identifier", async () => {
    const { context, asked } = contextOver({
      "apple-music": reported("apple-music", 576000),
      deezer: reported("deezer", 576000),
      spotify: reported("spotify", 576000),
    });
    await planRecordingLinks(context, { "track-id": ["t1"] });
    expect(asked).toEqual(["apple-music", "deezer", "spotify"]);
  });

  it("leaves a link without a stored catalog id unverified", async () => {
    const withoutId = { ...rows, service_links: [link("deezer", null, "search")] };
    const { context, asked } = contextOver({}, withoutId);
    const { manifest, evidence } = await planRecordingLinks(context, { "track-id": ["t1"] });
    expect(manifest.operations).toEqual([]);
    expect(asked).toEqual([]);
    expect(JSON.stringify(evidence)).toContain("no-external-id");
  });

  it("needs exactly one track id, and a track that exists", async () => {
    const { context } = contextOver({});
    await expect(planRecordingLinks(context, {})).rejects.toMatchObject({ code: "PLAN_OPTION_INVALID" });
    await expect(planRecordingLinks(context, { "track-id": ["t1", "t2"] })).rejects.toMatchObject({
      code: "PLAN_OPTION_INVALID",
    });
    const empty = contextOver({}, { ...rows, tracks: [] });
    await expect(planRecordingLinks(empty.context, { "track-id": ["t1"] })).rejects.toBeInstanceOf(PlanFailure);
  });
});

describe("judging one link", () => {
  const query = {
    title: "Child In Time - Live (1970)",
    artist: "Deep Purple",
    artists: ["Deep Purple"],
    durationMs: 576000,
  };

  /** The verdict for a service that reports the given title and duration. */
  const verdictFor = (durationMs: number, title: string) =>
    evaluateLink(query, link("deezer", "1", "search"), {
      fetchTrack: async () => reported("deezer", durationMs, title),
    });

  it("calls an answer incompatible when its duration cannot be the recording's", async () => {
    expect(await verdictFor(627000, "Child in Time (Live)")).toMatchObject({
      verdict: "incompatible",
      reason: "duration-differs",
    });
  });

  it("measures the duration bound as the matching guard does, 10 seconds inclusive", async () => {
    expect(await verdictFor(586000, "Child in Time (Live)")).toMatchObject({ verdict: "compatible" });
    expect(await verdictFor(586001, "Child in Time (Live)")).toMatchObject({ verdict: "incompatible" });
    expect(await verdictFor(566000, "Child in Time (Live)")).toMatchObject({ verdict: "compatible" });
    expect(await verdictFor(565999, "Child in Time (Live)")).toMatchObject({ verdict: "incompatible" });
  });

  it("leaves an answer unproven when only the title or version differs and the duration agrees", async () => {
    expect(await verdictFor(576000, "Child in Time (Remastered 2012)")).toMatchObject({
      verdict: "unproven",
      reason: "guard-rejected-duration-agrees",
    });
    expect(await verdictFor(574986, "Child In Time (Live: Granada TV Studios 14th July, 1970)")).toMatchObject({
      verdict: "unproven",
    });
  });
});

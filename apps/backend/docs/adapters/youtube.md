# YouTube Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves YouTube video URLs and artist/channel URLs through the YouTube Data API
v3. YouTube Music links are derived from YouTube where appropriate.

## Auth And Env

Required env:

- `YOUTUBE_API_KEY`

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`. Missing `YOUTUBE_API_KEY` makes the adapter unavailable.

## Resolve Flows

- Video URLs support `youtube.com/watch`, `youtube.com/shorts`, `youtu.be`, and
  `music.youtube.com/watch`.
- Artist/channel URLs route through artist capabilities.
- Search pins music-category filtering where supported.

## Operational Notes

YouTube metadata is video-centric. Title cleanup and channel/artist inference
are important for cross-service matching.

## Troubleshooting

- Quota or 403 errors usually point to API key or Google Cloud project limits.
- If search returns non-music videos, inspect category and query construction.
- If YouTube Music derivation fails, check resolver link derivation rather than
  only the adapter.

## Verification

- `pnpm --filter @musiccloud/backend test:run youtube`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever YouTube API key handling, video parsing, Music
derivation, search filtering, or artist/channel support changes.

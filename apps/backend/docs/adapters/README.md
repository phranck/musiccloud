# Adapter Runbooks

Every registered resolver plugin in `apps/backend/src/services/plugins/registry.ts`
must have a runbook in this directory.

Runbooks are operational documentation, not archive notes. Whenever adapter
code, credentials, enablement, URL detection, API assumptions, error handling,
or test coverage changes, update the matching runbook in the same change.

Run the coverage check with:

```bash
pnpm --filter @musiccloud/backend docs:adapter-runbooks
```

Required sections:

- `Last reviewed:`
- `## Maintenance`
- `## Verification`

Current runbooks:

- `apple-music.md`
- `audiomack.md`
- `audius.md`
- `bandcamp.md`
- `beatport.md`
- `boomplay.md`
- `bugs.md`
- `deezer.md`
- `jiosaavn.md`
- `kkbox.md`
- `melon.md`
- `musicbrainz.md`
- `napster.md`
- `netease.md`
- `pandora.md`
- `qobuz.md`
- `qqmusic.md`
- `soundcloud.md`
- `spotify.md`
- `tidal.md`
- `youtube.md`

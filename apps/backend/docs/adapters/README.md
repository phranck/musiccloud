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

A plugin's hosts live in `MUSIC_LINK_SOURCES` in `packages/shared/src/music-links.ts`. The backend fetches a link only from a host listed there, and the web input submits a pasted link only when its host is listed. `apps/backend/src/__tests__/music-links-plugins.test.ts` fails for a plugin without an entry and for a sample link in `music-link-samples.ts` whose host is missing.

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

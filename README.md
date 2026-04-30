<p align="center">
  <a href="https://astro.build"><img alt="Astro" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/astro?filename=apps%2Ffrontend%2Fpackage.json&label=astro&color=b266e6&style=flat"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/phranck/musiccloud?label=license&color=6986ff&style=flat"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/dev/typescript?label=typescript&color=15c0ea&style=flat"></a>
  <a href="https://react.dev"><img alt="React" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/react?filename=apps%2Ffrontend%2Fpackage.json&label=react&color=00dfc0&style=flat"></a>
  <a href="https://fastify.dev"><img alt="Fastify" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/fastify?filename=apps%2Fbackend%2Fpackage.json&label=fastify&color=70e55a&style=flat"></a>
  <a href="https://github.com/phranck/musiccloud/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/phranck/musiccloud/ci.yml?branch=main&label=CI&color=c2e74f&style=flat"></a>
  <a href="https://biomejs.dev"><img alt="Biome" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/dev/@biomejs/biome?label=biome&color=f6c24c&style=flat"></a>
</p>

<img width="1024" height="256" alt="email-header" src="https://github.com/user-attachments/assets/557486dc-5934-431f-bf22-6db8d1d369a5" />

# musiccloud.io

Paste a music link from one streaming service, get a universal share URL that opens the same track or album on every other service the listener has.

Live at [musiccloud.io](https://musiccloud.io).

## About this repository

This repository is published for **transparency**. It is not intended as a self-hosting guide, and there is no setup documentation or support for running your own instance. If you want to use musiccloud, head to [musiccloud.io](https://musiccloud.io).

## What it does

- **Universal share links.** Paste a link from any supported service and get one short URL that opens the same track or album on every other service your listeners use.
- **Cross-service search.** Search by song title or artist and see matching results across services side by side.
- **Genre discovery.** Browse music by genre tags and discover tracks across services.
- **Rich link previews.** Every share link renders with proper OpenGraph previews on social media and messengers.
- **Native Apple app.** macOS, iOS and iPadOS app with a share extension, so you can create share links right from your streaming app of choice.
- **Public API.** Third parties can integrate musiccloud through a [documented API](https://api.musiccloud.io/docs).

## Documentation

All public documentation lives in [`docs/`](docs/). The detailed
architecture write-ups are PDF documents typeset from LaTeX
sources alongside their D2 diagram sources.

- [Resolver Flow](docs/resolve-flow/) — architecture and data flow
  through the resolve layer. PDF: [Deutsch](docs/resolve-flow/de/resolve-flow.pdf) / [English](docs/resolve-flow/en/resolve-flow.pdf).
- [Cache architecture](docs/cache-architecture.md)
- [Crawler architecture](docs/crawler-architecture.md)
- [Artist composition](docs/artist-composition-architecture.md)
- Runbooks: [Spotify](docs/spotify-runbook.md), [MusicBrainz](docs/musicbrainz-runbook.md)

## Supported streaming services

Apple Music, Audiomack, Audius, Bandcamp, Beatport, Boomplay, Bugs, Deezer, JioSaavn, KKBOX, Melon, Napster, Netease, Pandora, QQ Music, Qobuz, SoundCloud, Spotify, Tidal, YouTube.

## License

Published under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html).

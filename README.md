[![Astro](https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud.io/astro?filename=apps%2Ffrontend%2Fpackage.json&label=astro&color=e40303&style=flat)](https://astro.build)
[![Biome](https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud.io/dev/@biomejs/biome?label=biome&color=ff8c00&style=flat)](https://biomejs.dev)
[![CI](https://img.shields.io/github/actions/workflow/status/phranck/musiccloud.io/ci.yml?branch=main&label=CI&color=ffd700&style=flat)](https://github.com/phranck/musiccloud.io/actions/workflows/ci.yml)
[![Fastify](https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud.io/fastify?filename=apps%2Fbackend%2Fpackage.json&label=fastify&color=008026&style=flat)](https://fastify.dev)
[![React](https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud.io/react?filename=apps%2Ffrontend%2Fpackage.json&label=react&color=0057b7&style=flat)](https://react.dev)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud.io/dev/typescript?label=typescript&color=4b0082&style=flat)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/github/license/phranck/musiccloud.io?label=license&color=9400d3&style=flat)](LICENSE)

# musiccloud.io

Paste a music link from one streaming service, get a universal share URL that opens the same track or album on every other service the listener has.

Live at [https://musiccloud.io](https://musiccloud.io).

## What it does

- **URL resolution.** Paste a Spotify, Apple Music, YouTube, Tidal, Deezer, SoundCloud, Qobuz, Bandcamp, Beatport, Audius, Pandora, JioSaavn, Boomplay, Audiomack, Netease, QQ Music, Melon, Bugs, KKBOX, or Napster link and the backend resolves the track or album across all supported services, preferring ISRC/UPC matches and falling back to scored text search with confidence filtering.
- **Text search.** Type a song title or artist and get cross-service candidates with disambiguation when the top match is not confident enough.
- **Genre discovery.** Browse by Last.fm tags, resolve any tag to a representative cross-service set of tracks.
- **Share pages.** Every resolved result gets a short URL with server-side-rendered OpenGraph/Twitter meta for rich link previews.
- **Admin dashboard.** Analytics (via Umami), track/album management, user administration, content pages, media library.
- **Public API with Swagger UI** for third-party integration.

## Supported streaming services

Deezer, Audius, SoundCloud, Pandora, Qobuz, Boomplay, Bandcamp, Audiomack, Netease, QQ Music, Melon, Bugs, JioSaavn, Beatport, Spotify, Apple Music, YouTube, Tidal, KKBOX, Napster.

Each service is implemented as a plugin under `apps/backend/src/services/plugins/*`. Adding a new one means implementing a `ServiceAdapter` and registering it in the plugin manifest.

## Tech stack

- **Monorepo** via npm workspaces.
- **Backend:** Fastify 5 + TypeScript + Drizzle ORM + PostgreSQL 16. Compiled with tsup. Swagger/OpenAPI via `@fastify/swagger`.
- **Frontend:** Astro 5 (SSR, Node adapter) + React 19 islands + Tailwind 4.
- **Dashboard:** React 19 + Vite + UnoCSS + TanStack Query.
- **Shared package** (`packages/shared`): API types, endpoint paths, error codes.
- **Tooling:** Biome 2.4 (lint + format), Vitest (675 tests across 33 files), drizzle-kit migrations.

## Repository layout

```
apps/
  Apple/            Swift native app (macOS/iOS/iPadOS) + Share Extension
  backend/          Fastify API (resolve, share, admin, analytics, swagger)
  dashboard/        Admin React SPA (analytics, users, media, content)
  frontend/         Astro SSR site (landing, search, share pages)
packages/
  shared/           TypeScript types + API contracts shared across apps
drizzle.config.postgres.ts
zerops.yml          Hosting config
```

## Getting started

### Prerequisites

- Node.js >= 20
- npm >= 10
- PostgreSQL 16 (the project uses Drizzle migrations; local dev typically runs PG in Docker on port `5433`)

## License

[MIT](LICENSE).
